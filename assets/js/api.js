/* ==========================================================
   Felani4F — data layer v2
   two modes:
     · shared  → Supabase (URL + anon key in config.js)
     · local   → this browser only (localStorage)
   admin content can additionally be published to the repo
   ========================================================== */
const F4F = (() => {
  'use strict';

  const DB = (typeof window !== 'undefined' && window.F4F_DB) || null;      // { url, anonKey }
  const MODE = DB && DB.url && DB.anonKey ? 'shared' : 'local';

  const ADMIN = { username: 'Xray_Venom', salt: 'a3f9c1e07b2d4f68', hash: '6d3ec5bc8eedffbe0c32ab1b1e3a454bde6492e17130dcda4cb282994f590708' };
  const EMPTY_CORE = () => ({ rev: 1, users: {}, downloads: {}, likes: {}, overrides: {}, extraTracks: [], banned: {}, settings: {} });

  const CFG = {
    repo: 'Drserver2350/felani4f',
    branch: 'main',
    sessionDays: 30,
    pollMs: 20000,
  };

  const state = { core: EMPTY_CORE(), comments: [], online: MODE === 'shared', loaded: false, session: null };

  const LS = {
    get(k, d) { try { const v = localStorage.getItem('f4f.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('f4f.' + k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem('f4f.' + k); } catch (e) {} },
  };

  const emit = (name, detail) => document.dispatchEvent(new CustomEvent('f4f:' + name, { detail }));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------------- crypto ---------------- */
  const enc = new TextEncoder();
  const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  async function hashPassword(password, salt) {
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 120000, hash: 'SHA-256' }, key, 256);
    return hex(bits);
  }
  const randHex = (n = 8) => hex(crypto.getRandomValues(new Uint8Array(n)));

  /* ==========================================================
     adapters
     ========================================================== */
  const Local = {
    key: 'f4f.db',
    read() {
      const d = LS.get('db', null);
      return d && typeof d === 'object' ? d : { core: EMPTY_CORE(), comments: [] };
    },
    write(d) { LS.set('db', d); },
    async load() { const d = this.read(); state.core = Object.assign(EMPTY_CORE(), d.core || {}); state.comments = d.comments || []; },
    async saveCore(core) { const d = this.read(); d.core = core; this.write(d); state.core = core; },
    async saveComments(items) { const d = this.read(); d.comments = items; this.write(d); state.comments = items; },
  };

  const Supa = {
    headers() {
      return {
        apikey: DB.anonKey,
        Authorization: 'Bearer ' + DB.anonKey,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      };
    },
    async req(path, opts = {}) {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 12000);
      try {
        const r = await fetch(`${DB.url.replace(/\/$/, '')}/rest/v1/${path}`, { ...opts, headers: this.headers(), signal: ctl.signal, cache: 'no-store' });
        if (!r.ok) throw new Error('DB ' + r.status);
        const txt = await r.text();
        return txt ? JSON.parse(txt) : null;
      } finally { clearTimeout(t); }
    },
    async load() {
      const rows = await this.req('f4f_state?id=eq.1&select=*');
      const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
      state.core = Object.assign(EMPTY_CORE(), (row && row.core) || {});
      state.comments = Array.isArray(row && row.comments) ? row.comments : [];
      state.online = true;
    },
    async saveCore(core) {
      const rows = await this.req('f4f_state?id=eq.1', {
        method: 'PATCH',
        body: JSON.stringify({ core, updated_at: new Date().toISOString() }),
      });
      if (!rows || !rows.length) {
        await this.req('f4f_state', { method: 'POST', body: JSON.stringify([{ id: 1, core, comments: state.comments }]) });
      }
      state.core = core;
    },
    async saveComments(items) {
      await this.req('f4f_state?id=eq.1', { method: 'PATCH', body: JSON.stringify({ comments: items, updated_at: new Date().toISOString() }) });
      state.comments = items;
    },
  };

  const Backend = MODE === 'shared' ? Supa : Local;

  /* generic read‑modify‑write with retry */
  async function mutate(kind, fn, tries = 3) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        if (MODE === 'shared') await Backend.load();           // freshest copy
        else await Backend.load();
        const current = kind === 'core' ? Object.assign(EMPTY_CORE(), state.core) : state.comments.slice();
        const draft = JSON.parse(JSON.stringify(current));
        const out = fn(draft);
        if (out === false) return current;
        if (kind === 'core') {
          draft.rev = (draft.rev || 0) + 1;
          draft.updatedAt = Date.now();
          await Backend.saveCore(draft);
        } else {
          await Backend.saveComments(draft);
        }
        emit('change', { kind });
        return draft;
      } catch (e) {
        lastErr = e;
        state.online = MODE === 'shared' ? false : true;
        await sleep(300 + i * 400);
      }
    }
    throw lastErr || new Error('ذخیره انجام نشد');
  }

  /* ---------------- boot ---------------- */
  async function load() {
    try {
      await Backend.load();
      state.online = true;
    } catch (e) {
      state.online = false;
      if (!state.loaded) { state.core = EMPTY_CORE(); state.comments = []; }
    }
    // repo‑published content (works even without a database)
    if (window.F4F_OVERRIDES && typeof window.F4F_OVERRIDES === 'object') {
      const ov = window.F4F_OVERRIDES;
      if (ov.overrides) state.core.overrides = Object.assign({}, ov.overrides, state.core.overrides || {});
      if (ov.extraTracks) state.core.extraTracks = state.core.extraTracks && state.core.extraTracks.length ? state.core.extraTracks : ov.extraTracks;
      if (ov.settings) state.core.settings = Object.assign({}, ov.settings, state.core.settings || {});
    }
    state.loaded = true;
    await ensureAdmin();
    restoreSession();
    startPolling();
    bindTabs();
    emit('ready', { online: state.online, mode: MODE });
    return state;
  }

  async function ensureAdmin() {
    if (state.core.users && state.core.users[ADMIN.username]) return;
    try {
      await mutate('core', (c) => {
        if (c.users[ADMIN.username]) return false;
        c.users[ADMIN.username] = { salt: ADMIN.salt, hash: ADMIN.hash, role: 'admin', createdAt: Date.now() };
        return true;
      });
    } catch (e) {}
  }

  let pollTimer = null;
  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      if (document.hidden || !state.loaded) return;
      try {
        const before = JSON.stringify([state.core, state.comments]);
        await Backend.load();
        const after = JSON.stringify([state.core, state.comments]);
        state.online = MODE === 'shared';
        if (before !== after) emit('change', { kind: 'refresh' });
      } catch (e) { if (MODE === 'shared') state.online = false; }
    }, CFG.pollMs);
    addEventListener('focus', () => { if (state.loaded) refresh(); });
  }
  async function refresh() {
    try { await Backend.load(); state.online = MODE === 'shared'; emit('change', { kind: 'refresh' }); } catch (e) {}
  }
  function bindTabs() {
    addEventListener('storage', (e) => {
      if (e.key === 'f4f.db' && MODE === 'local') { Backend.load().then(() => emit('change', { kind: 'refresh' })); }
    });
  }

  /* ---------------- tracks ---------------- */
  function tracks() {
    const base = (typeof TRACKS !== 'undefined' ? TRACKS : []).map((t) => {
      const ov = state.core.overrides[t.id];
      return ov ? Object.assign({}, t, ov, { id: t.id }) : t;
    }).filter((t) => !t.deleted);
    const extra = (state.core.extraTracks || []).map((t) => Object.assign({}, t, { custom: true })).filter((t) => !t.deleted);
    const seen = new Set(base.map((t) => t.id));
    return base.concat(extra.filter((t) => !seen.has(t.id)));
  }
  const trackById = (id) => tracks().find((t) => t.id === id);

  /* ---------------- auth ---------------- */
  function restoreSession() {
    const s = LS.get('session', null);
    if (!s || !s.username || s.exp < Date.now()) { state.session = null; LS.del('session'); return; }
    const u = state.core.users[s.username];
    if (!u) { state.session = null; LS.del('session'); return; }
    state.session = { username: s.username, role: u.role || 'user', exp: s.exp };
    emit('auth', state.session);
  }
  const normalizeUsername = (u) => String(u || '').trim().replace(/\s+/g, '_').slice(0, 24);

  async function signup(username, password) {
    const uname = normalizeUsername(username);
    if (!/^[A-Za-z0-9_\u0600-\u06FF]{3,24}$/.test(uname)) throw new Error('نام کاربری باید ۳ تا ۲۴ کاراکتر و بدون فاصله باشد');
    if (String(password).length < 6) throw new Error('رمز عبور حداقل ۶ کاراکتر باشد');
    if (state.core.banned[uname]) throw new Error('این حساب مسدود شده است');
    if (state.core.users[uname]) throw new Error('این نام کاربری قبلاً گرفته شده');
    const salt = randHex(8);
    const hash = await hashPassword(password, salt);
    await mutate('core', (c) => {
      if (c.users[uname]) throw new Error('این نام کاربری قبلاً گرفته شده');
      c.users[uname] = { salt, hash, role: 'user', createdAt: Date.now() };
      return true;
    });
    const session = { username: uname, role: 'user', exp: Date.now() + CFG.sessionDays * 864e5 };
    state.session = session; LS.set('session', session); emit('auth', session);
    return session;
  }

  async function login(username, password) {
    const uname = normalizeUsername(username);
    const tries = LS.get('tries', {});
    const now = Date.now();
    const rec = tries[uname] || { n: 0, t: 0 };
    if (now - rec.t < 5 * 60 * 1000 && rec.n >= 6) throw new Error('تلاش‌های زیاد — چند دقیقه دیگر امتحان کن');
    try { await Backend.load(); } catch (e) {}
    const u = state.core.users[uname];
    if (!u) { tries[uname] = { n: rec.n + 1, t: now }; LS.set('tries', tries); throw new Error('نام کاربری یا رمز نادرست است'); }
    const hash = await hashPassword(password, u.salt);
    if (hash !== u.hash) { tries[uname] = { n: rec.n + 1, t: now }; LS.set('tries', tries); throw new Error('نام کاربری یا رمز نادرست است'); }
    tries[uname] = { n: 0, t: now }; LS.set('tries', tries);
    const session = { username: uname, role: u.role || 'user', exp: Date.now() + CFG.sessionDays * 864e5 };
    state.session = session; LS.set('session', session); emit('auth', session);
    return session;
  }
  function logout() { state.session = null; LS.del('session'); emit('auth', null); }
  const isAdmin = () => !!(state.session && state.session.role === 'admin');

  /* ---------------- comments ---------------- */
  async function addComment(trackId, rating, text) {
    if (!state.session) throw new Error('برای ثبت نظر وارد حساب شو');
    if (state.core.banned[state.session.username]) throw new Error('این حساب مسدود شده است');
    const clean = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 420);
    if (clean.length < 3) throw new Error('متن نظر کوتاه‌تر از حد مجاز است');
    const item = { id: 'c' + Date.now() + Math.random().toString(16).slice(2, 6), trackId, user: state.session.username, rating: Math.min(5, Math.max(1, Number(rating) || 5)), text: clean, at: Date.now() };
    try { await Backend.load(); } catch (e) {}
    await mutate('comments', (list) => {
      if (list.some((c) => c.user === item.user && Date.now() - c.at < 12000)) throw new Error('کمی صبر کن و دوباره بفرست');
      list.push(item);
      return true;
    });
    emit('comments', {});
    return item;
  }
  async function deleteComment(id) {
    if (!isAdmin()) throw new Error('دسترسی ندارید');
    await mutate('comments', (list) => { const i = list.findIndex((c) => c.id === id); if (i > -1) list.splice(i, 1); return true; });
    emit('comments', {});
  }
  const commentsFor = (trackId) => state.comments.filter((c) => c.trackId === trackId).sort((a, b) => b.at - a.at);
  const commentCount = (trackId) => state.comments.filter((c) => c.trackId === trackId).length;
  const avgRating = () => (state.comments.length ? state.comments.reduce((a, c) => a + c.rating, 0) / state.comments.length : 0);

  /* ---------------- counters & likes ---------------- */
  async function incDownload(trackId) {
    try {
      await mutate('core', (d) => { d.downloads[trackId] = Number(d.downloads[trackId] || 0) + 1; return true; }, 2);
    } catch (e) {
      state.core.downloads[trackId] = (state.core.downloads[trackId] || 0) + 1;
    }
    emit('change', { kind: 'downloads' });
  }
  const downloadsOf = (id) => Number(state.core.downloads[id] || 0);
  const totalDownloads = () => Object.values(state.core.downloads || {}).reduce((a, b) => a + Number(b || 0), 0);

  async function toggleLike(trackId) {
    if (!state.session) throw new Error('برای پسندیدن وارد حساب شو');
    const me = state.session.username;
    let liked = false;
    await mutate('core', (d) => {
      d.likes = d.likes || {};
      const arr = Array.isArray(d.likes[trackId]) ? d.likes[trackId] : [];
      const i = arr.indexOf(me);
      if (i > -1) { arr.splice(i, 1); liked = false; } else { arr.push(me); liked = true; }
      d.likes[trackId] = arr;
      return true;
    });
    emit('change', { kind: 'likes' });
    return liked;
  }
  const likeCount = (id) => (Array.isArray(state.core.likes[id]) ? state.core.likes[id].length : 0);
  const iLiked = (id) => !!(state.session && Array.isArray(state.core.likes[id]) && state.core.likes[id].includes(state.session.username));

  /* ---------------- admin content ops ---------------- */
  function assertAdmin() { if (!isAdmin()) throw new Error('فقط مدیر سایت دسترسی دارد'); }

  async function saveTrack(track) {
    assertAdmin();
    if (!track || !track.id) throw new Error('شناسه‌ی ترک لازم است');
    const base = (typeof TRACKS !== 'undefined' ? TRACKS : []).find((t) => t.id === track.id);
    if (base) {
      const fields = ['fa', 'en', 'genre', 'bpm', 'key', 'year', 'c', 'desc', 'dur', 'src', 'img', 'tags', 'num', 'peaks'];
      await mutate('core', (d) => {
        const ov = Object.assign({}, d.overrides[track.id] || {});
        fields.forEach((f) => { if (track[f] !== undefined) ov[f] = track[f]; });
        ov.deleted = false;
        d.overrides[track.id] = ov;
        return true;
      });
    } else {
      await mutate('core', (d) => {
        const list = Array.isArray(d.extraTracks) ? d.extraTracks : [];
        const t = Object.assign({}, track, { custom: true, deleted: false });
        const i = list.findIndex((x) => x.id === t.id);
        if (i > -1) list[i] = Object.assign({}, list[i], t); else list.push(t);
        d.extraTracks = list;
        return true;
      });
    }
    emit('change', { kind: 'tracks' });
  }

  async function deleteTrack(id) {
    assertAdmin();
    await mutate('core', (d) => {
      if ((d.extraTracks || []).some((t) => t.id === id)) d.extraTracks = d.extraTracks.filter((t) => t.id !== id);
      else d.overrides[id] = Object.assign({}, d.overrides[id] || {}, { deleted: true });
      return true;
    });
    emit('change', { kind: 'tracks' });
  }

  async function restoreTrack(id) {
    assertAdmin();
    await mutate('core', (d) => {
      if (d.overrides[id]) d.overrides[id].deleted = false;
      d.extraTracks = (d.extraTracks || []).map((t) => (t.id === id ? Object.assign({}, t, { deleted: false }) : t));
      return true;
    });
    emit('change', { kind: 'tracks' });
  }

  async function setUserRole(username, role) {
    assertAdmin();
    await mutate('core', (d) => { if (!d.users[username]) throw new Error('کاربر پیدا نشد'); d.users[username].role = role; return true; });
  }
  async function banUser(username, banned = true) {
    assertAdmin();
    if (username === ADMIN.username) throw new Error('حساب مدیر را نمی‌توان مسدود کرد');
    await mutate('core', (d) => { d.banned[username] = !!banned; return true; });
  }
  async function saveSettings(settings) {
    assertAdmin();
    await mutate('core', (d) => { d.settings = Object.assign({}, d.settings, settings); return true; });
  }
  const usersList = () => Object.entries(state.core.users || {}).map(([u, v]) => ({ username: u, ...v }));
  const settings = () => state.core.settings || {};

  /* ---------------- GitHub publisher (admin only) ---------------- */
  function ghToken() { return LS.get('ghToken', ''); }
  function setGhToken(t) { LS.set('ghToken', String(t || '').trim()); }

  async function gh(method, path, body) {
    const token = ghToken();
    if (!token) throw new Error('توکن انتشار تنظیم نشده');
    const r = await fetch(`https://api.github.com/repos/${CFG.repo}/${path}`, {
      method,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error('GitHub: ' + (j.message || r.status)); }
    return r.json().catch(() => ({}));
  }
  async function ghPutFile(filePath, base64Content, message) {
    let sha;
    try { const cur = await gh('GET', `contents/${filePath}?ref=${CFG.branch}`); sha = cur && cur.sha; } catch (e) {}
    const body = { message: message || 'felani4f: update ' + filePath, content: base64Content, branch: CFG.branch };
    if (sha) body.sha = sha;
    return gh('PUT', `contents/${filePath}`, body);
  }
  const toB64 = (buf) => {
    const bytes = new Uint8Array(buf); let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  };

  async function publishTrack({ track, audioFile, coverFile }) {
    assertAdmin();
    if (!ghToken()) throw new Error('اول توکن انتشار را در تب «انتشار» ذخیره کن');
    const id = track.id;
    const writes = [];
    if (audioFile) {
      const buf = await audioFile.arrayBuffer();
      writes.push(ghPutFile(`assets/audio/${id}.mp3`, toB64(buf), `felani4f: audio ${id}`));
    }
    if (coverFile) {
      const bmp = await createImageBitmap(coverFile);
      const S = 880, s = Math.min(bmp.width, bmp.height);
      const big = document.createElement('canvas'); big.width = S; big.height = S;
      big.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, S, S);
      const sm = document.createElement('canvas'); sm.width = 160; sm.height = 160;
      sm.getContext('2d').drawImage(big, 0, 0, 160, 160);
      writes.push(ghPutFile(`assets/img/${id}.jpg`, big.toDataURL('image/jpeg', 0.86).split(',')[1], `felani4f: cover ${id}`));
      writes.push(ghPutFile(`assets/img/${id}-sm.jpg`, sm.toDataURL('image/jpeg', 0.82).split(',')[1], `felani4f: cover ${id} sm`));
    }
    await Promise.all(writes);
    await saveTrack(Object.assign({}, track, { src: `assets/audio/${id}.mp3`, img: `assets/img/${id}.jpg` }));
    return true;
  }

  /** publish admin content + optional DB config as static files (visible to every visitor) */
  async function publishContent(extra = {}) {
    assertAdmin();
    if (!ghToken()) throw new Error('اول توکن انتشار را ذخیره کن');
    const ov = {
      updatedAt: Date.now(),
      overrides: state.core.overrides || {},
      extraTracks: state.core.extraTracks || [],
      settings: state.core.settings || {},
    };
    await ghPutFile('assets/js/overrides.js',
      toB64(new TextEncoder().encode('/* Felani4F — admin published content (auto-generated) */\nwindow.F4F_OVERRIDES = ' + JSON.stringify(ov, null, 1) + ';\n')),
      'felani4f: publish admin content');
    if (extra.db) {
      const cfg = '/* Felani4F — database config (anon key is public by design) */\nwindow.F4F_DB = ' + JSON.stringify(extra.db, null, 1) + ';\n';
      await ghPutFile('assets/js/config.js', toB64(new TextEncoder().encode(cfg)), 'felani4f: connect database');
    }
    return true;
  }

  return {
    CFG, MODE, state, load, refresh, tracks, trackById,
    signup, login, logout, isAdmin, session: () => state.session,
    addComment, deleteComment, commentsFor, commentCount, avgRating,
    incDownload, downloadsOf, totalDownloads, toggleLike, likeCount, iLiked,
    saveTrack, deleteTrack, restoreTrack, setUserRole, banUser, saveSettings, usersList, settings,
    ghToken, setGhToken, publishTrack, publishContent,
    ls: LS,
  };
})();
