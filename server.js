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
const DEFAULT_DATA={users:[{id:1,name:"Нозим А.",role:"ceo",product:"Все продукты",email:"nozim@company.uz",pos:"CEO",password:"nozim",access:["overview","projects","kanban","gantt","calendar","plans","tasks","collab","admin"],added:"2026-01-01"},{id:2,name:"Алия Ю.",role:"manager",product:"Б2Б, Prime Stream",email:"aliya@company.uz",pos:"Product Manager",password:"aliya",access:["overview","projects","kanban","gantt","calendar","plans","tasks","collab"],added:"2026-01-01"},{id:3,name:"Шахзод Р.",role:"manager",product:"Синерама",email:"shaxzod@company.uz",pos:"Product Manager",password:"shaxzod",access:["overview","projects","kanban","gantt","calendar","plans","tasks","collab"],added:"2026-01-01"},{id:4,name:"Тохир Ю.",role:"manager",product:"Т-Клоуд",email:"toxir@company.uz",pos:"Product Manager",password:"toxir",access:["overview","projects","kanban","gantt","calendar","plans","tasks","collab"],added:"2026-01-01"},{id:5,name:"Акмал Х.",role:"manager",product:"Финанс",email:"akmal@company.uz",pos:"CFO",password:"akmal",access:["overview","projects","kanban","gantt","calendar","plans","tasks","collab"],added:"2026-01-01"},{id:6,name:"Дильноза М.",role:"member",product:"Б2Б",email:"dilnoza@company.uz",pos:"Менеджер B2B",password:"dilnoza",access:["tasks","calendar","collab"],added:"2026-06-05"},{id:7,name:"Сардор Р.",role:"member",product:"Б2Б",email:"sardor@company.uz",pos:"Менеджер B2B",password:"sardor",access:["tasks","calendar","collab"],added:"2026-06-05"},{id:8,name:"Аброр Н.",role:"member",product:"Б2Б",email:"abror@company.uz",pos:"Менеджер B2B регионы",password:"abror",access:["tasks","calendar","collab"],added:"2026-06-05"},{id:9,name:"Малика С.",role:"member",product:"Prime Stream",email:"malika@company.uz",pos:"SMM-менеджер",password:"malika",access:["tasks","calendar","collab"],added:"2026-06-05"}],projects:[{id:1,name:"Турон Телеком — Интернет",stage:"Разработка",status:"on_track",owner:"Нозим А.",ownerColor:"#4f6ef7",northStar:"+25% доход к концу 2026",budgetPlan:0,budgetFact:0,deadline:"2026-12-31",progress:20,yearlyGoal:"Увеличить доход на +25% через рост ААБ и снижение оттока",monthlyPlan:[{month:"Янв",goal:null,actual:null,notes:""},{month:"Фев",goal:null,actual:null,notes:""},{month:"Мар",goal:null,actual:null,notes:""},{month:"Апр",goal:null,actual:null,notes:""},{month:"Май",goal:null,actual:null,notes:""},{month:"Июн",goal:null,actual:null,notes:""},{month:"Июл",goal:null,actual:null,notes:""},{month:"Авг",goal:null,actual:null,notes:""},{month:"Сен",goal:null,actual:null,notes:""},{month:"Окт",goal:null,actual:null,notes:""},{month:"Ноя",goal:null,actual:null,notes:""},{month:"Дек",goal:null,actual:null,notes:""}],kpis:[{name:"ААБ",plan:"—",fact:"—",ok:null},{name:"Приход",plan:"—",fact:"—",ok:null},{name:"Рост дохода YoY",plan:"+25%",fact:"—",ok:null}],issues:[],desc:"Интернет-направление Турон Телеком."},{id:2,name:"Б2Б",stage:"Планирование",status:"critical",owner:"Алия Ю.",ownerColor:"#7c3aed",northStar:"Рост ААБ и суммы договоров",budgetPlan:1000000,budgetFact:100,deadline:"2026-12-31",progress:20,yearlyGoal:"Рост ААБ через новые подключения и суммы через доп.услуги",monthlyPlan:[{month:"Янв",goal:null,actual:null,notes:""},{month:"Фев",goal:null,actual:null,notes:""},{month:"Мар",goal:null,actual:null,notes:""},{month:"Апр",goal:null,actual:null,notes:""},{month:"Май",goal:null,actual:null,notes:""},{month:"Июн",goal:null,actual:null,notes:""},{month:"Июл",goal:null,actual:null,notes:""},{month:"Авг",goal:null,actual:null,notes:""},{month:"Сен",goal:null,actual:null,notes:""},{month:"Окт",goal:null,actual:null,notes:""},{month:"Ноя",goal:null,actual:null,notes:""},{month:"Дек",goal:null,actual:null,notes:""}],kpis:[{name:"ААБ (новые подключения)",plan:"—",fact:"—",ok:null},{name:"Сумма договоров",plan:"—",fact:"—",ok:null},{name:"Удержание (%)",plan:"—",fact:"—",ok:null}],issues:[],desc:"B2B направление: удержание, расширение покрытия, работа с бизнес-центрами, систематизация регионов."},{id:3,name:"Prime Stream",stage:"Разработка",status:"on_track",owner:"Алия Ю.",ownerColor:"#06b6d4",northStar:"Рост прихода",budgetPlan:0,budgetFact:0,deadline:"2026-12-31",progress:25,yearlyGoal:"Рост через подписки, реферальную программу, digital и коллаборации",monthlyPlan:[{month:"Янв",goal:null,actual:null,notes:""},{month:"Фев",goal:null,actual:null,notes:""},{month:"Мар",goal:null,actual:null,notes:""},{month:"Апр",goal:null,actual:null,notes:""},{month:"Май",goal:null,actual:null,notes:""},{month:"Июн",goal:null,actual:null,notes:""},{month:"Июл",goal:null,actual:null,notes:""},{month:"Авг",goal:null,actual:null,notes:""},{month:"Сен",goal:null,actual:null,notes:""},{month:"Окт",goal:null,actual:null,notes:""},{month:"Ноя",goal:null,actual:null,notes:""},{month:"Дек",goal:null,actual:null,notes:""}],kpis:[{name:"Приход",plan:"—",fact:"—",ok:null},{name:"Подписчики",plan:"—",fact:"—",ok:null},{name:"Рефералы",plan:"—",fact:"—",ok:null}],issues:[],desc:"Стриминговый сервис. Проекты: подписка, рефералка, digital/SMM, коллаборации."},{id:4,name:"Синерама",stage:"Инициация",status:"on_track",owner:"Шахзод Р.",ownerColor:"#ec4899",northStar:"MAU и Приход",budgetPlan:0,budgetFact:0,deadline:"2026-12-31",progress:20,yearlyGoal:"Рост MAU, прихода, Турон юзерс и ARPU",monthlyPlan:[{month:"Янв",goal:null,actual:null,notes:""},{month:"Фев",goal:null,actual:null,notes:""},{month:"Мар",goal:null,actual:null,notes:""},{month:"Апр",goal:null,actual:null,notes:""},{month:"Май",goal:null,actual:null,notes:""},{month:"Июн",goal:null,actual:null,notes:""},{month:"Июл",goal:null,actual:null,notes:""},{month:"Авг",goal:null,actual:null,notes:""},{month:"Сен",goal:null,actual:null,notes:""},{month:"Окт",goal:null,actual:null,notes:""},{month:"Ноя",goal:null,actual:null,notes:""},{month:"Дек",goal:null,actual:null,notes:""}],kpis:[{name:"MAU",plan:"—",fact:"—",ok:null},{name:"Приход",plan:"—",fact:"—",ok:null},{name:"Турон юзерс",plan:"—",fact:"—",ok:null},{name:"ARPU",plan:"—",fact:"—",ok:null}],issues:[],desc:"Ключевые метрики: MAU, приход, Турон юзерс, ARPU."},{id:5,name:"Т-Клоуд",stage:"Разработка",status:"on_track",owner:"Тохир Ю.",ownerColor:"#22c55e",northStar:"Выручка 100 млн сум/мес к декабрю 2026 (рост x6 за 6 месяцев)",budgetPlan:0,budgetFact:0,deadline:"2026-12-31",progress:15,yearlyGoal:"Трансформация T-Cloud из хостинг-провайдера в полноценную B2B Cloud Ecosystem. 6 направлений: кросс-продажи ISP, аренда серверов (Bare Metal), Backup SaaS, партнёрская экосистема (TuronID), 1C Cloud (пилот), YouTube-брендинг",monthlyPlan:[{month:"Янв",goal:null,actual:null,notes:""},{month:"Фев",goal:null,actual:null,notes:""},{month:"Мар",goal:null,actual:null,notes:""},{month:"Апр",goal:null,actual:null,notes:""},{month:"Май",goal:null,actual:null,notes:""},{month:"Июн",goal:"Старт: B2B кросс-продажи ISP, 1-й клиент аренды серверов, YouTube запуск",actual:null,notes:"Текущая выручка: 15–16 млн сум/мес"},{month:"Июл",goal:"Backup SaaS: выбор платформы; TuronID интеграция; 1С Cloud: исследование; 2–4 YouTube видео",actual:null,notes:""},{month:"Авг",goal:"Backup SaaS: MVP тест; аренда серверов: 2–3 договора; партнёрские пакеты",actual:null,notes:""},{month:"Сен",goal:"Backup SaaS: 3–5 пилотных клиентов; аренда: 5+ серверов; 1C Cloud: тест с клиентами",actual:null,notes:""},{month:"Окт",goal:"Масштабирование кросс-продаж ISP; аренда: 10+ серверов; реферальные продажи",actual:null,notes:""},{month:"Ноя",goal:"Backup SaaS: коммерческий запуск + bundle VPS+Backup; аренда: 10–15 серверов",actual:null,notes:""},{month:"Дек",goal:"Цель: 100 млн сум/мес. Аренда: 15 серверов; bundle-продукты; 1C Cloud: план на 2027",actual:null,notes:"Целевая выручка: 100 млн сум/мес"}],kpis:[{name:"Выручка/мес",plan:"100 млн сум",fact:"15–16 млн сум",ok:null},{name:"Рост выручки",plan:"x6",fact:"—",ok:null},{name:"Активных B2B клиентов",plan:"30+",fact:"—",ok:null},{name:"Новых клиентов/мес",plan:"5–10",fact:"—",ok:null},{name:"Серверов в аренде",plan:"10–15",fact:"—",ok:null},{name:"Backup SaaS клиентов",plan:"30–50",fact:"—",ok:null},{name:"YouTube подписчиков",plan:"500–1000",fact:"—",ok:null},{name:"1C Cloud пилот",plan:"1–2 клиента",fact:"—",ok:null}],issues:[{title:"Кадровый ресурс (4 чел.) — высокий риск",desc:"Недостаточный кадровый ресурс. Меры: аутсорс-специалисты, автоматизация процессов",priority:"high"},{title:"Расторжение договора аренды клиентом",desc:"Средний риск. Меры: договор 6–12 мес. + депозит 50%",priority:"medium"},{title:"Технические сбои в Backup SaaS",desc:"Средний риск. Меры: обязательное тестирование restore на этапе MVP",priority:"medium"},{title:"Низкая конверсия кросс-продаж ISP",desc:"Средний риск. Меры: усиление бонусной системы, активация альтернативных каналов",priority:"medium"}],desc:"T-Cloud.uz — облачные решения на базе ISP-инфраструктуры Turon. Услуги: VPS, Хостинг, Домены, Аренда серверов (Bare Metal), Backup SaaS, 1C Cloud (пилот). Команда: PM + Универсальный техспециалист + Сисадмин + аутсорс SMM. Стратегия: 4 этапа — Revenue → Recurring → Ecosystem → Branding."},{id:6,name:"Финанс",stage:"Запуск",status:"on_track",owner:"Акмал Х.",ownerColor:"#f59e0b",northStar:"Контроль бюджетов всех продуктов",budgetPlan:0,budgetFact:0,deadline:"2026-12-31",progress:30,yearlyGoal:"Прозрачный бюджетный контроль",monthlyPlan:[{month:"Янв",goal:null,actual:null,notes:""},{month:"Фев",goal:null,actual:null,notes:""},{month:"Мар",goal:null,actual:null,notes:""},{month:"Апр",goal:null,actual:null,notes:""},{month:"Май",goal:null,actual:null,notes:""},{month:"Июн",goal:null,actual:null,notes:""},{month:"Июл",goal:null,actual:null,notes:""},{month:"Авг",goal:null,actual:null,notes:""},{month:"Сен",goal:null,actual:null,notes:""},{month:"Окт",goal:null,actual:null,notes:""},{month:"Ноя",goal:null,actual:null,notes:""},{month:"Дек",goal:null,actual:null,notes:""}],kpis:[{name:"Исполнение бюджета",plan:"100%",fact:"—",ok:null}],issues:[],desc:"Финансовый контроль."}],tasks:[{id:1,projectId:1,title:"Новые тарифы — разработка и запуск (Рост ААБ)",owner:"Нозим А.",deadline:"2026-07-01",status:"inprogress",sprint:"Q3 2026",priority:"high",goal:"Увеличить ААБ через новые конкурентные тарифы",kpis:[],issues:[],desc:""},{id:2,projectId:1,title:"Снижение неактивных абонентов — план активации",owner:"Нозим А.",deadline:"2026-07-15",status:"todo",sprint:"Q3 2026",priority:"high",goal:"",kpis:[],issues:[],desc:""},{id:3,projectId:1,title:"Работа с корзиной (удержание) — тестирование 01.06–01.09",owner:"Нозим А.",deadline:"2026-09-01",status:"inprogress",sprint:"Тест 01.06–01.09.2026",priority:"high",goal:"",kpis:[],issues:[],desc:""},{id:4,projectId:2,title:"Удержание клиентов",owner:"Дильноза М.",deadline:"2026-12-31",status:"inprogress",sprint:"Q3 2026",priority:"high",goal:"Удержать существующую базу B2B клиентов через доп.услуги и работу с оттоком",kpis:[{name:"Churn rate",plan:"—",fact:"—",ok:null},{name:"Удержано клиентов",plan:"—",fact:"—",ok:null}],issues:[],desc:"Ответственный: Дильноза Марифова"},{id:5,projectId:2,title:"Увеличение зоны покрытия: Parking Mall БЦ",owner:"Алия Ю.",deadline:"2026-09-30",status:"todo",sprint:"Q3 2026",priority:"high",goal:"Подключить Parking Mall бизнес центр",kpis:[],issues:[],desc:"Новая территория — бизнес центр Parking Mall"},{id:6,projectId:2,title:"Увеличение зоны покрытия: Imperial БЦ",owner:"Алия Ю.",deadline:"2026-09-30",status:"todo",sprint:"Q3 2026",priority:"high",goal:"Подключить Imperial бизнес центр",kpis:[],issues:[],desc:"Новая территория — бизнес центр Imperial"},{id:7,projectId:2,title:"Строительство на новостройках",owner:"Алия Ю.",deadline:"2026-12-31",status:"todo",sprint:"Q3-Q4 2026",priority:"medium",goal:"Расширение инфраструктуры на новостройках",kpis:[],issues:[],desc:""},{id:8,projectId:2,title:"Работа с Бизнес Центрами — брендирование и реклама",owner:"Сардор Р.",deadline:"2026-10-31",status:"inprogress",sprint:"Q3 2026",priority:"high",goal:"Брендирование в БЦ, рекламные активности для B2B привлечения",kpis:[{name:"Охваченных БЦ",plan:"—",fact:"—",ok:null},{name:"Новых лидов из БЦ",plan:"—",fact:"—",ok:null}],issues:[],desc:"Ответственный: Рузметов Сардор."},{id:9,projectId:2,title:"Систематизация отдела B2B в регионах",owner:"Аброр Н.",deadline:"2026-12-31",status:"inprogress",sprint:"Q3-Q4 2026",priority:"high",goal:"Выстроить системную работу B2B в регионах: набор менеджеров и регламентация",kpis:[{name:"Набрано менеджеров",plan:"—",fact:"—",ok:null},{name:"Регламентов утверждено",plan:"—",fact:"—",ok:null}],issues:[],desc:"Ответственный: Нормуродов Аброр."},{id:10,projectId:3,title:"Проект подписки — запуск",owner:"Алия Ю.",deadline:"2026-09-01",status:"inprogress",sprint:"Q3 2026",priority:"high",goal:"Запустить подписочную модель монетизации Prime Stream",kpis:[{name:"Подписчиков",plan:"—",fact:"—",ok:null},{name:"MRR",plan:"—",fact:"—",ok:null}],issues:[],desc:"Срок запуска: 01.09.2026"},{id:11,projectId:3,title:"Рефералка — условия готовы, запуск",owner:"Алия Ю.",deadline:"2026-08-01",status:"inprogress",sprint:"Q3 2026",priority:"high",goal:"Запустить реферальную программу (условия уже готовы)",kpis:[{name:"Рефералов",plan:"—",fact:"—",ok:null}],issues:[],desc:"Этап: запуск."},{id:12,projectId:3,title:"Digital — SMM и социальные сети",owner:"Малика С.",deadline:"2026-12-31",status:"inprogress",sprint:"Q3 2026",priority:"medium",goal:"Развить присутствие Prime Stream в социальных сетях",kpis:[{name:"Подписчики соцсетей",plan:"—",fact:"—",ok:null},{name:"Охват публикаций",plan:"—",fact:"—",ok:null}],issues:[],desc:"Ответственный: Малика С."},{id:13,projectId:3,title:"Коллаборация: Soft Optical — AI видеонаблюдение",owner:"Алия Ю.",deadline:"2026-10-01",status:"todo",sprint:"Q3 2026",priority:"medium",goal:"Партнёрство с Soft Optical для интеграции AI видеонаблюдения",kpis:[],issues:[],desc:""},{id:14,projectId:3,title:"Коллаборация: Soft Smart AI — умный дом и офис",owner:"Алия Ю.",deadline:"2026-10-01",status:"todo",sprint:"Q3 2026",priority:"medium",goal:"Партнёрство с Soft Smart AI для умного дома и офиса",kpis:[],issues:[],desc:""},{id:15,projectId:4,title:"MAU рост — план привлечения",owner:"Шахзод Р.",deadline:"2026-07-31",status:"inprogress",sprint:"Q3 2026",priority:"high",goal:"",kpis:[],issues:[],desc:""},{id:16,projectId:4,title:"Рост прихода — монетизация",owner:"Шахзод Р.",deadline:"2026-07-31",status:"inprogress",sprint:"Q3 2026",priority:"high",goal:"",kpis:[],issues:[],desc:""},{id:17,projectId:4,title:"Турон юзерс — интеграция",owner:"Шахзод Р.",deadline:"2026-08-15",status:"todo",sprint:"Q3 2026",priority:"medium",goal:"",kpis:[],issues:[],desc:""},{id:18,projectId:5,title:"1С Клоуд — исследование, пилот и коммерческий запуск",owner:"Тохир Ю.",deadline:"2026-12-31",status:"inprogress",sprint:"Q3-Q4 2026",priority:"high",goal:"Оценить целесообразность 1C Cloud и протестировать с 1–2 клиентами. Коммерческий запуск — Q1 2027",kpis:[{name:"Пилотных клиентов",plan:"1–2",fact:"—",ok:null},{name:"MVP готов",plan:"Q4 2026",fact:"—",ok:null}],issues:[],desc:"Июль: исследование лицензирования, переговоры с 1C-франчайзи. Август: пилотная среда. Сен–Окт: тест с клиентами. Ноя–Дек: план запуска 2027."},{id:19,projectId:5,title:"Backup SaaS — платформа, MVP, коммерческий запуск",owner:"Тохир Ю.",deadline:"2026-11-30",status:"todo",sprint:"Q3-Q4 2026",priority:"high",goal:"Формирование рекуррентной выручки — наиболее быстро монетизируемое облачное направление",kpis:[{name:"Пилотных клиентов",plan:"5–10",fact:"—",ok:null},{name:"Выручка Backup/мес",plan:"10–20 млн сум",fact:"—",ok:null}],issues:[],desc:"Июль: выбор платформы (Proxmox/Veeam). Август: MVP. Сен–Окт: 3–5 пилотных клиентов. Ноя–Дек: коммерческий запуск + bundle."},{id:20,projectId:5,title:"YouTube канал — брендинг и лидогенерация",owner:"Тохир Ю.",deadline:"2026-12-31",status:"inprogress",sprint:"Июн–Дек 2026",priority:"medium",goal:"Формирование бренда T-Cloud и органическая лидогенерация при минимальном бюджете",kpis:[{name:"Подписчиков",plan:"500–1000",fact:"—",ok:null},{name:"Видео в месяц",plan:"2–4",fact:"—",ok:null}],issues:[],desc:"Контент: VPS, Хостинг vs VPS, Backup, Аренда сервера, Облака. Приоритет — Shorts. CTA на tcloud.uz."},{id:21,projectId:6,title:"Бюджетный контроль Q3 — все продукты",owner:"Акмал Х.",deadline:"2026-07-15",status:"inprogress",sprint:"Q3 2026",priority:"high",goal:"",kpis:[],issues:[],desc:""},{id:22,projectId:5,title:"Кросс-продажи ISP — выход на B2B, sales-скрипты, обучение",owner:"Тохир Ю.",deadline:"2026-07-31",status:"inprogress",sprint:"Июн–Июл 2026",priority:"high",goal:"Увеличить выручку T-Cloud в 6 раз через B2B-сегмент Turon ISP",kpis:[{name:"Активных B2B клиентов",plan:"30+",fact:"—",ok:null},{name:"Новых клиентов/мес",plan:"5–10",fact:"—",ok:null},{name:"Рост выручки",plan:"x6",fact:"—",ok:null}],issues:[],desc:"Июн–Июл: sales-скрипты, offer-пакет, обучение. Авг–Сен: корпоративные клиенты, bundle (Интернет+VPS, Интернет+Backup), CRM. Окт–Дек: масштабирование, пакетные продукты, цель x6."},{id:23,projectId:5,title:"Аренда серверов (Bare Metal) — оформление, 1-й клиент, масштаб",owner:"Тохир Ю.",deadline:"2026-12-31",status:"inprogress",sprint:"Июн–Дек 2026",priority:"high",goal:"Генерация рекуррентной выручки через аренду выделенных серверов корпоративным клиентам",kpis:[{name:"Серверов в аренде",plan:"10–15",fact:"—",ok:null},{name:"Выручка серверы/мес",plan:"20–45 млн сум",fact:"—",ok:null},{name:"Мин. срок договора",plan:"6–12 мес.",fact:"—",ok:null}],issues:[],desc:"Модель: T-Cloud покупает → сдаёт в аренду. Стоимость: $700–$3000. Аренда: 2–3 млн сум/мес. Окупаемость: 6–8 мес. Депозит: 50%. Июн–Июл: договор+прайс+1-й клиент. Авг–Сен: 2–3 договора. Окт–Дек: 10–15 серверов."},{id:24,projectId:5,title:"Партнёрская экосистема — TuronID, пакеты, реферальные продажи",owner:"Тохир Ю.",deadline:"2026-12-31",status:"todo",sprint:"Июл–Дек 2026",priority:"high",goal:"Генерация лидов и bundle-продаж через экосистему Turon",kpis:[{name:"Лидов/мес от партнёров",plan:"5+",fact:"—",ok:null},{name:"Активных партнёров",plan:"4",fact:"—",ok:null}],issues:[],desc:"Партнёры: Turon ISP, TuronID, Turon ISP B2B, Primestream.uz. Июл–Авг: TuronID интеграция, пакеты, бонусы/revenue share. Сен–Окт: партнёрские соглашения, реферальные продажи. Ноя–Дек: масштабирование, enterprise через Turon ISP B2B."}],collabRequests:[]};
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
