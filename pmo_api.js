// PMO API Sync
// <script src="pmo_api.js"></script>

(function() {
  const API          = '';
  const SESSION_KEY  = 'pmo_session_user';
  const DATA_KEY     = 'pmo_data_cache';   // full data backup in localStorage

  // ---- CACHE VERSION CHECK (clears old cache if tabs changed) ----
  var CACHE_VERSION = '3.1';
  if (localStorage.getItem('pmo_cache_ver') !== CACHE_VERSION) {
    localStorage.removeItem('pmo_data_cache');
    localStorage.setItem('pmo_cache_ver', CACHE_VERSION);
    console.log('[API] Cache cleared - new version');
  }

  var pendingSync    = false;
  var syncTimer      = null;

  // ---- SAVE ALL DATA TO LOCALSTORAGE (local backup) ----
  function saveLocalCache() {
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify({
        users: users, projects: projects,
        tasks: biTasks, collabRequests: collabRequests,
        savedAt: Date.now()
      }));
    } catch(e) {}
  }

  // ---- LOAD FROM LOCALSTORAGE CACHE ----
  function loadLocalCache() {
    try {
      var d = JSON.parse(localStorage.getItem(DATA_KEY));
      if (!d) return false;
      if (d.users         && d.users.length)    users          = d.users;
      if (d.projects      && d.projects.length) projects       = d.projects;
      if (d.tasks         && d.tasks.length)    biTasks        = d.tasks;
      if (d.collabRequests)                     collabRequests = d.collabRequests;
      console.log('[API] Loaded from localStorage cache');
      return true;
    } catch(e) { return false; }
  }

  // ---- LOAD DATA FROM SERVER ----
  window.loadFromServer = async function() {
    var r    = await fetch(API + '/api/data');
    var data = await r.json();
    if (data.ok) {
      if (data.users         && data.users.length)    users          = data.users;
      if (data.projects      && data.projects.length) projects       = data.projects;
      // Only overwrite tasks if server has >= local count (prevents losing tasks created before sync)
      if (data.tasks && data.tasks.length >= biTasks.length) {
        biTasks = data.tasks;
      } else if (data.tasks && data.tasks.length > 0 && biTasks.length > data.tasks.length) {
        // Merge: server + any local-only tasks not yet synced
        var serverIds = new Set(data.tasks.map(function(t){ return t.id; }));
        var localOnly = biTasks.filter(function(t){ return !serverIds.has(t.id); });
        biTasks = data.tasks.concat(localOnly);
        console.log('[API] Merged', localOnly.length, 'local-only tasks with server data');
      } else if (data.tasks) {
        biTasks = data.tasks;
      }
      if (data.collabRequests)                        collabRequests = data.collabRequests;
      saveLocalCache(); // keep local cache in sync with server
      console.log('[API] Loaded from server');
    }
  };

  // ---- SYNC NOW (immediate) ----
  window.syncNow = async function() {
    pendingSync = false;
    saveLocalCache(); // always save locally first
    try {
      await fetch(API + '/api/data', {
        method:  'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          users: users, projects: projects,
          tasks: biTasks, collabRequests: collabRequests
        })
      });
      // Refresh current user from updated list
      if (currentUser) {
        var fresh = users.find(function(u){ return u.id === currentUser.id; });
        if (fresh) {
          currentUser = fresh;
          try { localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser)); } catch(e) {}
        }
      }
      console.log('[API] Saved to server');
    } catch(e) {
      console.warn('[API] Server save failed, local cache updated:', e.message);
    }
  };

  // ---- SYNC TO SERVER (debounced) ----
  window.syncToServer = function() {
    pendingSync = true;
    saveLocalCache(); // save to localStorage immediately (don't wait for debounce)
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function() { syncNow(); }, 800);
  };

  // ---- FORCE SYNC ON PAGE CLOSE ----
  window.addEventListener('beforeunload', function() {
    if (pendingSync) {
      clearTimeout(syncTimer);
      saveLocalCache();
      // Fire-and-forget sync (browser may cancel it, but localStorage is already saved)
      navigator.sendBeacon(API + '/api/data',
        new Blob([JSON.stringify({
          users: users, projects: projects,
          tasks: biTasks, collabRequests: collabRequests
        })], {type: 'application/json'})
      );
    }
  });

  // ---- SHOW UI ----
  function showUI(user) {
    try {
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('topbar').style.display       = 'flex';
      document.getElementById('main-tabs').style.display    = 'flex';
      document.getElementById('main-content').style.display = 'block';
      document.getElementById('cur-name').textContent = user.name;
      document.getElementById('cur-avatar').textContent =
        user.name.split(' ').map(function(w){ return w[0]||''; }).join('').slice(0,2).toUpperCase();
      document.getElementById('cur-avatar').style.background =
        ['#4f6ef7','#7c3aed','#ef4444','#22c55e','#f59e0b','#06b6d4','#ec4899'][user.id % 7];
      buildTabs();
      var firstTab = (user.access && user.access[0]) || 'overview';
      setTab(firstTab);
      renderAll();
      // Restore panel state after refresh
      setTimeout(function(){
        try{
          var ps=JSON.parse(localStorage.getItem('pmo_panel_state'));
          if(ps&&ps.type==='project'&&typeof openDetail==='function') openDetail(ps.id);
          else if(ps&&ps.type==='task'&&typeof openTaskDetail==='function') openTaskDetail(ps.id);
        }catch(e){}
      },200);
    } catch(err) {
      console.error('[PMO] showUI error:', err);
      // Force refresh to recover
      alert('Ошибка загрузки интерфейса. Страница перезагрузится.');
      window.location.href = window.location.pathname + '?reset=1';
    }
  }

  // ---- OVERRIDE LOGIN ----
  window.doLogin = async function() {
    var name = document.getElementById('login-user').value.trim();
    var pass = document.getElementById('login-pass').value;
    var err  = document.getElementById('login-err');
    if (!name) { err.textContent = 'Введите ваше имя'; err.style.display = 'block'; return; }

    try {
      var r = await fetch(API + '/api/login', {
        method:  'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name: name, password: pass })
      });
      var data = await r.json();

      if (!data.ok) {
        err.textContent = data.error === 'not_found'  ? 'Пользователь "'+name+'" не найден'
                        : data.error === 'wrong_pass' ? 'Неверный пароль'
                        : (data.error || 'Ошибка входа');
        err.style.display = 'block';
        return;
      }

      try { await loadFromServer(); } catch(e) { loadLocalCache(); }
      currentUser = data.user;
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser)); } catch(e) {}
      err.style.display = 'none';
      showUI(currentUser);

    } catch(e) {
      // Server unreachable — try local cache
      var loaded = loadLocalCache();
      var u = users.find(function(x){ return x.name.toLowerCase() === name.toLowerCase(); });
      if (!u) { err.textContent = 'Пользователь не найден'; err.style.display = 'block'; return; }
      if (u.password !== pass) { err.textContent = 'Неверный пароль'; err.style.display = 'block'; return; }
      currentUser = u;
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser)); } catch(e2) {}
      err.style.display = 'none';
      showUI(currentUser);
    }
  };

  // ---- OVERRIDE LOGOUT ----
  var _origLogout = window.doLogout;
  window.doLogout = function() {
    pendingSync = false;
    clearTimeout(syncTimer);
    try { localStorage.removeItem(SESSION_KEY); } catch(e) {}
    // Note: do NOT clear DATA_KEY — keep data for next login
    if (typeof _origLogout === 'function') _origLogout();
  };

  // ---- OVERRIDE PASSWORD CHANGE ----
  window.changeOwnPassword = async function() {
    var old = document.getElementById('pp-old').value;
    var nw  = document.getElementById('pp-new').value;
    var nw2 = document.getElementById('pp-new2').value;
    var err = document.getElementById('pp-err');
    if (nw.length < 4) { err.textContent = 'Пароль минимум 4 символа'; err.style.display='block'; return; }
    if (nw !== nw2)    { err.textContent = 'Пароли не совпадают';       err.style.display='block'; return; }
    try {
      var r = await fetch(API + '/api/password', {
        method:  'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ userId: currentUser.id, oldPass: old, newPass: nw })
      });
      var data = await r.json();
      if (!data.ok) { err.textContent = 'Неверный текущий пароль'; err.style.display='block'; return; }
    } catch(e) {
      if (currentUser.password !== old) { err.textContent = 'Неверный текущий пароль'; err.style.display='block'; return; }
    }
    currentUser.password = nw;
    var u = users.find(function(x){ return x.id === currentUser.id; });
    if (u) u.password = nw;
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser)); } catch(e) {}
    await syncNow();
    err.style.display = 'none';
    closeModal('profile-modal');
    alert('Пароль успешно изменён!');
  };

  // ---- OVERRIDE ADMIN RESET PASSWORD ----
  window.adminResetPass = async function(id) {
    var np = prompt('Новый пароль для пользователя (минимум 4 символа):');
    if (!np || np.length < 4) { alert('Пароль слишком короткий'); return; }
    try {
      await fetch(API + '/api/admin/reset-password', {
        method:  'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ userId: id, newPass: np })
      });
    } catch(e) {}
    var u = users.find(function(x){ return x.id === id; });
    if (u) u.password = np;
    await syncNow();
    alert('Пароль сброшен!');
  };

  // ---- PATCH: immediate sync for critical operations ----
  function patchImmediate(fnName) {
    var orig = window[fnName];
    if (!orig) { console.warn('[API] Not found to patch:', fnName); return; }
    window[fnName] = async function() {
      orig.apply(this, arguments);
      await syncNow();
      console.log('[API] Immediate sync after', fnName);
    };
  }

  // ---- PATCH: debounced sync for frequent operations ----
  function patchDebounced(fnName) {
    var orig = window[fnName];
    if (!orig) { console.warn('[API] Not found to patch:', fnName); return; }
    window[fnName] = function() {
      orig.apply(this, arguments);
      syncToServer();
    };
  }

  // Critical data → immediate sync (must not lose data on refresh)
  ['saveUser', 'deleteUser', 'saveTask', 'saveProject'].forEach(patchImmediate);

  // Frequent/low-risk operations → debounced
  ['deleteProject', 'deleteTask',
   'toggleTask', 'approveReq', 'rejectReq', 'startReq',
   'doneReq', 'deleteReq', 'savePlan', 'changeStage',
   'saveRequest'].forEach(patchDebounced);

  // ---- RESTORE SESSION ON PAGE LOAD ----
  setTimeout(async function() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch(e) {}
    if (!saved) {
      console.log('[API] No saved session, showing login screen');
      return;
    }
    console.log('[API] Restoring session for:', saved.name);

    // Load local cache first (instant)
    try { loadLocalCache(); } catch(e) {}

    // Try fresh data from server
    try {
      await loadFromServer();
    } catch(e) {
      console.warn('[API] Server unavailable, using local/default data');
    }

    // Find user in loaded data
    var freshUser = users.find(function(u){ return u.id === saved.id; });
    if (!freshUser) {
      // User not found — might be new data structure, find by name
      freshUser = users.find(function(u){ return u.name === saved.name; });
    }
    currentUser = freshUser || saved;

    // Ensure user has access array
    if (!currentUser.access || !currentUser.access.length) {
      var ROLE_DEFAULTS = {
        ceo: ['overview','projects','kanban','gantt','calendar','plans','tasks','collab','admin'],
        manager: ['overview','projects','kanban','gantt','calendar','plans','tasks','collab'],
        member: ['tasks','calendar','collab']
      };
      currentUser.access = ROLE_DEFAULTS[currentUser.role] || ['overview','tasks'];
    }

    showUI(currentUser);
    console.log('[API] Session restored for:', currentUser.name, '| tabs:', currentUser.access.length);
  }, 0);

  console.log('[PMO API] Loaded. localStorage cache + server sync enabled.');
})();
