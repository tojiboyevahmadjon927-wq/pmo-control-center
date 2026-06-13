/**
 * PMO AI AGENT — Claude Agent with Tool Use
 * Управляет задачами, проектами и командой через Telegram
 * Запуск: node agent.js
 */

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const DIR         = __dirname;
const CONFIG_FILE = path.join(DIR, 'agent_config.json');
const DATA_DIR    = process.env.DATA_DIR || path.join(DIR, 'data');
const DATA_FILE   = path.join(DATA_DIR, 'pmo_data.json');

// ============================================================
// CONFIG
// ============================================================
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch(e) { console.error('❌ agent_config.json не найден. Создай его по образцу.'); process.exit(1); }
}

function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch(e) { return { users: [], projects: [], tasks: [], collabRequests: [] }; }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ============================================================
// TOOLS (SKILLS) DEFINITION — what the agent can do
// ============================================================
const TOOLS = [
  {
    name: 'get_dashboard',
    description: 'Получить полный дашборд: все проекты, задачи, статусы, KPI, загрузку команды и просрочки. Используй при любом общем вопросе о состоянии дел.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_tasks',
    description: 'Получить список задач с фильтрацией',
    input_schema: {
      type: 'object',
      properties: {
        status:      { type: 'string', enum: ['todo','inprogress','done','all'], description: 'Фильтр по статусу' },
        owner:       { type: 'string', description: 'Имя ответственного' },
        project_id:  { type: 'number', description: 'ID продукта' },
        overdue_only:{ type: 'boolean', description: 'Только просроченные' },
        sprint:      { type: 'string', description: 'Фильтр по спринту' }
      }
    }
  },
  {
    name: 'create_task',
    description: 'Создать новую задачу в системе PMO',
    input_schema: {
      type: 'object',
      required: ['title'],
      properties: {
        title:      { type: 'string', description: 'Название задачи' },
        owner:      { type: 'string', description: 'Имя ответственного' },
        project_id: { type: 'number', description: 'ID продукта (1=Интернет, 2=Б2Б, 3=Prime Stream, 4=Синерама, 5=Т-Клоуд, 6=Финанс)' },
        priority:   { type: 'string', enum: ['high','medium','low'], description: 'Приоритет' },
        deadline:   { type: 'string', description: 'Дедлайн в формате YYYY-MM-DD' },
        sprint:     { type: 'string', description: 'Спринт, например Q3 2026' },
        goal:       { type: 'string', description: 'Цель задачи' },
        desc:       { type: 'string', description: 'Описание' }
      }
    }
  },
  {
    name: 'update_task',
    description: 'Обновить существующую задачу (статус, ответственный, дедлайн, прогресс и т.д.)',
    input_schema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id:  { type: 'number', description: 'ID задачи' },
        status:   { type: 'string', enum: ['todo','inprogress','done'] },
        owner:    { type: 'string' },
        deadline: { type: 'string' },
        priority: { type: 'string', enum: ['high','medium','low'] },
        progress: { type: 'number', minimum: 0, maximum: 100 },
        sprint:   { type: 'string' },
        goal:     { type: 'string' }
      }
    }
  },
  {
    name: 'delete_task',
    description: 'Удалить задачу',
    input_schema: {
      type: 'object',
      required: ['task_id'],
      properties: { task_id: { type: 'number' } }
    }
  },
  {
    name: 'update_project',
    description: 'Обновить данные продукта (прогресс, статус, North Star, бюджет)',
    input_schema: {
      type: 'object',
      required: ['project_id'],
      properties: {
        project_id: { type: 'number' },
        progress:   { type: 'number', minimum: 0, maximum: 100 },
        status:     { type: 'string', enum: ['on_track','at_risk','critical','paused','done'] },
        northStar:  { type: 'string' },
        budgetFact: { type: 'number' }
      }
    }
  },
  {
    name: 'add_comment',
    description: 'Добавить комментарий к задаче',
    input_schema: {
      type: 'object',
      required: ['task_id','comment'],
      properties: {
        task_id: { type: 'number' },
        comment: { type: 'string' }
      }
    }
  },
  {
    name: 'send_telegram',
    description: 'Отправить сообщение конкретному сотруднику в Telegram',
    input_schema: {
      type: 'object',
      required: ['user_name','message'],
      properties: {
        user_name: { type: 'string', description: 'Имя пользователя из системы (например: Алия Ю.)' },
        message:   { type: 'string', description: 'Текст сообщения' }
      }
    }
  },
  {
    name: 'send_telegram_broadcast',
    description: 'Отправить сообщение всей команде в Telegram',
    input_schema: {
      type: 'object',
      required: ['message'],
      properties: { message: { type: 'string' } }
    }
  },
  {
    name: 'get_user_tasks',
    description: 'Получить все активные задачи конкретного сотрудника',
    input_schema: {
      type: 'object',
      required: ['user_name'],
      properties: { user_name: { type: 'string' } }
    }
  }
];

