const express=require('express'),mysql=require('mysql2/promise'),cors=require('cors'),path=require('path'),fs=require('fs'),os=require('os'),crypto=require('crypto'),bcrypt=require('bcryptjs');
const app=express(),PORT=process.env.PORT||8080,DIR=__dirname;
app.use(cors());app.use(express.json({limit:'10mb'}));app.use(express.static(DIR));

// ============================================================
// AUTH: session tokens + password hashing
// ============================================================
// In-memory session store: token -> {userId, expires}. Lost on restart (users
// just have to log in again) — acceptable trade-off for a single-process app
// and far better than the previous state, which had NO server-side auth at all
// (anyone who knew the URL could GET/POST the full dataset, passwords included).
const SESSIONS=new Map();
const SESSION_TTL_MS=12*3600*1000; // 12h
function makeToken(){return crypto.randomBytes(24).toString('hex');}
function createSession(userId){const token=makeToken();SESSIONS.set(token,{userId,expires:Date.now()+SESSION_TTL_MS});return token;}
function getSession(token){
  const s=SESSIONS.get(token);
  if(!s)return null;
  if(Date.now()>s.expires){SESSIONS.delete(token);return null;}
  return s;
}
function isHashed(pw){return typeof pw==='string'&&/^\$2[aby]?\$/.test(pw);}
function hashPassword(pw){return bcrypt.hashSync(String(pw),10);}
function verifyPassword(plain,stored){
  if(!stored)return false;
  if(isHashed(stored))return bcrypt.compareSync(String(plain),stored);
  return String(plain)===String(stored); // legacy plaintext (pre-migration) — matched once, then re-hashed by the caller
}
async function requireAuth(req,res,next){
  const hdr=req.headers.authorization||'';
  const token=hdr.startsWith('Bearer ')?hdr.slice(7):null;
  const session=token&&getSession(token);
  if(!session)return res.status(401).json({ok:false,error:'auth_required'});
  try{
    let user=null;
    if(db){
      const[rows]=await db.execute('SELECT id,name,role,product,email,pos,access FROM users WHERE id=?',[session.userId]);
      if(rows[0]){user=rows[0];user.access=pj(user.access,[]);}
    }else{
      const d=lf();
      user=d&&d.users&&d.users.find(u=>u.id===session.userId);
    }
    if(!user)return res.status(401).json({ok:false,error:'user_not_found'});
    req.authUser={id:user.id,name:user.name,role:user.role,product:user.product||'',access:pj(user.access,[])};
    next();
  }catch(e){res.status(401).json({ok:false,error:'auth_failed'});}
}
// ---- Server-side mirror of the client's role matrix (PMO_Control_Center.html ROLE_SCOPE/ROLE_EDIT/ROLE_MANAGE_USERS) ----
// Kept in sync manually — if the client matrix changes, update here too.
const ROLE_SCOPE={admin:'all',ceo:'all',head:'own',manager:'own',senior:'own',member:'own'};
const ROLE_EDIT={admin:true,ceo:true,head:true,manager:true,senior:false,member:false};
const ROLE_MANAGE_USERS={admin:true,ceo:true,head:false,manager:false,senior:false,member:false};
async function loadCustomRoles(){
  try{
    if(db){const[rows]=await db.execute('SELECT settingValue FROM app_settings WHERE settingKey=?',['customRoles']);return rows[0]?pj(rows[0].settingValue,[]):[];}
    const d=lf();return (d&&d.customRoles)||[];
  }catch(e){return [];}
}
function findCustomRole(customRoles,roleId){return (customRoles||[]).find(r=>r.id===roleId);}
function scopeOf(customRoles,roleId){const cr=findCustomRole(customRoles,roleId);if(cr)return cr.scope||'own';return ROLE_SCOPE[roleId]||'own';}
function editOf(customRoles,roleId){const cr=findCustomRole(customRoles,roleId);if(cr)return !!cr.canEdit;return !!ROLE_EDIT[roleId];}
function manageUsersOf(customRoles,roleId){const cr=findCustomRole(customRoles,roleId);if(cr)return !!cr.manageUsers;return !!ROLE_MANAGE_USERS[roleId];}
function norm(s){return String(s||'').trim().toLowerCase();}
function userCanSeeProject(authUser,p,customRoles){
  if(scopeOf(customRoles,authUser.role)==='all')return true;
  if(norm(p.owner)===norm(authUser.name))return true;
  const prods=String(authUser.product||'').split(',').map(norm);
  if(prods.indexOf(norm(p.name))>=0)return true;
  const team=Array.isArray(p.team)?p.team:pj(p.team,[]);
  if(team&&team.indexOf(authUser.id)>=0)return true;
  return false;
}
function userCanWriteProject(authUser,p,customRoles){
  if(manageUsersOf(customRoles,authUser.role))return true;
  if(editOf(customRoles,authUser.role))return userCanSeeProject(authUser,p,customRoles);
  return norm(p.owner)===norm(authUser.name);
}
function userCanWriteTask(authUser,t,projectsById,customRoles){
  if(manageUsersOf(customRoles,authUser.role))return true;
  if(editOf(customRoles,authUser.role)){
    const proj=t.projectId?projectsById[t.projectId]:null;
    return !proj||userCanSeeProject(authUser,proj,customRoles);
  }
  if(norm(t.owner)===norm(authUser.name))return true;
  const proj=t.projectId?projectsById[t.projectId]:null;
  if(proj&&norm(proj.owner)===norm(authUser.name))return true;
  return false;
}
// Read-visibility for a task — mirrors the client's activeTasks() exactly:
// a task with no projectId is always visible; otherwise visibility is
// inherited from the project's visibility (userCanSeeProject). If the
// referenced project doesn't exist at all, the task is hidden (same as the
// client, where an orphaned projectId never matches activeIds[...]).
function userCanSeeTask(authUser,t,projectsById,customRoles){
  if(scopeOf(customRoles,authUser.role)==='all')return true;
  if(!t.projectId)return true;
  const proj=projectsById[t.projectId];
  if(!proj)return false;
  return userCanSeeProject(authUser,proj,customRoles);
}
const DB={host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT)||3306,user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'pmo_db',charset:'utf8mb4',waitForConnections:true,connectionLimit:10,queueLimit:0};
let db=null;
async function connectDB(){
  try{
    const pool=mysql.createPool(DB);
    await pool.execute('SELECT 1');
    db=pool;
    console.log('  [DB] MySQL connected (pool)!');
    await ensureChatTable();
    await seedDB();
  }catch(e){
    console.log('  [DB] MySQL not available, using file: pmo_data.json');
    db=null;
  }
}
async function columnExists(table,col){
  try{
    const[rows]=await db.execute(
      'SELECT COUNT(*) as cnt FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?',
      [table,col]
    );
    return rows[0].cnt>0;
  }catch(e){console.log('  [DB] columnExists check failed for '+table+'.'+col+':',e.message);return true;} // assume exists to avoid repeated failing ALTERs
}
async function ensureColumn(table,col,def){
  try{
    if(await columnExists(table,col))return;
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    console.log('  [DB] Added column '+table+'.'+col);
  }catch(e){console.log('  [DB] '+table+'.'+col+' col:',e.message);}
}
async function ensureChatTable(){
  if(!db)return;
  try{
    await db.execute(`CREATE TABLE IF NOT EXISTS chat_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      role VARCHAR(10) NOT NULL,
      content TEXT NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user (userId)
    )`);
  }catch(e){console.log('  [DB] chat_history:',e.message);}
  // Use information_schema checks instead of "ADD COLUMN IF NOT EXISTS" — that syntax silently
  // fails on MySQL <8.0.29 / older MariaDB, which left columns missing and broke every save
  // that referenced them (the whole row INSERT would throw "Unknown column").
  await ensureColumn('tasks','subtasks','JSON NULL DEFAULT NULL');
  await ensureColumn('projects','metrics','JSON NULL DEFAULT NULL');
  await ensureColumn('projects','metricData','JSON NULL DEFAULT NULL');
  await ensureColumn('projects','deleted','TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumn('projects','deletedAt','VARCHAR(40) NULL DEFAULT NULL');
  // Team field (explicit list of user ids who can see a product's tasks/metrics)
  await ensureColumn('projects','team','JSON NULL DEFAULT NULL');
  // Bi-weekly sprint check-in history (tasks-done count + KPI snapshot per 14-day cycle)
  await ensureColumn('projects','biweeklyLog','JSON NULL DEFAULT NULL');
  // Custom roles (admin-defined, static-ish): stored as a single JSON blob keyed row
  try{await db.execute(`CREATE TABLE IF NOT EXISTS app_settings (
    settingKey VARCHAR(64) PRIMARY KEY,
    settingValue JSON NULL
  )`);}catch(e){console.log('  [DB] app_settings:',e.message);}
}
async function seedDB(){
  try{
    const[rows]=await db.execute('SELECT COUNT(*) as cnt FROM users');
    if(rows[0].cnt>0){console.log('  [DB] Already seeded, skipping.');return;}
    console.log('  [DB] Seeding default data...');
    for(const u of DEFAULT_DATA.users){
      await db.execute('INSERT IGNORE INTO users(id,name,role,product,email,pos,password,access,added)VALUES(?,?,?,?,?,?,?,?,?)',
        [u.id,u.name,u.role,u.product,u.email,u.pos,u.password,JSON.stringify(u.access),u.added]);
    }
    for(const p of DEFAULT_DATA.projects){
      await db.execute('INSERT IGNORE INTO projects(id,name,stage,status,owner,ownerColor,northStar,budgetPlan,budgetFact,deadline,progress,yearlyGoal,kpis,issues,monthlyPlan,description)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [p.id,p.name,p.stage,p.status,p.owner,p.ownerColor,p.northStar,p.budgetPlan,p.budgetFact,p.deadline,p.progress,p.yearlyGoal,JSON.stringify(p.kpis),JSON.stringify(p.issues),JSON.stringify(p.monthlyPlan),p.desc]);
    }
    for(const t of DEFAULT_DATA.tasks){
      await db.execute('INSERT IGNORE INTO tasks(id,projectId,title,owner,deadline,status,priority,sprint,goal,progress,kpis,issues,description)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [t.id,t.projectId,t.title,t.owner,t.deadline,t.status,t.priority,t.sprint,t.goal,t.progress||null,JSON.stringify(t.kpis),JSON.stringify(t.issues),t.desc]);
    }
    console.log('  [DB] Seeded: '+DEFAULT_DATA.users.length+' users, '+DEFAULT_DATA.projects.length+' projects, '+DEFAULT_DATA.tasks.length+' tasks');
  }catch(e){
    console.log('  [DB] Seed error:',e.message);
  }
}
const DATA_DIR=process.env.DATA_DIR||path.join(DIR,'data');
if(!fs.existsSync(DATA_DIR)){try{fs.mkdirSync(DATA_DIR,{recursive:true});}catch(e){}}
const FILE=path.join(DATA_DIR,'pmo_data.json');
const DEFAULT_DATA={users:[{id:1,name:"Нозим А.",role:"ceo",product:"Все продукты",email:"nozim@company.uz",pos:"CEO",password:"nozim",access:["overview","projects","kanban","gantt","calendar","plans","tasks","collab","admin"],added:"2026-01-01"},{id:2,name:"Алия Ю.",role:"manager",product:"Б2Б, Prime Stream",email:"aliya@company.uz",pos:"Product Manager",password:"aliya",access:["overview","projects","kanban","gantt","calendar","plans","tasks","collab"],added:"2026-01-01"},{id:3,name:"Шахзод Р.",role:"manager",product:"Синерама",email:"shaxzod@company.uz",pos:"Product Manager",password:"shaxzod",access:["overview","projects","kanban","gantt","calendar","plans","tasks","collab"],added:"2026-01-01"},{id:4,name:"Тохир Ю.",role:"manager",product:"Т-Клоуд",email:"toxir@company.uz",pos:"Product Manager",password:"toxir",access:["overview","projects","kanban","gantt","calendar","plans","tasks","collab"],added:"2026-01-01"},{id:5,name:"Акмал Х.",role:"manager",product:"Финанс",email:"akmal@company.uz",pos:"CFO",password:"akmal",access:["overview","projects","kanban","gantt","calendar","plans","tasks","collab"],added:"2026-01-01"},{id:6,name:"Дильноза М.",role:"member",product:"Б2Б",email:"dilnoza@company.uz",pos:"Менеджер B2B",password:"dilnoza",access:["tasks","calendar","collab"],added:"2026-06-05"},{id:7,name:"Сардор Р.",role:"member",product:"Б2Б",email:"sardor@company.uz",pos:"Менеджер B2B",password:"sardor",access:["tasks","calendar","collab"],added:"2026-06-05"},{id:8,name:"Аброр Н.",role:"member",product:"Б2Б",email:"abror@company.uz",pos:"Менеджер B2B регионы",password:"abror",access:["tasks","calendar","collab"],added:"2026-06-05"},{id:9,name:"Малика С.",role:"member",product:"Prime Stream",email:"malika@company.uz",pos:"SMM-менеджер",password:"malika",access:["tasks","calendar","collab"],added:"2026-06-05"}],projects:[{id:1,name:"Турон Телеком — Интернет",stage:"Разработка",status:"on_track",owner:"Нозим А.",ownerColor:"#4f6ef7",northStar:"+25% доход к концу 2026",budgetPlan:0,budgetFact:0,deadline:"2026-12-31",progress:20,yearlyGoal:"Увеличить доход на +25% через рост ААБ и снижение оттока",monthlyPlan:[{month:"Янв",goal:null,actual:null,notes:""},{month:"Фев",goal:null,actual:null,notes:""},{month:"Мар",goal:null,actual:null,notes:""},{month:"Апр",goal:null,actual:null,notes:""},{month:"Май",goal:null,actual:null,notes:""},{month:"Июн",goal:null,actual:null,notes:""},{month:"Июл",goal:null,actual:null,notes:""},{month:"Авг",goal:null,actual:null,notes:""},{month:"Сен",goal:null,actual:null,notes:""},{month:"Окт",goal:null,actual:null,notes:""},{month:"Ноя",goal:null,actual:null,notes:""},{month:"Дек",goal:null,actual:null,notes:""}],kpis:[{name:"ААБ",plan:"—",fact:"—",ok:null},{name:"Приход",plan:"—",fact:"—",ok:null},{name:"Рост дохода YoY",plan:"+25%",fact:"—",ok:null}],issues:[],desc:"Интернет-направление Турон Телеком."},{id:2,name:"Б2Б",stage:"Планирование",status:"critical",owner:"Алия Ю.",ownerColor:"#7c3aed",northStar:"Рост ААБ и суммы договоров",budgetPlan:1000000,budgetFact:100,deadline:"2026-12-31",progress:20,yearlyGoal:"Рост ААБ через новые подключения и суммы через доп.услуги",monthlyPlan:[{month:"Янв",goal:null,actual:null,notes:""},{month:"Фев",goal:null,actual:null,notes:""},{month:"Мар",goal:null,actual:null,notes:""},{month:"Апр",goal:null,actual:null,notes:""},{month:"Май",goal:null,actual:null,notes:""},{month:"Июн",goal:null,actual:null,notes:""},{month:"Июл",goal:null,actual:null,notes:""},{month:"Авг",goal:null,actual:null,notes:""},{month:"Сен",goal:null,actual:null,notes:""},{month:"Окт",goal:null,actual:null,notes:""},{month:"Ноя",goal:null,actual:null,notes:""},{month:"Дек",goal:null,actual:null,notes:""}],kpis:[{name:"ААБ (новые подключения)",plan:"—",fact:"—",ok:null},{name:"Сумма договоров",plan:"—",fact:"—",ok:null},{name:"Удержание (%)",plan:"—",fact:"—",ok:null}],issues:[],desc:"B2B направление: удержание, расширение покрытия, работа с бизнес-центрами, систематизация регионов."},{id:3,name:"Prime Stream",stage:"Разработка",status:"on_track",owner:"Алия Ю.",ownerColor:"#06b6d4",northStar:"Рост прихода",budgetPlan:0,budgetFact:0,deadline:"2026-12-31",progress:25,yearlyGoal:"Рост через подписки, реферальную программу, digital и коллаборации",monthlyPlan:[{month:"Янв",goal:null,actual:null,notes:""},{month:"Фев",goal:null,actual:null,notes:""},{month:"Мар",goal:null,actual:null,notes:""},{month:"Апр",goal:null,actual:null,notes:""},{month:"Май",goal:null,actual:null,notes:""},{month:"Июн",goal:null,actual:null,notes:""},{month:"Июл",goal:null,actual:null,notes:""},{month:"Авг",goal:null,actual:null,notes:""},{month:"Сен",goal:null,actual:null,notes:""},{month:"Окт",goal:null,actual:null,notes:""},{month:"Ноя",goal:null,actual:null,notes:""},{month:"Дек",goal:null,actual:null,notes:""}],kpis:[{name:"Приход",plan:"—",fact:"—",ok:null},{name:"Подписчики",plan:"—",fact:"—",ok:null},{name:"Рефералы",plan:"—",fact:"—",ok:null}],issues:[],desc:"Стриминговый сервис. Проекты: подписка, рефералка, digital/SMM, коллаборации."},{id:4,name:"Синерама",stage:"Инициация",status:"on_track",owner:"Шахзод Р.",ownerColor:"#ec4899",northStar:"MAU и Приход",budgetPlan:0,budgetFact:0,deadline:"2026-12-31",progress:20,yearlyGoal:"Рост MAU, прихода, Турон юзерс и ARPU",monthlyPlan:[{month:"Янв",goal:null,actual:null,notes:""},{month:"Фев",goal:null,actual:null,notes:""},{month:"Мар",goal:null,actual:null,notes:""},{month:"Апр",goal:null,actual:null,notes:""},{month:"Май",goal:null,actual:null,notes:""},{month:"Июн",goal:null,actual:null,notes:""},{month:"Июл",goal:null,actual:null,notes:""},{month:"Авг",goal:null,actual:null,notes:""},{month:"Сен",goal:null,actual:null,notes:""},{month:"Окт",goal:null,actual:null,notes:""},{month:"Ноя",goal:null,actual:null,notes:""},{month:"Дек",goal:null,actual:null,notes:""}],kpis:[{name:"MAU",plan:"—",fact:"—",ok:null},{name:"Приход",plan:"—",fact:"—",ok:null},{name:"Турон юзерс",plan:"—",fact:"—",ok:null},{name:"ARPU",plan:"—",fact:"—",ok:null}],issues:[],desc:"Ключевые метрики: MAU, приход, Турон юзерс, ARPU."},{id:5,name:"Т-Клоуд",stage:"Разработка",status:"on_track",owner:"Тохир Ю.",ownerColor:"#22c55e",northStar:"Выручка 100 млн сум/мес к декабрю 2026 (рост x6 за 6 месяцев)",budgetPlan:0,budgetFact:0,deadline:"2026-12-31",progress:15,yearlyGoal:"Трансформация T-Cloud из хостинг-провайдера в полноценную B2B Cloud Ecosystem. 6 направлений: кросс-продажи ISP, аренда серверов (Bare Metal), Backup SaaS, партнёрская экосистема (TuronID), 1C Cloud (пилот), YouTube-брендинг",monthlyPlan:[{month:"Янв",goal:null,actual:null,notes:""},{month:"Фев",goal:null,actual:null,notes:""},{month:"Мар",goal:null,actual:null,notes:""},{month:"Апр",goal:null,actual:null,notes:""},{month:"Май",goal:null,actual:null,notes:""},{month:"Июн",goal:"Старт: B2B кросс-продажи ISP, 1-й клиент аренды серверов, YouTube запуск",actual:null,notes:"Текущая выручка: 15–16 млн сум/мес"},{month:"Июл",goal:"Backup SaaS: выбор платформы; TuronID интеграция; 1С Cloud: исследование; 2–4 YouTube видео",actual:null,notes:""},{month:"Авг",goal:"Backup SaaS: MVP тест; аренда серверов: 2–3 договора; партнёрские пакеты",actual:null,notes:""},{month:"Сен",goal:"Backup SaaS: 3–5 пилотных клиентов; аренда: 5+ серверов; 1C Cloud: тест с клиентами",actual:null,notes:""},{month:"Окт",goal:"Масштабирование кросс-продаж ISP; аренда: 10+ серверов; реферальные продажи",actual:null,notes:""},{month:"Ноя",goal:"Backup SaaS: коммерческий запуск + bundle VPS+Backup; аренда: 10–15 серверов",actual:null,notes:""},{month:"Дек",goal:"Цель: 100 млн сум/мес. Аренда: 15 серверов; bundle-продукты; 1C Cloud: план на 2027",actual:null,notes:"Целевая выручка: 100 млн сум/мес"}],kpis:[{name:"Выручка/мес",plan:"100 млн сум",fact:"15–16 млн сум",ok:null},{name:"Рост выручки",plan:"x6",fact:"—",ok:null},{name:"Активных B2B клиентов",plan:"30+",fact:"—",ok:null},{name:"Новых клиентов/мес",plan:"5–10",fact:"—",ok:null},{name:"Серверов в аренде",plan:"10–15",fact:"—",ok:null},{name:"Backup SaaS клиентов",plan:"30–50",fact:"—",ok:null},{name:"YouTube подписчиков",plan:"500–1000",fact:"—",ok:null},{name:"1C Cloud пилот",plan:"1–2 клиента",fact:"—",ok:null}],issues:[{title:"Кадровый ресурс (4 чел.) — высокий риск",desc:"Недостаточный кадровый ресурс. Меры: аутсорс-специалисты, автоматизация процессов",priority:"high"},{title:"Расторжение договора аренды клиентом",desc:"Средний риск. Меры: договор 6–12 мес. + депозит 50%",priority:"medium"},{title:"Технические сбои в Backup SaaS",desc:"Средний риск. Меры: обязательное тестирование restore на этапе MVP",priority:"medium"},{title:"Низкая конверсия кросс-продаж ISP",desc:"Средний риск. Меры: усиление бонусной системы, активация альтернативных каналов",priority:"medium"}],desc:"T-Cloud.uz — облачные решения на базе ISP-инфраструктуры Turon. Услуги: VPS, Хостинг, Домены, Аренда серверов (Bare Metal), Backup SaaS, 1C Cloud (пилот). Команда: PM + Универсальный техспециалист + Сисадмин + аутсорс SMM. Стратегия: 4 этапа — Revenue → Recurring → Ecosystem → Branding."},{id:6,name:"Финанс",stage:"Запуск",status:"on_track",owner:"Акмал Х.",ownerColor:"#f59e0b",northStar:"Контроль бюджетов всех продуктов",budgetPlan:0,budgetFact:0,deadline:"2026-12-31",progress:30,yearlyGoal:"Прозрачный бюджетный контроль",monthlyPlan:[{month:"Янв",goal:null,actual:null,notes:""},{month:"Фев",goal:null,actual:null,notes:""},{month:"Мар",goal:null,actual:null,notes:""},{month:"Апр",goal:null,actual:null,notes:""},{month:"Май",goal:null,actual:null,notes:""},{month:"Июн",goal:null,actual:null,notes:""},{month:"Июл",goal:null,actual:null,notes:""},{month:"Авг",goal:null,actual:null,notes:""},{month:"Сен",goal:null,actual:null,notes:""},{month:"Окт",goal:null,actual:null,notes:""},{month:"Ноя",goal:null,actual:null,notes:""},{month:"Дек",goal:null,actual:null,notes:""}],kpis:[{name:"Исполнение бюджета",plan:"100%",fact:"—",ok:null}],issues:[],desc:"Финансовый контроль."}],tasks:[{id:1,projectId:1,title:"Новые тарифы — разработка и запуск (Рост ААБ)",owner:"Нозим А.",deadline:"2026-07-01",status:"inprogress",sprint:"Q3 2026",priority:"high",goal:"Увеличить ААБ через новые конкурентные тарифы",kpis:[],issues:[],desc:""},{id:2,projectId:1,title:"Снижение неактивных абонентов — план активации",owner:"Нозим А.",deadline:"2026-07-15",status:"todo",sprint:"Q3 2026",priority:"high",goal:"",kpis:[],issues:[],desc:""},{id:3,projectId:1,title:"Работа с корзиной (удержание) — тестирование 01.06–01.09",owner:"Нозим А.",deadline:"2026-09-01",status:"inprogress",sprint:"Тест 01.06–01.09.2026",priority:"high",goal:"",kpis:[],issues:[],desc:""},{id:4,projectId:2,title:"Удержание клиентов",owner:"Дильноза М.",deadline:"2026-12-31",status:"inprogress",sprint:"Q3 2026",priority:"high",goal:"Удержать существующую базу B2B клиентов через доп.услуги и работу с оттоком",kpis:[{name:"Churn rate",plan:"—",fact:"—",ok:null},{name:"Удержано клиентов",plan:"—",fact:"—",ok:null}],issues:[],desc:"Ответственный: Дильноза Марифова"},{id:5,projectId:2,title:"Увеличение зоны покрытия: Parking Mall БЦ",owner:"Алия Ю.",deadline:"2026-09-30",status:"todo",sprint:"Q3 2026",priority:"high",goal:"Подключить Parking Mall бизнес центр",kpis:[],issues:[],desc:"Новая территория — бизнес центр Parking Mall"},{id:6,projectId:2,title:"Увеличение зоны покрытия: Imperial БЦ",owner:"Алия Ю.",deadline:"2026-09-30",status:"todo",sprint:"Q3 2026",priority:"high",goal:"Подключить Imperial бизнес центр",kpis:[],issues:[],desc:"Новая территория — бизнес центр Imperial"},{id:7,projectId:2,title:"Строительство на новостройках",owner:"Алия Ю.",deadline:"2026-12-31",status:"todo",sprint:"Q3-Q4 2026",priority:"medium",goal:"Расширение инфраструктуры на новостройках",kpis:[],issues:[],desc:""},{id:8,projectId:2,title:"Работа с Бизнес Центрами — брендирование и реклама",owner:"Сардор Р.",deadline:"2026-10-31",status:"inprogress",sprint:"Q3 2026",priority:"high",goal:"Брендирование в БЦ, рекламные активности для B2B привлечения",kpis:[{name:"Охваченных БЦ",plan:"—",fact:"—",ok:null},{name:"Новых лидов из БЦ",plan:"—",fact:"—",ok:null}],issues:[],desc:"Ответственный: Рузметов Сардор."},{id:9,projectId:2,title:"Систематизация отдела B2B в регионах",owner:"Аброр Н.",deadline:"2026-12-31",status:"inprogress",sprint:"Q3-Q4 2026",priority:"high",goal:"Выстроить системную работу B2B в регионах: набор менеджеров и регламентация",kpis:[{name:"Набрано менеджеров",plan:"—",fact:"—",ok:null},{name:"Регламентов утверждено",plan:"—",fact:"—",ok:null}],issues:[],desc:"Ответственный: Нормуродов Аброр."},{id:10,projectId:3,title:"Проект подписки — запуск",owner:"Алия Ю.",deadline:"2026-09-01",status:"inprogress",sprint:"Q3 2026",priority:"high",goal:"Запустить подписочную модель монетизации Prime Stream",kpis:[{name:"Подписчиков",plan:"—",fact:"—",ok:null},{name:"MRR",plan:"—",fact:"—",ok:null}],issues:[],desc:"Срок запуска: 01.09.2026"},{id:11,projectId:3,title:"Рефералка — условия готовы, запуск",owner:"Алия Ю.",deadline:"2026-08-01",status:"inprogress",sprint:"Q3 2026",priority:"high",goal:"Запустить реферальную программу (условия уже готовы)",kpis:[{name:"Рефералов",plan:"—",fact:"—",ok:null}],issues:[],desc:"Этап: запуск."},{id:12,projectId:3,title:"Digital — SMM и социальные сети",owner:"Малика С.",deadline:"2026-12-31",status:"inprogress",sprint:"Q3 2026",priority:"medium",goal:"Развить присутствие Prime Stream в социальных сетях",kpis:[{name:"Подписчики соцсетей",plan:"—",fact:"—",ok:null},{name:"Охват публикаций",plan:"—",fact:"—",ok:null}],issues:[],desc:"Ответственный: Малика С."},{id:13,projectId:3,title:"Коллаборация: Soft Optical — AI видеонаблюдение",owner:"Алия Ю.",deadline:"2026-10-01",status:"todo",sprint:"Q3 2026",priority:"medium",goal:"Партнёрство с Soft Optical для интеграции AI видеонаблюдения",kpis:[],issues:[],desc:""},{id:14,projectId:3,title:"Коллаборация: Soft Smart AI — умный дом и офис",owner:"Алия Ю.",deadline:"2026-10-01",status:"todo",sprint:"Q3 2026",priority:"medium",goal:"Партнёрство с Soft Smart AI для умного дома и офиса",kpis:[],issues:[],desc:""},{id:15,projectId:4,title:"MAU рост — план привлечения",owner:"Шахзод Р.",deadline:"2026-07-31",status:"inprogress",sprint:"Q3 2026",priority:"high",goal:"",kpis:[],issues:[],desc:""},{id:16,projectId:4,title:"Рост прихода — монетизация",owner:"Шахзод Р.",deadline:"2026-07-31",status:"inprogress",sprint:"Q3 2026",priority:"high",goal:"",kpis:[],issues:[],desc:""},{id:17,projectId:4,title:"Турон юзерс — интеграция",owner:"Шахзод Р.",deadline:"2026-08-15",status:"todo",sprint:"Q3 2026",priority:"medium",goal:"",kpis:[],issues:[],desc:""},{id:18,projectId:5,title:"1С Клоуд — исследование, пилот и коммерческий запуск",owner:"Тохир Ю.",deadline:"2026-12-31",status:"inprogress",sprint:"Q3-Q4 2026",priority:"high",goal:"Оценить целесообразность 1C Cloud и протестировать с 1–2 клиентами. Коммерческий запуск — Q1 2027",kpis:[{name:"Пилотных клиентов",plan:"1–2",fact:"—",ok:null},{name:"MVP готов",plan:"Q4 2026",fact:"—",ok:null}],issues:[],desc:"Июль: исследование лицензирования, переговоры с 1C-франчайзи. Август: пилотная среда. Сен–Окт: тест с клиентами. Ноя–Дек: план запуска 2027."},{id:19,projectId:5,title:"Backup SaaS — платформа, MVP, коммерческий запуск",owner:"Тохир Ю.",deadline:"2026-11-30",status:"todo",sprint:"Q3-Q4 2026",priority:"high",goal:"Формирование рекуррентной выручки — наиболее быстро монетизируемое облачное направление",kpis:[{name:"Пилотных клиентов",plan:"5–10",fact:"—",ok:null},{name:"Выручка Backup/мес",plan:"10–20 млн сум",fact:"—",ok:null}],issues:[],desc:"Июль: выбор платформы (Proxmox/Veeam). Август: MVP. Сен–Окт: 3–5 пилотных клиентов. Ноя–Дек: коммерческий запуск + bundle."},{id:20,projectId:5,title:"YouTube канал — брендинг и лидогенерация",owner:"Тохир Ю.",deadline:"2026-12-31",status:"inprogress",sprint:"Июн–Дек 2026",priority:"medium",goal:"Формирование бренда T-Cloud и органическая лидогенерация при минимальном бюджете",kpis:[{name:"Подписчиков",plan:"500–1000",fact:"—",ok:null},{name:"Видео в месяц",plan:"2–4",fact:"—",ok:null}],issues:[],desc:"Контент: VPS, Хостинг vs VPS, Backup, Аренда сервера, Облака. Приоритет — Shorts. CTA на tcloud.uz."},{id:21,projectId:6,title:"Бюджетный контроль Q3 — все продукты",owner:"Акмал Х.",deadline:"2026-07-15",status:"inprogress",sprint:"Q3 2026",priority:"high",goal:"",kpis:[],issues:[],desc:""},{id:22,projectId:5,title:"Кросс-продажи ISP — выход на B2B, sales-скрипты, обучение",owner:"Тохир Ю.",deadline:"2026-07-31",status:"inprogress",sprint:"Июн–Июл 2026",priority:"high",goal:"Увеличить выручку T-Cloud в 6 раз через B2B-сегмент Turon ISP",kpis:[{name:"Активных B2B клиентов",plan:"30+",fact:"—",ok:null},{name:"Новых клиентов/мес",plan:"5–10",fact:"—",ok:null},{name:"Рост выручки",plan:"x6",fact:"—",ok:null}],issues:[],desc:"Июн–Июл: sales-скрипты, offer-пакет, обучение. Авг–Сен: корпоративные клиенты, bundle (Интернет+VPS, Интернет+Backup), CRM. Окт–Дек: масштабирование, пакетные продукты, цель x6."},{id:23,projectId:5,title:"Аренда серверов (Bare Metal) — оформление, 1-й клиент, масштаб",owner:"Тохир Ю.",deadline:"2026-12-31",status:"inprogress",sprint:"Июн–Дек 2026",priority:"high",goal:"Генерация рекуррентной выручки через аренду выделенных серверов корпоративным клиентам",kpis:[{name:"Серверов в аренде",plan:"10–15",fact:"—",ok:null},{name:"Выручка серверы/мес",plan:"20–45 млн сум",fact:"—",ok:null},{name:"Мин. срок договора",plan:"6–12 мес.",fact:"—",ok:null}],issues:[],desc:"Модель: T-Cloud покупает → сдаёт в аренду. Стоимость: $700–$3000. Аренда: 2–3 млн сум/мес. Окупаемость: 6–8 мес. Депозит: 50%. Июн–Июл: договор+прайс+1-й клиент. Авг–Сен: 2–3 договора. Окт–Дек: 10–15 серверов."},{id:24,projectId:5,title:"Партнёрская экосистема — TuronID, пакеты, реферальные продажи",owner:"Тохир Ю.",deadline:"2026-12-31",status:"todo",sprint:"Июл–Дек 2026",priority:"high",goal:"Генерация лидов и bundle-продаж через экосистему Turon",kpis:[{name:"Лидов/мес от партнёров",plan:"5+",fact:"—",ok:null},{name:"Активных партнёров",plan:"4",fact:"—",ok:null}],issues:[],desc:"Партнёры: Turon ISP, TuronID, Turon ISP B2B, Primestream.uz. Июл–Авг: TuronID интеграция, пакеты, бонусы/revenue share. Сен–Окт: партнёрские соглашения, реферальные продажи. Ноя–Дек: масштабирование, enterprise через Turon ISP B2B."}],collabRequests:[],customRoles:[]};
// Hash every seed user's plaintext password once at startup so a fresh
// install (no existing DB/file) never writes plaintext passwords to disk.
DEFAULT_DATA.users.forEach(u=>{if(u.password&&!isHashed(u.password))u.password=hashPassword(u.password);});
function initDataFile(){
  try{
    const stat=fs.statSync(FILE);
    if(stat.isDirectory()){
      fs.rmSync(FILE,{recursive:true,force:true});
      throw new Error('was directory');
    }
    JSON.parse(fs.readFileSync(FILE,'utf8'));
    console.log('  [DATA] pmo_data.json OK');
  }catch(e){
    fs.writeFileSync(FILE,JSON.stringify(DEFAULT_DATA,null,2),'utf8');
    console.log('  [DATA] pmo_data.json created with default data');
  }
}
initDataFile();
const lf=()=>{try{return JSON.parse(fs.readFileSync(FILE,'utf8'));}catch(e){return null;}};
const sf=d=>fs.writeFileSync(FILE,JSON.stringify(d,null,2),'utf8');
const pj=(v,fb)=>{if(!v)return fb;if(typeof v==='object')return v;try{return JSON.parse(v);}catch(e){return fb;}};

app.post('/api/login',async(req,res)=>{
  const{name,password}=req.body;
  if(!name||!password)return res.json({ok:false,error:'missing'});
  try{
    let user=null;
    if(db){
      const[rows]=await db.execute('SELECT * FROM users WHERE LOWER(name)=LOWER(?)',[name]);
      if(rows[0]){user=rows[0];user.access=pj(user.access,[]);}
    }else{
      const d=lf();
      if(d&&d.users)user=d.users.find(u=>u.name.toLowerCase()===name.toLowerCase());
    }
    if(!user)return res.json({ok:false,error:'not_found'});
    if(!verifyPassword(password,user.password))return res.json({ok:false,error:'wrong_pass'});
    // Migrate legacy plaintext password to a bcrypt hash on first successful login.
    if(!isHashed(user.password)){
      const hashed=hashPassword(password);
      try{
        if(db)await db.execute('UPDATE users SET password=? WHERE id=?',[hashed,user.id]);
        else{const d=lf();const u2=d&&d.users&&d.users.find(u=>u.id===user.id);if(u2){u2.password=hashed;sf(d);}}
      }catch(e){console.log('  [AUTH] password migration failed for user '+user.id+':',e.message);}
      user.password=hashed;
    }
    const token=createSession(user.id);
    const safeUser=Object.assign({},user);delete safeUser.password;
    res.json({ok:true,user:safeUser,token});
  }catch(e){res.json({ok:false,error:e.message});}
});

app.post('/api/logout',(req,res)=>{
  const hdr=req.headers.authorization||'';
  const token=hdr.startsWith('Bearer ')?hdr.slice(7):null;
  if(token)SESSIONS.delete(token);
  res.json({ok:true});
});

// Filters projects/tasks down to what authUser is actually allowed to SEE,
// mirroring the client's activeProjects()/activeTasks(). Users/collabRequests/
// customRoles are intentionally left unfiltered (out of scope for this fix —
// see PMO access audit notes). No-op (returns input as-is) for scope:'all'.
function scopeFilterData(authUser,projects,tasks,customRoles){
  if(scopeOf(customRoles,authUser.role)==='all')return{projects,tasks};
  const visibleProjects=projects.filter(p=>userCanSeeProject(authUser,p,customRoles));
  const projectsById={};projects.forEach(p=>{projectsById[p.id]=p;});
  const visibleTasks=tasks.filter(t=>userCanSeeTask(authUser,t,projectsById,customRoles));
  return{projects:visibleProjects,tasks:visibleTasks};
}
app.get('/api/data',requireAuth,async(req,res)=>{
  try{
    if(db){
      const[users]=await db.execute('SELECT * FROM users');
      const[projectsRaw]=await db.execute('SELECT * FROM projects');
      const[tasksRaw]=await db.execute('SELECT * FROM tasks');
      const[requests]=await db.execute('SELECT * FROM collab_requests');
      let customRoles=[];
      try{const[csRows]=await db.execute('SELECT settingValue FROM app_settings WHERE settingKey=?',['customRoles']);if(csRows[0])customRoles=pj(csRows[0].settingValue,[]);}catch(e){}
      users.forEach(u=>{u.access=pj(u.access,[]);delete u.password;});
      projectsRaw.forEach(p=>{p.kpis=pj(p.kpis,[]);p.issues=pj(p.issues,[]);p.monthlyPlan=pj(p.monthlyPlan,[]);p.metrics=pj(p.metrics,null);p.metricData=pj(p.metricData,{});p.team=pj(p.team,[]);p.biweeklyLog=pj(p.biweeklyLog,[]);p.desc=p.description||'';p.deleted=!!p.deleted;if(!p.deletedAt)delete p.deletedAt;});
      tasksRaw.forEach(t=>{t.kpis=pj(t.kpis,[]);t.issues=pj(t.issues,[]);t.subtasks=pj(t.subtasks,[]);t.desc=t.description||'';});
      const{projects,tasks}=scopeFilterData(req.authUser,projectsRaw,tasksRaw,customRoles);
      return res.json({ok:true,users,projects,tasks,collabRequests:requests,customRoles});
    }
    const d=lf()||{users:[],projects:[],tasks:[],collabRequests:[],customRoles:[]};
    const users2=(d.users||[]).map(u=>{const c=Object.assign({},u);delete c.password;return c;});
    const{projects,tasks}=scopeFilterData(req.authUser,d.projects||[],d.tasks||[],d.customRoles||[]);
    res.json({ok:true,...d,users:users2,projects,tasks});
  }catch(e){res.json({ok:false,error:e.message});}
});

// NOTE on write authorization below: GET /api/data is now scope-filtered
// (see scopeFilterData above), which means a lower-privilege user's browser
// only ever holds a SUBSET of projects/tasks. Because of that, this route no
// longer infers deletion from "record missing from the incoming array" for
// projects/tasks/collabRequests — that used to wipe out every record outside
// a user's scope as soon as they synced. Deletion of those three now happens
// ONLY through the dedicated DELETE endpoints below (/api/projects/:id,
// /api/tasks/:id, /api/collab-requests/:id) and POST /api/admin/reset-all.
// This route is pure per-record upsert for them. The `users` table is the one
// exception: it's never scope-filtered on GET (every authed user still gets
// the full roster, minus passwords), so delete-by-absence stays safe there
// and remains gated behind manageUsers as before.
app.post('/api/data',requireAuth,async(req,res)=>{
  const{users,projects,tasks,collabRequests,customRoles}=req.body;
  const authUser=req.authUser;
  try{
    const customRoles2=await loadCustomRoles();
    const canManageUsers=manageUsersOf(customRoles2,authUser.role);
    const projectsById={};(projects||[]).forEach(p=>{projectsById[p.id]=p;});
    const allowedProjects=(projects||[]).filter(p=>userCanWriteProject(authUser,p,customRoles2));
    const allowedTasks=(tasks||[]).filter(t=>userCanWriteTask(authUser,t,projectsById,customRoles2));
    if(db){
      // Users are still synced as a full list (GET never scope-filters them),
      // so delete-by-absence stays safe there and remains gated behind
      // manageUsers. Projects/tasks/collabRequests are NOT deleted here
      // anymore — see the dedicated DELETE endpoints below.
      if(canManageUsers&&Array.isArray(users)){
        if(users.length){const ids=users.map(u=>u.id);await db.execute(`DELETE FROM users WHERE id NOT IN (${ids.map(()=>'?').join(',')})`,ids);}
        else await db.execute('DELETE FROM users');
      }
      var warnings=[];
      if(canManageUsers){
        for(const u of(users||[])){
          try{
            // Never overwrite a password via the bulk sync route — passwords are
            // only ever set via /api/login (migration) or /api/password|/api/admin/reset-password.
            await db.execute(
              'INSERT INTO users(id,name,role,product,email,pos,password,access)VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),role=VALUES(role),product=VALUES(product),email=VALUES(email),pos=VALUES(pos),access=VALUES(access)',
              [u.id,u.name,u.role||'member',u.product||'',u.email||'',u.pos||'',hashPassword(u.password||makeToken()),JSON.stringify(u.access||[])]
            );
          }catch(e){console.log('  [DB] user save failed id='+u.id+':',e.message);warnings.push('user '+u.id+': '+e.message);}
        }
      }else if(Array.isArray(users)&&users.length){
        warnings.push('users: пропущено (нет прав manageUsers)');
      }
      for(const p of allowedProjects){
        try{
          await db.execute(
            'INSERT INTO projects(id,name,stage,status,owner,ownerColor,northStar,budgetPlan,budgetFact,deadline,progress,yearlyGoal,kpis,issues,monthlyPlan,description,metrics,metricData,team,biweeklyLog,deleted,deletedAt)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),stage=VALUES(stage),status=VALUES(status),owner=VALUES(owner),northStar=VALUES(northStar),budgetPlan=VALUES(budgetPlan),budgetFact=VALUES(budgetFact),deadline=VALUES(deadline),progress=VALUES(progress),yearlyGoal=VALUES(yearlyGoal),kpis=VALUES(kpis),issues=VALUES(issues),monthlyPlan=VALUES(monthlyPlan),description=VALUES(description),metrics=VALUES(metrics),metricData=VALUES(metricData),team=VALUES(team),biweeklyLog=VALUES(biweeklyLog),deleted=VALUES(deleted),deletedAt=VALUES(deletedAt)',
            [p.id,p.name,p.stage||'',p.status||'on_track',p.owner||'',p.ownerColor||'#4f6ef7',p.northStar||'',p.budgetPlan||0,p.budgetFact||0,p.deadline||null,p.progress||0,p.yearlyGoal||'',JSON.stringify(p.kpis||[]),JSON.stringify(p.issues||[]),JSON.stringify(p.monthlyPlan||[]),p.desc||'',p.metrics?JSON.stringify(p.metrics):null,JSON.stringify(p.metricData||{}),JSON.stringify(p.team||[]),JSON.stringify(p.biweeklyLog||[]),p.deleted?1:0,p.deletedAt||null]
          );
        }catch(e){console.log('  [DB] project save failed id='+p.id+':',e.message);warnings.push('project '+p.id+': '+e.message);}
      }
      if((projects||[]).length>allowedProjects.length)warnings.push((projects.length-allowedProjects.length)+' проект(ов) пропущено (нет прав на запись)');
      for(const t of allowedTasks){
        try{
          await db.execute(
            'INSERT INTO tasks(id,projectId,title,owner,deadline,status,priority,sprint,goal,progress,kpis,issues,description,reqId,subtasks)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE title=VALUES(title),owner=VALUES(owner),deadline=VALUES(deadline),status=VALUES(status),priority=VALUES(priority),sprint=VALUES(sprint),goal=VALUES(goal),progress=VALUES(progress),kpis=VALUES(kpis),issues=VALUES(issues),description=VALUES(description),subtasks=VALUES(subtasks)',
            [t.id,t.projectId||null,t.title,t.owner||'',t.deadline||null,t.status||'todo',t.priority||'medium',t.sprint||'',t.goal||'',t.progress||null,JSON.stringify(t.kpis||[]),JSON.stringify(t.issues||[]),t.desc||'',t.reqId||null,JSON.stringify(t.subtasks||[])]
          );
        }catch(e){console.log('  [DB] task save failed id='+t.id+':',e.message);warnings.push('task '+t.id+': '+e.message);}
      }
      if((tasks||[]).length>allowedTasks.length)warnings.push((tasks.length-allowedTasks.length)+' задач(и) пропущено (нет прав на запись)');
      for(const r of(collabRequests||[])){
        try{
          await db.execute(
            'INSERT INTO collab_requests(id,fromUserId,toUserId,title,description,priority,deadline,projectId,status,taskId)VALUES(?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status)',
            [r.id,r.fromUserId,r.toUserId,r.title,r.desc||'',r.priority||'medium',r.deadline||null,r.projectId||null,r.status||'pending',r.taskId||null]
          );
        }catch(e){console.log('  [DB] collab request save failed id='+r.id+':',e.message);warnings.push('collab '+r.id+': '+e.message);}
      }
      if(canManageUsers&&Array.isArray(customRoles)){
        try{
          await db.execute('INSERT INTO app_settings(settingKey,settingValue)VALUES(?,?) ON DUPLICATE KEY UPDATE settingValue=VALUES(settingValue)',['customRoles',JSON.stringify(customRoles)]);
        }catch(e){console.log('  [DB] customRoles save failed:',e.message);warnings.push('customRoles: '+e.message);}
      }
      if(warnings.length)return res.json({ok:true,warning:warnings.join('; ')});
    }else{
      // File-mode: re-read current data and merge in only the allowed changes,
      // so an unauthorized record in the payload can't overwrite the file version.
      const cur=lf()||{users:[],projects:[],tasks:[],collabRequests:[],customRoles:[]};
      // Client never holds passwords (GET strips them), so when merging an
      // updated users array back in, keep each user's existing stored password.
      const curUsersById={};(cur.users||[]).forEach(u=>{curUsersById[u.id]=u;});
      const finalUsers=canManageUsers?(users||cur.users).map(u=>{
        const prev=curUsersById[u.id];
        return Object.assign({},u,{password:(prev&&prev.password)||hashPassword(u.password||makeToken())});
      }):cur.users;
      // Pure upsert — no deletion inferred from absence anymore (projects/tasks
      // are scope-filtered on GET now, so "missing from this payload" just
      // means "outside this user's view", not "delete me"). Deletion happens
      // only via the dedicated DELETE endpoints below.
      const byId=(arr)=>{const m={};(arr||[]).forEach(x=>m[x.id]=x);return m;};
      const curP=byId(cur.projects),curT=byId(cur.tasks);
      allowedProjects.forEach(p=>{curP[p.id]=p;});
      allowedTasks.forEach(t=>{curT[t.id]=t;});
      const finalProjects=Object.values(curP);
      const finalTasks=Object.values(curT);
      sf({users:finalUsers,projects:finalProjects,tasks:finalTasks,collabRequests:collabRequests||cur.collabRequests,customRoles:canManageUsers?(customRoles||cur.customRoles):cur.customRoles});
    }
    res.json({ok:true});
  }catch(e){
    res.json({ok:false,error:e.message});
  }
});

// ============================================================
// DEDICATED DELETE ENDPOINTS
// Replace the old delete-by-absence sync side-effect now that GET /api/data
// is scope-filtered. Each is permission-gated per-record, same rules as writes.
// ============================================================
app.delete('/api/projects/:id',requireAuth,async(req,res)=>{
  const id=Number(req.params.id);
  try{
    const customRoles=await loadCustomRoles();
    if(db){
      const[rows]=await db.execute('SELECT * FROM projects WHERE id=?',[id]);
      const proj=rows[0];
      if(!proj)return res.json({ok:true});
      if(!userCanWriteProject(req.authUser,proj,customRoles))return res.status(403).json({ok:false,error:'forbidden'});
      await db.execute('DELETE FROM tasks WHERE projectId=?',[id]);
      await db.execute('DELETE FROM projects WHERE id=?',[id]);
    }else{
      const d=lf()||{projects:[],tasks:[]};
      const proj=(d.projects||[]).find(p=>p.id===id);
      if(!proj)return res.json({ok:true});
      if(!userCanWriteProject(req.authUser,proj,customRoles))return res.status(403).json({ok:false,error:'forbidden'});
      d.projects=(d.projects||[]).filter(p=>p.id!==id);
      d.tasks=(d.tasks||[]).filter(t=>t.projectId!==id);
      sf(d);
    }
    res.json({ok:true});
  }catch(e){res.json({ok:false,error:e.message});}
});

app.delete('/api/tasks/:id',requireAuth,async(req,res)=>{
  const id=Number(req.params.id);
  try{
    const customRoles=await loadCustomRoles();
    if(db){
      const[trows]=await db.execute('SELECT * FROM tasks WHERE id=?',[id]);
      const task=trows[0];
      if(!task)return res.json({ok:true});
      const[projs]=await db.execute('SELECT * FROM projects');
      const projectsById={};projs.forEach(p=>{projectsById[p.id]=p;});
      if(!userCanWriteTask(req.authUser,task,projectsById,customRoles))return res.status(403).json({ok:false,error:'forbidden'});
      await db.execute('DELETE FROM tasks WHERE id=?',[id]);
    }else{
      const d=lf()||{projects:[],tasks:[]};
      const task=(d.tasks||[]).find(t=>t.id===id);
      if(!task)return res.json({ok:true});
      const projectsById={};(d.projects||[]).forEach(p=>{projectsById[p.id]=p;});
      if(!userCanWriteTask(req.authUser,task,projectsById,customRoles))return res.status(403).json({ok:false,error:'forbidden'});
      d.tasks=(d.tasks||[]).filter(t=>t.id!==id);
      sf(d);
    }
    res.json({ok:true});
  }catch(e){res.json({ok:false,error:e.message});}
});

// Collab request deletion cascades to any task created from it (mirrors the
// client's existing deleteReq behavior, which also removed those tasks).
app.delete('/api/collab-requests/:id',requireAuth,async(req,res)=>{
  const id=Number(req.params.id);
  try{
    const customRoles=await loadCustomRoles();
    const canManage=manageUsersOf(customRoles,req.authUser.role);
    if(db){
      const[rows]=await db.execute('SELECT * FROM collab_requests WHERE id=?',[id]);
      const r=rows[0];
      if(!r)return res.json({ok:true});
      const isParticipant=String(r.fromUserId)===String(req.authUser.id)||String(r.toUserId)===String(req.authUser.id);
      if(!isParticipant&&!canManage)return res.status(403).json({ok:false,error:'forbidden'});
      await db.execute('DELETE FROM tasks WHERE reqId=?',[id]);
      await db.execute('DELETE FROM collab_requests WHERE id=?',[id]);
    }else{
      const d=lf()||{collabRequests:[],tasks:[]};
      const r=(d.collabRequests||[]).find(x=>x.id===id);
      if(!r)return res.json({ok:true});
      const isParticipant=String(r.fromUserId)===String(req.authUser.id)||String(r.toUserId)===String(req.authUser.id);
      if(!isParticipant&&!canManage)return res.status(403).json({ok:false,error:'forbidden'});
      d.collabRequests=(d.collabRequests||[]).filter(x=>x.id!==id);
      d.tasks=(d.tasks||[]).filter(t=>t.reqId!==id);
      sf(d);
    }
    res.json({ok:true});
  }catch(e){res.json({ok:false,error:e.message});}
});

// Admin "danger zone" wipe — replaces what resetAll() used to achieve purely
// as a side-effect of the now-removed delete-by-absence sync logic. Wipes
// projects/tasks/collabRequests only (users and customRoles are untouched,
// matching the client's resetAll() scope).
app.post('/api/admin/reset-all',requireAuth,async(req,res)=>{
  try{
    const customRoles=await loadCustomRoles();
    if(!manageUsersOf(customRoles,req.authUser.role))return res.status(403).json({ok:false,error:'forbidden'});
    if(db){
      await db.execute('DELETE FROM tasks');
      await db.execute('DELETE FROM projects');
      await db.execute('DELETE FROM collab_requests');
    }else{
      const d=lf()||{};
      d.projects=[];d.tasks=[];d.collabRequests=[];
      sf(d);
    }
    res.json({ok:true});
  }catch(e){res.json({ok:false,error:e.message});}
});

app.post('/api/password',requireAuth,async(req,res)=>{
  const{userId,oldPass,newPass}=req.body;
  // A user may only change their own password via this route.
  if(String(userId)!==String(req.authUser.id))return res.json({ok:false,error:'forbidden'});
  if(!newPass||String(newPass).length<4)return res.json({ok:false,error:'weak_password'});
  try{
    if(db){
      const[rows]=await db.execute('SELECT password FROM users WHERE id=?',[userId]);
      if(!rows[0]||!verifyPassword(oldPass,rows[0].password))return res.json({ok:false,error:'wrong_pass'});
      await db.execute('UPDATE users SET password=? WHERE id=?',[hashPassword(newPass),userId]);
    }else{
      const d=lf();
      const u=d&&d.users&&d.users.find(u=>u.id===userId);
      if(!u||!verifyPassword(oldPass,u.password))return res.json({ok:false,error:'wrong_pass'});
      u.password=hashPassword(newPass);
      sf(d);
    }
    res.json({ok:true});
  }catch(e){res.json({ok:false,error:e.message});}
});

app.post('/api/admin/reset-password',requireAuth,async(req,res)=>{
  const{userId,newPass}=req.body;
  try{
    const customRoles=await loadCustomRoles();
    if(!manageUsersOf(customRoles,req.authUser.role))return res.json({ok:false,error:'forbidden'});
    if(!newPass||String(newPass).length<4)return res.json({ok:false,error:'weak_password'});
    if(db){
      await db.execute('UPDATE users SET password=? WHERE id=?',[hashPassword(newPass),userId]);
    }else{
      const d=lf();
      const u=d&&d.users&&d.users.find(u=>u.id===userId);
      if(u){u.password=hashPassword(newPass);sf(d);}
    }
    res.json({ok:true});
  }catch(e){res.json({ok:false,error:e.message});}
});

// ============================================================
// FILE UPLOAD & ANALYSIS
// ============================================================
const multer=require('multer');
const mammoth=require('mammoth');
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024}});

