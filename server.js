const express=require('express'),mysql=require('mysql2/promise'),cors=require('cors'),path=require('path'),fs=require('fs'),os=require('os');
const app=express(),PORT=process.env.PORT||8080,DIR=__dirname;
app.use(cors());app.use(express.json({limit:'10mb'}));app.use(express.static(DIR));
const DB={host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT)||3306,user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'pmo_db',charset:'utf8mb4',waitForConnections:true,connectionLimit:10,queueLimit:0};
let db=null;
async function connectDB(){
  try{
    const pool=mysql.createPool(DB);
    await pool.execute('SELECT 1');
    db=pool;
    console.log('  [DB] MySQL connected (pool)!');
  }catch(e){
    console.log('  [DB] MySQL not available, using file: pmo_data.json');
    db=null;
  }
}
const FILE=path.join(DIR,'pmo_data.json');
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
    if(user.password!==password)return res.json({ok:false,error:'wrong_pass'});
    res.json({ok:true,user});
  }catch(e){res.json({ok:false,error:e.message});}
});

app.get('/api/data',async(req,res)=>{
  try{
    if(db){
      const[users]=await db.execute('SELECT * FROM users');
      const[projects]=await db.execute('SELECT * FROM projects');
      const[tasks]=await db.execute('SELECT * FROM tasks');
      const[requests]=await db.execute('SELECT * FROM collab_requests');
      users.forEach(u=>{u.access=pj(u.access,[]);});
      projects.forEach(p=>{p.kpis=pj(p.kpis,[]);p.issues=pj(p.issues,[]);p.monthlyPlan=pj(p.monthlyPlan,[]);p.desc=p.description||'';});
      tasks.forEach(t=>{t.kpis=pj(t.kpis,[]);t.issues=pj(t.issues,[]);t.desc=t.description||'';});
      return res.json({ok:true,users,projects,tasks,collabRequests:requests});
    }
    const d=lf();
    res.json({ok:true,...(d||{users:[],projects:[],tasks:[],collabRequests:[]})});
  }catch(e){res.json({ok:false,error:e.message});}
});

app.post('/api/data',async(req,res)=>{
  const{users,projects,tasks,collabRequests}=req.body;
  try{
    if(db){
      for(const u of(users||[])){
        await db.execute(
          'INSERT INTO users(id,name,role,product,email,pos,password,access)VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),role=VALUES(role),product=VALUES(product),email=VALUES(email),pos=VALUES(pos),password=VALUES(password),access=VALUES(access)',
          [u.id,u.name,u.role||'member',u.product||'',u.email||'',u.pos||'',u.password||'',JSON.stringify(u.access||[])]
        );
      }
      for(const p of(projects||[])){
        await db.execute(
          'INSERT INTO projects(id,name,stage,status,owner,ownerColor,northStar,budgetPlan,budgetFact,deadline,progress,yearlyGoal,kpis,issues,monthlyPlan,description)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),stage=VALUES(stage),status=VALUES(status),owner=VALUES(owner),northStar=VALUES(northStar),budgetPlan=VALUES(budgetPlan),budgetFact=VALUES(budgetFact),deadline=VALUES(deadline),progress=VALUES(progress),yearlyGoal=VALUES(yearlyGoal),kpis=VALUES(kpis),issues=VALUES(issues),monthlyPlan=VALUES(monthlyPlan),description=VALUES(description)',
          [p.id,p.name,p.stage||'',p.status||'on_track',p.owner||'',p.ownerColor||'#4f6ef7',p.northStar||'',p.budgetPlan||0,p.budgetFact||0,p.deadline||null,p.progress||0,p.yearlyGoal||'',JSON.stringify(p.kpis||[]),JSON.stringify(p.issues||[]),JSON.stringify(p.monthlyPlan||[]),p.desc||'']
        );
      }
      for(const t of(tasks||[])){
        await db.execute(
          'INSERT INTO tasks(id,projectId,title,owner,deadline,status,priority,sprint,goal,progress,kpis,issues,description,reqId)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE title=VALUES(title),owner=VALUES(owner),deadline=VALUES(deadline),status=VALUES(status),priority=VALUES(priority),sprint=VALUES(sprint),goal=VALUES(goal),progress=VALUES(progress),kpis=VALUES(kpis),issues=VALUES(issues),description=VALUES(description)',
          [t.id,t.projectId||null,t.title,t.owner||'',t.deadline||null,t.status||'todo',t.priority||'medium',t.sprint||'',t.goal||'',t.progress||null,JSON.stringify(t.kpis||[]),JSON.stringify(t.issues||[]),t.desc||'',t.reqId||null]
        );
      }
      for(const r of(collabRequests||[])){
        await db.execute(
          'INSERT INTO collab_requests(id,fromUserId,toUserId,title,description,priority,deadline,projectId,status,taskId)VALUES(?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status)',
          [r.id,r.fromUserId,r.toUserId,r.title,r.desc||'',r.priority||'medium',r.deadline||null,r.projectId||null,r.status||'pending',r.taskId||null]
        );
      }
      sf({users,projects,tasks,collabRequests});
    }else{
      sf({users,projects,tasks,collabRequests});
    }
    res.json({ok:true});
  }catch(e){
    try{sf({users,projects,tasks,collabRequests});}catch(e2){}
    res.json({ok:true,warning:e.message});
  }
});