// ============================================================
// TOOL EXECUTOR
// ============================================================
function executeTool(name, input, config) {
  const data = loadData();

  if (name === 'get_dashboard') {
    const now = new Date();
    const overdue = data.tasks.filter(t => t.deadline && new Date(t.deadline) < now && t.status !== 'done');
    const load = {};
    data.tasks.filter(t => t.status !== 'done').forEach(t => {
      load[t.owner] = (load[t.owner] || 0) + 1;
    });
    return {
      projects: data.projects.map(p => ({
        id: p.id, name: p.name, status: p.status, progress: p.progress,
        owner: p.owner, deadline: p.deadline, northStar: p.northStar,
        kpis: p.kpis, issues: p.issues, budgetPlan: p.budgetPlan, budgetFact: p.budgetFact
      })),
      tasks_summary: {
        total: data.tasks.length,
        done: data.tasks.filter(t => t.status === 'done').length,
        inprogress: data.tasks.filter(t => t.status === 'inprogress').length,
        todo: data.tasks.filter(t => t.status === 'todo').length,
        overdue: overdue.length
      },
      overdue_tasks: overdue.map(t => ({
        id: t.id, title: t.title, owner: t.owner, deadline: t.deadline,
        days_overdue: Math.round((now - new Date(t.deadline)) / 86400000)
      })),
      team_workload: load,
      users: data.users.map(u => ({ id: u.id, name: u.name, pos: u.pos, product: u.product }))
    };
  }

  if (name === 'get_tasks') {
    let tasks = data.tasks;
    if (input.status && input.status !== 'all') tasks = tasks.filter(t => t.status === input.status);
    if (input.owner) tasks = tasks.filter(t => (t.owner||'').toLowerCase().includes(input.owner.toLowerCase()));
    if (input.project_id) tasks = tasks.filter(t => t.projectId === input.project_id);
    if (input.sprint) tasks = tasks.filter(t => (t.sprint||'').includes(input.sprint));
    if (input.overdue_only) {
      const now = new Date();
      tasks = tasks.filter(t => t.deadline && new Date(t.deadline) < now && t.status !== 'done');
    }
    return tasks.map(t => {
      const p = data.projects.find(x => x.id === t.projectId);
      return { id: t.id, title: t.title, owner: t.owner, status: t.status,
               priority: t.priority, deadline: t.deadline, progress: t.progress,
               sprint: t.sprint, project: p ? p.name : '—', goal: t.goal };
    });
  }

  if (name === 'create_task') {
    const newId = Math.max(0, ...data.tasks.map(t => t.id)) + 1;
    const task = {
      id: newId,
      title: input.title,
      owner: input.owner || '',
      projectId: input.project_id || null,
      priority: input.priority || 'medium',
      deadline: input.deadline || '',
      status: 'todo',
      sprint: input.sprint || 'Q3 2026',
      goal: input.goal || '',
      progress: null,
      kpis: [], issues: [],
      desc: input.desc || '',
      comments: [], checklist: []
    };
    data.tasks.push(task);
    saveData(data);
    return { ok: true, task_id: newId, message: `Задача "${input.title}" создана (ID: ${newId})` };
  }

  if (name === 'update_task') {
    const t = data.tasks.find(x => x.id === input.task_id);
    if (!t) return { ok: false, error: `Задача ${input.task_id} не найдена` };
    const fields = ['status','owner','deadline','priority','progress','sprint','goal'];
    fields.forEach(f => { if (input[f] !== undefined) t[f] = input[f]; });
    saveData(data);
    return { ok: true, message: `Задача ${input.task_id} обновлена`, task: { id: t.id, title: t.title, status: t.status } };
  }

  if (name === 'delete_task') {
    const idx = data.tasks.findIndex(x => x.id === input.task_id);
    if (idx === -1) return { ok: false, error: 'Задача не найдена' };
    const title = data.tasks[idx].title;
    data.tasks.splice(idx, 1);
    saveData(data);
    return { ok: true, message: `Задача "${title}" удалена` };
  }

  if (name === 'update_project') {
    const p = data.projects.find(x => x.id === input.project_id);
    if (!p) return { ok: false, error: 'Продукт не найден' };
    ['progress','status','northStar','budgetFact'].forEach(f => { if (input[f] !== undefined) p[f] = input[f]; });
    saveData(data);
    return { ok: true, message: `Продукт "${p.name}" обновлён` };
  }

  if (name === 'add_comment') {
    const t = data.tasks.find(x => x.id === input.task_id);
    if (!t) return { ok: false, error: 'Задача не найдена' };
    if (!t.comments) t.comments = [];
    t.comments.push({
      userId: 0, userName: 'ИИ Агент',
      text: input.comment,
      date: new Date().toLocaleString('ru')
    });
    saveData(data);
    return { ok: true, message: 'Комментарий добавлен' };
  }

  if (name === 'get_user_tasks') {
    const tasks = data.tasks.filter(t =>
      (t.owner||'').toLowerCase().includes(input.user_name.toLowerCase()) && t.status !== 'done'
    );
    return { user: input.user_name, active_tasks: tasks.length, tasks };
  }

  if (name === 'send_telegram') {
    const chatIds = config.telegram_chat_ids || {};
    // Find user by partial name match
    const key = Object.keys(chatIds).find(k => k.toLowerCase().includes(input.user_name.toLowerCase().split(' ')[0].toLowerCase()));
    if (!key || !chatIds[key]) {
      return { ok: false, error: `Telegram ID для ${input.user_name} не настроен в agent_config.json` };
    }
    sendTelegramMsg(config.telegram_token, chatIds[key], input.message);
    return { ok: true, message: `Сообщение отправлено ${input.user_name}` };
  }

  if (name === 'send_telegram_broadcast') {
    const chatIds = config.telegram_chat_ids || {};
    let sent = 0;
    Object.values(chatIds).forEach(chatId => {
      if (chatId) { sendTelegramMsg(config.telegram_token, chatId, input.message); sent++; }
    });
    return { ok: true, message: `Отправлено ${sent} участникам` };
  }

  return { ok: false, error: `Неизвестный инструмент: ${name}` };
}