app.post('/api/upload-file',upload.single('file'),async(req,res)=>{
  try{
    const file=req.file;
    if(!file)return res.json({ok:false,error:'Файл не получен'});
    const ext=(file.originalname.split('.').pop()||'').toLowerCase();
    let text='';
    if(ext==='docx'){
      const r=await mammoth.extractRawText({buffer:file.buffer});
      text=r.value;
    }else if(['txt','md','csv'].includes(ext)){
      text=file.buffer.toString('utf8');
    }else{
      return res.json({ok:false,error:'Поддерживаются: .docx, .txt, .md, .csv'});
    }
    if(!text.trim())return res.json({ok:false,error:'Файл пустой или не удалось прочитать текст'});
    const snippet=text.slice(0,10000);
    const agentMsg=`Тебе загрузили файл проекта "${file.originalname}".
Твоя задача: проанализировать содержимое и составить структурированный отчёт.
1. Определи продукт/проект
2. Выдели KPI, цели, задачи, сроки, риски
3. Дай рекомендации что внести в PMO систему

СОДЕРЖИМОЕ ФАЙЛА:
${snippet}`;
    const sys=`Ты — ИИ-аналитик PMO Турон Телеком. Анализируй файлы проектов и выдавай структурированные выводы на русском.`;
    const reply=await callAI(agentMsg,sys);
    res.json({ok:true,filename:file.originalname,chars:text.length,reply});
  }catch(e){res.json({ok:false,error:e.message});}
});