app.post('/api/password',async(req,res)=>{
  const{userId,oldPass,newPass}=req.body;
  try{
    if(db){
      const[rows]=await db.execute('SELECT password FROM users WHERE id=?',[userId]);
      if(!rows[0]||rows[0].password!==oldPass)return res.json({ok:false,error:'wrong_pass'});
      await db.execute('UPDATE users SET password=? WHERE id=?',[newPass,userId]);
    }else{
      const d=lf();
      const u=d&&d.users&&d.users.find(u=>u.id===userId);
      if(!u||u.password!==oldPass)return res.json({ok:false,error:'wrong_pass'});
      u.password=newPass;
      sf(d);
    }
    res.json({ok:true});
  }catch(e){res.json({ok:false,error:e.message});}
});

app.post('/api/admin/reset-password',async(req,res)=>{
  const{userId,newPass}=req.body;
  try{
    if(db){
      await db.execute('UPDATE users SET password=? WHERE id=?',[newPass,userId]);
    }else{
      const d=lf();
      const u=d&&d.users&&d.users.find(u=>u.id===userId);
      if(u){u.password=newPass;sf(d);}
    }
    res.json({ok:true});
  }catch(e){res.json({ok:false,error:e.message});}
});

app.get('/{*splat}',(req,res)=>res.sendFile(path.join(DIR,'PMO_Control_Center.html')));

function getIP(){
  const nets=os.networkInterfaces();
  for(const n of Object.keys(nets))
    for(const net of nets[n])
      if(net.family==='IPv4'&&!net.internal)return net.address;
  return 'localhost';
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
// AI AGENT ENDPOINT
// ============================================================
app.post('/api/ai', async (req, res) => {
  const { message, context, apiKey } = req.body;
  if (!message) return res.json({ ok: false, error: 'no message' });

  // Build system prompt with project context
  const systemPrompt = `Ты — ИИ-агент PMO Control Center для компании Турон Телеком.
Ты помогаешь управлять проектами, задачами и командой.
Отвечай кратко, по делу, на русском языке. Используй эмодзи для наглядности.

ТЕКУЩИЕ ДАННЫЕ СИСТЕМЫ:
${JSON.stringify(context || {}, null, 2)}

Ты можешь:
- Анализировать статус проектов и задач
- Находить узкие места и риски
- Давать рекомендации по приоритетам
- Создавать задачи (отвечай JSON: {"action":"create_task","title":"...","owner":"...","priority":"high/medium/low","deadline":"YYYY-MM-DD","projectId":N})
- Обновлять статус задачи (отвечай JSON: {"action":"update_task","taskId":N,"status":"todo/inprogress/done"})
- Отвечать на вопросы о команде и продуктах

Если создаёшь задачу или обновляешь — включи JSON действие в ответ.`;

  // If API key provided — use Claude or Groq
  if (apiKey && (apiKey.startsWith('sk-ant-') || apiKey.startsWith('gsk_'))) {
    try {
      let reply = null;

      if (apiKey.startsWith('gsk_')) {
        // GROQ (free, OpenAI-compatible)
        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            max_tokens: 1024,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }]
          })
        });
        const data = await resp.json();
        if (data.choices && data.choices[0]) reply = data.choices[0].message.content;
        else throw new Error(data.error?.message || 'Groq error');
        return res.json({ ok: true, reply, source: 'groq' });

      } else {
        // CLAUDE (Anthropic)
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024,
            system: systemPrompt, messages: [{ role: 'user', content: message }] })
        });
        const data = await resp.json();
        if (data.content && data.content[0]) reply = data.content[0].text;
        else throw new Error(data.error?.message || 'Claude error');
        return res.json({ ok: true, reply, source: 'claude' });
      }
    } catch (e) {
      console.log('[AI] API failed:', e.message, '— using rule-based');
    }
  }

  // Rule-based AI (works without API key)
  const reply = ruleBasedAI(message, context || {});
  res.json({ ok: true, reply, source: 'local' });
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