// ============================================================
// API CALLS — supports Claude (sk-ant-) and Groq (gsk_)
// ============================================================
function httpPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers }
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function claudeRequest(body, config) {
  const key = config.claude_api_key || config.groq_api_key || '';

  if (key.startsWith('gsk_')) {
    // GROQ API (OpenAI-compatible, free)
    const msgs = [];
    if (body.system) msgs.push({ role: 'system', content: body.system });
    for (const m of body.messages) {
      if (typeof m.content === 'string') {
        msgs.push({ role: m.role, content: m.content });
      } else if (Array.isArray(m.content)) {
        // Convert tool results
        const texts = m.content.filter(b => b.type === 'tool_result').map(b => 'Tool result: ' + b.content).join('\n');
        const textBlocks = m.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
        const toolCalls = m.content.filter(b => b.type === 'tool_use');
        if (toolCalls.length) {
          msgs.push({ role: 'assistant', content: textBlocks || 'Using tools...',
            tool_calls: toolCalls.map(t => ({ id: t.id, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.input) } }))
          });
        } else if (texts || textBlocks) {
          msgs.push({ role: m.role === 'user' ? 'user' : 'assistant', content: texts || textBlocks });
        }
      }
    }

    const groqBody = {
      model: config.groq_model || 'llama-3.3-70b-versatile',
      messages: msgs,
      max_tokens: 2048,
      temperature: 0.7
    };
    if (body.tools) {
      groqBody.tools = body.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
      groqBody.tool_choice = 'auto';
    }

    const resp = await httpPost('api.groq.com', '/openai/v1/chat/completions',
      { 'Authorization': 'Bearer ' + key }, groqBody);

    if (resp.error) throw new Error(resp.error.message);
    const choice = resp.choices[0];
    const content = [];
    if (choice.message.content) content.push({ type: 'text', text: choice.message.content });
    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments) });
      }
    }
    return { content, stop_reason: choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn' };

  } else {
    // CLAUDE API (Anthropic)
    const resp = await httpPost('api.anthropic.com', '/v1/messages',
      { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body);
    if (resp.error) throw new Error(resp.error.message);
    return resp;
  }
}