// Direct AI call (Groq/Claude) — no inter-container proxy needed
const AGENT_CFG_FILE=path.join(DIR,'agent_config.json');
function loadAgentCfg(){try{return JSON.parse(fs.readFileSync(AGENT_CFG_FILE,'utf8'));}catch(e){return{};}}
function groqRequest(key,model,messages,cb){
  const body=JSON.stringify({model:model||'llama-3.3-70b-versatile',messages,max_tokens:2048,temperature:0.7});
  const req=require('https').request({hostname:'api.groq.com',path:'/openai/v1/chat/completions',method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+key,'Content-Length':Buffer.byteLength(body)}
  },res2=>{let buf='';res2.on('data',c=>buf+=c);res2.on('end',()=>{try{cb(null,JSON.parse(buf));}catch(e){cb(e);}});});
  req.on('error',cb);req.write(body);req.end();
}
async function callAI(message,systemPrompt){
  const cfg=loadAgentCfg();
  const key=process.env.GROQ_API_KEY||cfg.groq_api_key||cfg.claude_api_key||'';
  if(!key)throw new Error('API ключ не настроен');
  const model=process.env.GROQ_MODEL||cfg.groq_model||'llama-3.3-70b-versatile';
  const messages=[{role:'system',content:systemPrompt},{role:'user',content:message}];
  return new Promise((resolve,reject)=>{
    groqRequest(key,model,messages,(err,data)=>{
      if(err)return reject(err);
      if(data.error)return reject(new Error(data.error.message));
      resolve(data.choices[0].message.content);
    });
  });
}

// Single /api/ai route (previously this was registered TWICE — the second
// registration further down was dead code, since Express only ever invokes
// the first matching handler. That dead handler was actually the more
// capable one (client-supplied apiKey support + rule-based fallback when no
// API key is available at all), so it's merged in here instead of discarded.
app.post('/api/ai',async(req,res)=>{
  const{message,context,apiKey}=req.body;
  if(!message)return res.json({ok:false,error:'no message'});
  const sys=`Ты — ИИ-агент PMO Турон Телеком. Отвечай кратко на русском. Используй эмодзи.
Контекст: ${JSON.stringify(context||{}).slice(0,3000)}`;
  // 1) Client-supplied API key (Groq or Claude) takes priority if provided.
  if(apiKey&&(apiKey.startsWith('sk-ant-')||apiKey.startsWith('gsk_'))){
    try{
      let reply=null,source=null;
      if(apiKey.startsWith('gsk_')){
        const resp=await fetch('https://api.groq.com/openai/v1/chat/completions',{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
          body:JSON.stringify({model:'llama-3.3-70b-versatile',max_tokens:1024,
            messages:[{role:'system',content:sys},{role:'user',content:message}]})
        });
        const data=await resp.json();
        if(data.choices&&data.choices[0])reply=data.choices[0].message.content;
        else throw new Error(data.error?.message||'Groq error');
        source='groq';
      }else{
        const resp=await fetch('https://api.anthropic.com/v1/messages',{
          method:'POST',
          headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
          body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:1024,
            system:sys,messages:[{role:'user',content:message}]})
        });
        const data=await resp.json();
        if(data.content&&data.content[0])reply=data.content[0].text;
        else throw new Error(data.error?.message||'Claude error');
        source='claude';
      }
      return res.json({ok:true,reply,source});
    }catch(e){console.log('[AI] client apiKey failed:',e.message,'— trying server key/local');}
  }
  // 2) Server-configured key (env var or agent_config.json) via callAI().
  try{
    const reply=await callAI(message,sys);
    return res.json({ok:true,reply,source:'server-key'});
  }catch(e){console.log('[AI] server key unavailable:',e.message,'— using rule-based');}
  // 3) No API key anywhere — fall back to local rule-based responses.
  const reply=ruleBasedAI(message,context||{});
  res.json({ok:true,reply,source:'local'});
});