// ============================================================
// TELEGRAM API
// ============================================================
function sendTelegramMsg(token, chatId, text) {
  if (!token || !chatId) return;
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });
  const req = https.request({
    hostname: 'api.telegram.org',
    path: `/bot${token}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, res => { res.resume(); });
  req.on('error', () => {});
  req.write(body);
  req.end();
}

function telegramGetUpdates(token, offset) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/getUpdates?offset=${offset}&timeout=30&allowed_updates=%5B%22message%22%5D`,
      method: 'GET'
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ============================================================
// MAIN AGENT LOOP — processes a message and returns a reply
// ============================================================
const conversationHistory = {};

async function runAgent(userMessage, chatId, config) {
  if (!conversationHistory[chatId]) conversationHistory[chatId] = [];
  conversationHistory[chatId].push({ role: 'user', content: userMessage });

  // Keep last 20 messages
  if (conversationHistory[chatId].length > 20) {
    conversationHistory[chatId] = conversationHistory[chatId].slice(-20);
  }

  const systemPrompt = `Ты — персональный ИИ-агент PMO Ахмадджона для управления продуктами компании Турон Телеком.

ТВОИ ПРОДУКТЫ:
1. Турон Телеком — Интернет (ID:1)
2. Б2Б (ID:2)  
3. Prime Stream (ID:3)
4. Синерама (ID:4)
5. Т-Клоуд (ID:5)
6. Финанс (ID:6)

ТВОИ НАВЫКИ (инструменты):
- Смотришь дашборд и аналитику
- Создаёшь, обновляешь, удаляешь задачи
- Уведомляешь команду через Telegram
- Обновляешь прогресс продуктов

СТИЛЬ РАБОТЫ:
- Отвечай кратко и по делу на русском
- Используй эмодзи для наглядности
- При запросах на действие — СРАЗУ выполняй через инструменты, не спрашивай лишнего
- После выполнения действия — предложи отправить уведомление ответственному в Telegram
- Дата сегодня: ${new Date().toLocaleDateString('ru-RU', {weekday:'long',day:'numeric',month:'long',year:'numeric'})}`;

  let messages = [...conversationHistory[chatId]];

  // Agentic loop with tool use
  for (let i = 0; i < 5; i++) {
    const response = await claudeRequest({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      tools: TOOLS,
      messages
    }, config);

    if (response.error) throw new Error(response.error.message);

    // Check if Claude wants to use tools
    const toolUses = response.content.filter(b => b.type === 'tool_use');
    const textBlocks = response.content.filter(b => b.type === 'text');

    if (response.stop_reason === 'end_turn' || toolUses.length === 0) {
      // Final answer
      const finalText = textBlocks.map(b => b.text).join('\n');
      conversationHistory[chatId].push({ role: 'assistant', content: response.content });
      return finalText;
    }

    // Execute tools
    messages.push({ role: 'assistant', content: response.content });

    const toolResults = toolUses.map(tu => {
      console.log(`[Agent] 🔧 Tool: ${tu.name}`, JSON.stringify(tu.input).slice(0, 100));
      const result = executeTool(tu.name, tu.input, config);
      console.log(`[Agent] ✅ Result:`, JSON.stringify(result).slice(0, 100));
      return {
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(result)
      };
    });

    messages.push({ role: 'user', content: toolResults });
  }

  return '⚠️ Агент завершил максимальное количество шагов.';
}

// ============================================================
// HTTP SERVER — for web interface integration
// ============================================================
function startHttpServer(config) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    if (req.method === 'POST' && req.url === '/agent') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const { message, chatId } = JSON.parse(body);
          const reply = await runAgent(message, chatId || 'web', config);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, reply }));
        } catch(e) {
          console.error('[Agent HTTP Error]', e.message);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
    } else {
      res.writeHead(404); res.end('Not found');
    }
  });

  server.listen(8081, '0.0.0.0', () => {
    console.log('  [Agent HTTP] Ready at http://localhost:8081/agent');
  });
}