app.get('/{*splat}',(req,res)=>res.sendFile(path.join(DIR,'PMO_Control_Center.html')));

function getIP(){
  const nets=os.networkInterfaces();
  let fallback=null;
  // Prefer 192.168.x.x (WiFi/LAN), avoid VPN (10.x, 172.x)
  for(const n of Object.keys(nets))
    for(const net of nets[n])
      if(net.family==='IPv4'&&!net.internal){
        if(net.address.startsWith('192.168.'))return net.address;
        if(!fallback)fallback=net.address;
      }
  return fallback||'localhost';
}

connectDB().then(()=>{
  app.listen(PORT,'0.0.0.0',()=>{
    const ip=getIP(),link='http://'+ip+':'+PORT;
    try{fs.writeFileSync(path.join(DIR,'team_link.txt'),link,'utf8');}catch(e){}
    const s='='.repeat(46);
    console.log('\n'+s+'\n  PMO Control Center - Running!\n'+s);
    console.log('  LINK: '+link);
    console.log('  DB  : '+(db?'MySQL (pool)':'File: pmo_data.json'));
    console.log('  Stop: Ctrl+C\n'+s+'\n');
  });
});

// ============================================================
// CHAT HISTORY
// ============================================================
app.get('/api/chat/history',async(req,res)=>{
  const userId=parseInt(req.query.userId);
  const limit=parseInt(req.query.limit)||100;
  if(!userId)return res.json({ok:false,error:'no userId'});
  try{
    if(db){
      const[rows]=await db.execute(
        'SELECT role,content,createdAt FROM chat_history WHERE userId=? ORDER BY createdAt ASC LIMIT ?',
        [userId,limit]
      );
      return res.json({ok:true,messages:rows});
    }
    const d=lf();
    const history=(d&&d.chatHistory&&d.chatHistory[userId])||[];
    res.json({ok:true,messages:history.slice(-limit)});
  }catch(e){res.json({ok:false,error:e.message});}
});