// ============================================================
// TELEGRAM BOT POLLING
// ============================================================
async function startTelegramBot(config) {
  if (!config.telegram_token) {
    console.log('  [Telegram] ⚠️  Токен не настроен — Telegram отключён');
    return;
  }

  const adminChatIds = config.admin_telegram_ids || [];
  let offset = 0;
  console.log('  [Telegram] ✅ Бот запущен!');

  async function poll() {
    try {
      const data = await telegramGetUpdates(config.telegram_token, offset);
      if (data.ok && data.result.length) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          const msg = update.message;
          if (!msg || !msg.text) continue;

          const chatId = String(msg.chat.id);
          const text = msg.text;
          const fromName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ');

          console.log(`[Telegram] 📨 ${fromName} (${chatId}): ${text.slice(0,80)}`);

          // Check access
          const isAdmin = adminChatIds.includes(chatId) || adminChatIds.length === 0;
          if (!isAdmin) {
            sendTelegramMsg(config.telegram_token, chatId, '⛔ Доступ запрещён. Обратитесь к администратору.');
            continue;
          }

          // Typing indicator
          https.request({
            hostname: 'api.telegram.org',
            path: `/bot${config.telegram_token}/sendChatAction`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          }, r => r.resume()).end(JSON.stringify({ chat_id: chatId, action: 'typing' }));

          try {
            const reply = await runAgent(text, chatId, config);
            sendTelegramMsg(config.telegram_token, chatId, reply);
          } catch(e) {
            sendTelegramMsg(config.telegram_token, chatId, `❌ Ошибка: ${e.message}`);
            console.error('[Telegram Agent Error]', e.message);
          }
        }
      }
    } catch(e) {
      console.error('[Telegram Poll Error]', e.message);
    }
    setTimeout(poll, 1000);
  }

  poll();
}

// ============================================================
// STARTUP
// ============================================================
async function main() {
  const config = loadConfig();

  console.log('\n' + '='.repeat(50));
  console.log('  🤖 PMO AI AGENT — Турон Телеком');
  console.log('='.repeat(50));
  const activeKey = config.claude_api_key || config.groq_api_key || '';
  const keyType = activeKey.startsWith('gsk_') ? '✅ Groq (бесплатно)' : activeKey ? '✅ Claude API' : '❌ НЕ НАСТРОЕН';
  console.log(`  AI API:      ${keyType}`);
  console.log(`  Telegram:    ${config.telegram_token ? '✅ Настроен' : '⚠️  Не настроен'}`);
  console.log(`  Данные PMO:  ${fs.existsSync(DATA_FILE) ? '✅ pmo_data.json' : '⚠️  Файл не найден'}`);
  console.log('='.repeat(50) + '\n');

  if (!activeKey) {
    console.error('❌ Добавь claude_api_key или groq_api_key в agent_config.json!');
    process.exit(1);
  }

  startHttpServer(config);
  await startTelegramBot(config);
}

main();