app.post('/api/chat/save',async(req,res)=>{
  const{userId,role,content}=req.body;
  if(!userId||!role||!content)return res.json({ok:false,error:'missing'});
  try{
    if(db){
      await db.execute('INSERT INTO chat_history(userId,role,content)VALUES(?,?,?)',[userId,role,content]);
      // Keep last 200 messages per user
      await db.execute(
        'DELETE FROM chat_history WHERE userId=? AND id NOT IN (SELECT id FROM (SELECT id FROM chat_history WHERE userId=? ORDER BY createdAt DESC LIMIT 200) t)',
        [userId,userId]
      );
    }else{
      const d=lf();
      if(!d.chatHistory)d.chatHistory={};
      if(!d.chatHistory[userId])d.chatHistory[userId]=[];
      d.chatHistory[userId].push({role,content,createdAt:new Date().toISOString()});
      if(d.chatHistory[userId].length>200)d.chatHistory[userId]=d.chatHistory[userId].slice(-200);
      sf(d);
    }
    res.json({ok:true});
  }catch(e){res.json({ok:false,error:e.message});}
});

app.delete('/api/chat/history',async(req,res)=>{
  const userId=parseInt(req.query.userId);
  if(!userId)return res.json({ok:false,error:'no userId'});
  try{
    if(db)await db.execute('DELETE FROM chat_history WHERE userId=?',[userId]);
    else{const d=lf();if(d&&d.chatHistory)delete d.chatHistory[userId];sf(d);}
    res.json({ok:true});
  }catch(e){res.json({ok:false,error:e.message});}
});

function ruleBasedAI(msg, ctx) {
  const m = msg.toLowerCase();
  const projects = ctx.projects || [];
  const tasks = ctx.tasks || [];
  const users = ctx.users || [];

  // --- Create task intent ---
  if (m.includes('создай задачу') || m.includes('добавь задачу') || m.includes('новая задача')) {
    const titleMatch = msg.match(/["«»]([^"«»]+)["«»]/);
    const title = titleMatch ? titleMatch[1] : msg.replace(/создай задачу|добавь задачу|новая задача/i,'').trim();
    const action = JSON.stringify({"action":"create_task","title":title,"priority":"medium","owner":""});
    return `✅ Создаю задачу **"${title}"**\n\n${action}\n\nУточни: кому назначить и дедлайн?`;
  }

  // --- Project status ---
  if (m.includes('риск') || m.includes('проблем') || m.includes('критич')) {
    const atRisk = projects.filter(p => p.status === 'at_risk' || p.status === 'critical');
    const overdue = tasks.filter(t => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'done');
    if (!atRisk.length && !overdue.length) return '✅ Все проекты в норме! Просроченных задач нет.';
    let reply = '';
    if (atRisk.length) reply += `⚠️ **Проекты под риском (${atRisk.length}):**\n${atRisk.map(p=>`• ${p.name} — ${p.owner}`).join('\n')}\n\n`;
    if (overdue.length) reply += `🔴 **Просроченные задачи (${overdue.length}):**\n${overdue.slice(0,5).map(t=>`• ${t.title} (${t.owner})`).join('\n')}`;
    return reply;
  }

  // --- Workload / who is busiest ---
  if (m.includes('загруж') || m.includes('нагрузк') || m.includes('кто занят') || m.includes('кто перегруж')) {
    const load = {};
    tasks.filter(t=>t.status!=='done').forEach(t => { load[t.owner]=(load[t.owner]||0)+1; });
    const sorted = Object.entries(load).sort((a,b)=>b[1]-a[1]);
    if (!sorted.length) return '📭 Нет активных задач.';
    return `📊 **Загрузка команды (активные задачи):**\n${sorted.map(([n,c])=>`• ${n}: ${c} задач`).join('\n')}\n\n💡 Самый загруженный: **${sorted[0][0]}** (${sorted[0][1]} задач)`;
  }

  // --- Overdue tasks ---
  if (m.includes('просроч') || m.includes('дедлайн') || m.includes('опаздыва')) {
    const now = new Date();
    const overdue = tasks.filter(t => t.deadline && new Date(t.deadline) < now && t.status !== 'done');
    if (!overdue.length) return '✅ Просроченных задач нет!';
    return `🔴 **Просроченные задачи (${overdue.length}):**\n${overdue.map(t=>{
      const days = Math.round((now-new Date(t.deadline))/86400000);
      return `• ${t.title} — ${t.owner} (просрочено ${days}д)`;
    }).join('\n')}`;
  }

  // --- Summary / overview ---
  if (m.includes('сводк') || m.includes('итог') || m.includes('обзор') || m.includes('summary') || m.includes('отчёт')) {
    const done = tasks.filter(t=>t.status==='done').length;
    const inprog = tasks.filter(t=>t.status==='inprogress').length;
    const todo = tasks.filter(t=>t.status==='todo').length;
    const avgProgress = projects.length ? Math.round(projects.reduce((s,p)=>s+(p.progress||0),0)/projects.length) : 0;
    return `📋 **Сводка PMO:**\n\n📦 Продуктов: ${projects.length}\n✅ Задач выполнено: ${done}\n🔄 В работе: ${inprog}\n📋 В очереди: ${todo}\n📈 Средний прогресс: ${avgProgress}%\n👥 Сотрудников: ${users.length}\n\n${avgProgress>=70?'🟢 Отличный темп!':avgProgress>=40?'🟡 Прогресс умеренный':'🔴 Нужно ускориться!'}`;
  }

  // --- This week tasks ---
  if (m.includes('неделя') || m.includes('эта неделя') || m.includes('ближайш')) {
    const now = new Date();
    const week = new Date(); week.setDate(week.getDate()+7);
    const upcoming = tasks.filter(t => t.deadline && t.status!=='done' && new Date(t.deadline)<=week && new Date(t.deadline)>=now);
    if (!upcoming.length) return '📅 На этой неделе дедлайнов нет!';
    return `📅 **Дедлайны на этой неделе (${upcoming.length}):**\n${upcoming.sort((a,b)=>new Date(a.deadline)-new Date(b.deadline)).map(t=>`• ${t.deadline} — ${t.title} (${t.owner})`).join('\n')}`;
  }

  // --- Specific project ---
  for (const p of projects) {
    if (m.includes(p.name.toLowerCase().slice(0,5))) {
      const pTasks = tasks.filter(t=>t.projectId===p.id);
      const done = pTasks.filter(t=>t.status==='done').length;
      return `📦 **${p.name}**\n⭐ North Star: ${p.northStar}\n📊 Прогресс: ${p.progress}%\n👤 Ответственный: ${p.owner}\n✅ Задачи: ${done}/${pTasks.length}\n📅 Дедлайн: ${p.deadline}\n🚦 Статус: ${p.status==='on_track'?'✅ В норме':p.status==='at_risk'?'⚠️ Под риском':'🔴 Критично'}`;
    }
  }

  // --- Team / users ---
  if (m.includes('команд') || m.includes('сотрудник') || m.includes('менеджер') || m.includes('кто есть')) {
    return `👥 **Команда (${users.length} чел.):**\n${users.map(u=>`• ${u.name} — ${u.pos} (${u.product})`).join('\n')}`;
  }

  // --- KPI / metrics ---
  if (m.includes('kpi') || m.includes('метрик') || m.includes('показател')) {
    const allKpis = projects.flatMap(p=>(p.kpis||[]).map(k=>({proj:p.name,...k})));
    if (!allKpis.length) return '📊 KPI пока не заполнены в проектах.';
    return `📊 **KPI по продуктам:**\n${allKpis.map(k=>`• ${k.proj} / ${k.name}: план ${k.plan} → факт ${k.fact}`).join('\n')}`;
  }

  // --- Help ---
  if (m.includes('помог') || m.includes('help') || m.includes('что умеешь') || m.includes('возможн')) {
    return `🤖 **Я умею:**\n\n• 📊 Сводка по проектам и задачам\n• ⚠️ Найти риски и просроченные задачи\n• 👥 Показать загрузку команды\n• 📅 Дедлайны на этой неделе\n• ➕ Создать задачу (напиши "создай задачу X")\n• 📦 Статус конкретного продукта\n• 📈 KPI и метрики\n\nПросто спроси на русском!`;
  }

  // --- Default ---
  return `🤖 Понял! Вот что я нашёл по запросу "${msg}":\n\n📦 Продуктов: ${projects.length} | ✅ Задач: ${tasks.length} | 👥 Команда: ${users.length} чел.\n\nСпроси: "сводка", "риски", "кто загружен", "дедлайны на неделю", "создай задачу...", "kpi" или "помощь" — отвечу подробно.`;
}
