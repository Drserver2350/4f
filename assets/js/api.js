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
  const ghConf = () => ({
    repo: (LS.get('ghRepo', '') || CFG.repo).replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/+$/, ''),
    branch: LS.get('ghBranch', '') || CFG.branch,
  });

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
        await Backend.load();                                  // freshest copy
        if (kind === 'core') applyPublished(state.core);       // repo content is never dropped
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

  /* ---------------- repo-published content ----------------
     assets/js/overrides.js is committed by the admin panel through the
     GitHub API. It is fetched with a cache-buster so every visitor – and
     the admin too – sees the published catalogue right away. Published
     content always wins over a stale browser copy. */
  async function loadPublished() {
    try {
      const r = await fetch('assets/js/overrides.js?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return null;
      const txt = await r.text();
      const i = txt.indexOf('F4F_OVERRIDES');
      if (i < 0) return null;
      let json = txt.slice(txt.indexOf('=', i) + 1).trim();
      json = json.replace(/;\s*$/, '').trim();
      const data = JSON.parse(json);
      return data && typeof data === 'object' ? data : null;
    } catch (e) {
      return (window.F4F_OVERRIDES && typeof window.F4F_OVERRIDES === 'object') ? window.F4F_OVERRIDES : null;
    }
  }

  async function fetchPublished() {
    const ov = await loadPublished();
    if (ov) {
      // ignore an older publish than the one already shown (avoids flicker)
      if (!state.publishedAt || Number(ov.updatedAt || 0) >= state.publishedAt) {
        state.published = ov;
        state.publishedAt = Number(ov.updatedAt || 0);
      }
    }
    return state.published || null;
  }
  function applyPublished(core) {
    const ov = state.published;
    if (!ov || !core) return core;
    if (ov.overrides) core.overrides = Object.assign({}, core.overrides || {}, ov.overrides);
    if (Array.isArray(ov.extraTracks)) {
      const pub = ov.extraTracks;
      const ids = new Set(pub.map((t) => t.id));
      // keep tracks that only exist in this browser (e.g. added before publishing existed)
      const drafts = (core.extraTracks || []).filter((t) => !ids.has(t.id) && !t.deleted);
      core.extraTracks = pub.concat(drafts);
    }
    if (ov.settings) core.settings = Object.assign({}, core.settings || {}, ov.settings);
    return core;
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
    // repo-published content (works even without a database)
    await fetchPublished();
    applyPublished(state.core);
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
        await fetchPublished();
        applyPublished(state.core);
        const after = JSON.stringify([state.core, state.comments]);
        state.online = MODE === 'shared';
        if (before !== after) emit('change', { kind: 'refresh' });
      } catch (e) { if (MODE === 'shared') state.online = false; }
    }, CFG.pollMs);
    addEventListener('focus', () => { if (state.loaded) refresh(); });
  }
  async function refresh() {
    try {
      await Backend.load();
      state.online = MODE === 'shared';
      await fetchPublished();
      applyPublished(state.core);
      emit('change', { kind: 'refresh' });
    } catch (e) {}
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
  function assertPublisher() {
    if (!ghToken()) throw new Error('برای ثبت تغییر روی سایت باید توکن انتشار را در تب «انتشار» ذخیره کنی — بدون آن تغییر فقط در همین مرورگر می‌ماند');
  }

  async function applyTrack(track) {
    if (!track || !track.id) throw new Error('شناسه‌ی ترک لازم است');
    const base = (typeof TRACKS !== 'undefined' ? TRACKS : []).find((t) => t.id === track.id);
    if (base) {
      const fields = ['fa', 'en', 'genre', 'bpm', 'key', 'year', 'c', 'desc', 'dur', 'src', 'img', 'imgSmall', 'tags', 'num', 'peaks'];
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

  async function saveTrack(track) {
    assertAdmin(); assertPublisher();
    await applyTrack(track);
    await queuePublish();
    return true;
  }

  async function deleteTrack(id) {
    assertAdmin(); assertPublisher();
    await mutate('core', (d) => {
      if ((d.extraTracks || []).some((t) => t.id === id)) d.extraTracks = d.extraTracks.filter((t) => t.id !== id);
      else d.overrides[id] = Object.assign({}, d.overrides[id] || {}, { deleted: true });
      return true;
    });
    emit('change', { kind: 'tracks' });
    await queuePublish();
  }

  async function restoreTrack(id) {
    assertAdmin(); assertPublisher();
    await mutate('core', (d) => {
      if (d.overrides[id]) d.overrides[id].deleted = false;
      d.extraTracks = (d.extraTracks || []).map((t) => (t.id === id ? Object.assign({}, t, { deleted: false }) : t));
      return true;
    });
    emit('change', { kind: 'tracks' });
    await queuePublish();
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
    assertAdmin(); assertPublisher();
    await mutate('core', (d) => { d.settings = Object.assign({}, d.settings, settings); return true; });
    await queuePublish();
  }
  const usersList = () => Object.entries(state.core.users || {}).map(([u, v]) => ({ username: u, ...v }));
  const publishedTrackIds = () => new Set(((state.published && state.published.extraTracks) || []).map((t) => t.id));
  const settings = () => state.core.settings || {};

  /* ==========================================================
     GitHub publisher — every content change is committed to the
     repository, so it is not "admin only" anymore: Pages serves
     the same files to every visitor.
     ========================================================== */
  function ghToken() { return LS.get('ghToken', ''); }
  function setGhToken(t) { LS.set('ghToken', String(t || '').trim()); }

  async function gh(method, path, body) {
    const token = ghToken();
    if (!token) throw new Error('توکن انتشار تنظیم نشده');
    const { repo } = ghConf();
    const r = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
      method,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error('GitHub: ' + (j.message || r.status));
      err.status = r.status;
      throw err;
    }
    return j;
  }
  async function ghSha(filePath) {
    const { branch } = ghConf();
    try {
      const cur = await gh('GET', `contents/${filePath}?ref=${encodeURIComponent(branch)}`);
      return cur && cur.sha;
    } catch (e) { return null; }
  }
  async function ghPutFile(filePath, base64Content, message) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const sha = await ghSha(filePath);
      const body = { message: message || 'felani4f: update ' + filePath, content: base64Content, branch: ghConf().branch };
      if (sha) body.sha = sha;
      try {
        return await gh('PUT', `contents/${filePath}`, body);
      } catch (e) {
        if (e.status === 409 || e.status === 422) { await sleep(350 + attempt * 500); continue; }
        throw e;
      }
    }
    throw new Error('نوشتن فایل روی مخزن انجام نشد');
  }
  const toB64 = (buf) => {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  };

  /* one publish at a time — rapid edits are queued, never raced */
  let publishChain = Promise.resolve();
  function queuePublish(fn) {
    const run = () => (fn ? fn() : publishContent({ silent: true }));
    const p = publishChain.then(run, run);
    publishChain = p.catch(() => {});
    return p;
  }

  function publishedPayload() {
    return {
      updatedAt: Date.now(),
      generator: 'felani4f-admin',
      overrides: state.core.overrides || {},
      extraTracks: state.core.extraTracks || [],
      settings: state.core.settings || {},
    };
  }

  /** commit the whole published catalogue (overrides.js) + optional DB config */
  async function publishContent(extra = {}) {
    assertAdmin();
    if (!ghToken()) throw new Error('اول توکن انتشار را در تب «انتشار» ذخیره کن');
    const ov = publishedPayload();
    const { repo, branch } = ghConf();
    const put = await ghPutFile('assets/js/overrides.js',
      toB64(new TextEncoder().encode('/* Felani4F — published catalogue (written by the admin panel) */\nwindow.F4F_OVERRIDES = ' + JSON.stringify(ov) + ';\n')),
      'felani4f: publish catalogue');

    if (extra.db) {
      const cfg = '/* Felani4F — database config (anon key is public by design) */\nwindow.F4F_DB = ' + JSON.stringify(extra.db, null, 1) + ';\n';
      await ghPutFile('assets/js/config.js', toB64(new TextEncoder().encode(cfg)), 'felani4f: connect database');
    }

    // the freshly published state becomes the local source of truth
    state.published = ov;
    state.publishedAt = ov.updatedAt;

    const commit = put && put.commit && put.commit.sha ? put.commit.sha : null;
    return { ok: true, repo, branch, commit, at: ov.updatedAt, tracks: ov.extraTracks.length };
  }

  /** wait until GitHub Pages has built the given commit */
  async function waitForPages(commit, { timeout = 120000, onTick } = {}) {
    const { repo } = ghConf();
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        const b = await gh('GET', `pages/builds/latest`);
        const st = b && b.status;
        if (onTick) onTick(st, b);
        if (st === 'built' && (!commit || !b.commit || String(b.commit).indexOf(commit) === 0 || commit.indexOf(String(b.commit)) === 0)) {
          return { ok: true, status: st };
        }
        if (st === 'errored') return { ok: false, status: st };
      } catch (e) {
        if (e.status === 404) return { ok: false, status: 'no-pages' };
      }
      await sleep(5000);
    }
    return { ok: false, status: 'timeout' };
  }

  /* ---------------- ID3 (embedded cover art) ---------------- */
  function synchSafe(d, o) { return ((d[o] & 0x7f) << 21) | ((d[o + 1] & 0x7f) << 14) | ((d[o + 2] & 0x7f) << 7) | (d[o + 3] & 0x7f); }
  function decodeText(d, start, end, encByte) {
    let bytes = d.subarray(start, end);
    let enc = 'utf-8';
    if (encByte === 0) enc = 'iso-8859-1';
    else if (encByte === 1) { enc = 'utf-16le'; if (bytes[0] === 0xFE && bytes[1] === 0xFF) { enc = 'utf-16be'; bytes = bytes.subarray(2); } else if (bytes[0] === 0xFF && bytes[1] === 0xFE) bytes = bytes.subarray(2); }
    else if (encByte === 2) enc = 'utf-16be';
    try {
      let s = new TextDecoder(enc, { fatal: false }).decode(bytes);
      const z = s.indexOf('\u0000'); if (z > -1) s = s.slice(0, z);
      return s.replace(/\u0000/g, '').trim();
    } catch (e) { return ''; }
  }
  /** read ID3v2 tags + APIC picture from an MP3 (returns null if untagged) */
  async function readId3(file) {
    if (!file || file.size < 128) return null;
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (String.fromCharCode(head[0], head[1], head[2]) !== 'ID3') return null;
    const ver = head[3];
    const flags = head[5];
    const size = synchSafe(head, 6);
    const raw = new Uint8Array(await file.slice(10, 10 + size).arrayBuffer());
    let d = raw;
    if (flags & 0x80) {                       // unsynchronisation
      const out = new Uint8Array(d.length); let n = 0;
      for (let i = 0; i < d.length; i++) { out[n++] = d[i]; if (d[i] === 0xFF && d[i + 1] === 0x00) i++; }
      d = out.subarray(0, n);
    }
    let p = 0;
    if (flags & 0x40) {                       // extended header
      p = ver === 3 ? 4 + ((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) : synchSafe(d, 0);
    }
    const tags = {};
    const idLen = ver === 2 ? 3 : 4;
    while (p + idLen + (ver === 2 ? 3 : 6) <= d.length) {
      const id = String.fromCharCode.apply(null, d.subarray(p, p + idLen));
      if (!new RegExp('^[A-Z0-9]{' + idLen + '}$').test(id)) break;
      const fsz = ver === 2
        ? (d[p + 3] << 16) | (d[p + 4] << 8) | d[p + 5]
        : (ver === 4 ? synchSafe(d, p + 4) : ((d[p + 4] << 24) | (d[p + 5] << 16) | (d[p + 6] << 8) | d[p + 7]));
      const start = p + idLen + (ver === 2 ? 3 : 6);
      const end = start + fsz;
      if (!fsz || end > d.length) break;

      if (id === 'TIT2' || id === 'TT2') tags.title = decodeText(d, start + 1, end, d[start]);
      else if (id === 'TPE1' || id === 'TP1') tags.artist = decodeText(d, start + 1, end, d[start]);
      else if (id === 'TALB' || id === 'TAL') tags.album = decodeText(d, start + 1, end, d[start]);
      else if (id === 'TYER' || id === 'TYE') tags.year = decodeText(d, start + 1, end, d[start]);
      else if ((id === 'APIC' || id === 'PIC') && !tags.picture) {
        let q = start;
        const encByte = d[q++];
        let mime = '';
        if (id === 'PIC') {
          mime = 'image/' + String.fromCharCode(d[q], d[q + 1], d[q + 2]).toLowerCase().replace('jpg', 'jpeg');
          q += 3;
        } else {
          while (q < end && d[q] !== 0) mime += String.fromCharCode(d[q++]);
          q++;
        }
        q++;                                   // picture type
        if (encByte === 1 || encByte === 2) {  // UTF-16 description
          while (q + 1 < end && !(d[q] === 0 && d[q + 1] === 0)) q += 2;
          q += 2;
        } else {
          while (q < end && d[q] !== 0) q++;
          q++;
        }
        if (end - q > 64) {
          const bytes = d.slice(q, end);
          let type = mime || 'image/jpeg';
          if (!/^image\//.test(type)) type = 'image/jpeg';
          tags.picture = new Blob([bytes], { type });
          tags.pictureType = type;
        }
      }
      p = end;
    }
    return (tags.title || tags.picture) ? tags : null;
  }

  /* ---------------- waveform / duration from the uploaded file ---------------- */
  async function analyzeAudio(file, buckets = 220) {
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    try {
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      const data = buf.getChannelData(0);
      const step = Math.floor(data.length / buckets) || 1;
      const peaks = [];
      let max = 0.0001;
      for (let i = 0; i < buckets; i++) {
        let sum = 0;
        const s = i * step;
        const e = Math.min(data.length, s + step);
        for (let j = s; j < e; j += 8) sum += data[j] * data[j];
        const rms = Math.sqrt(sum / Math.max(1, (e - s) / 8));
        peaks.push(rms);
        if (rms > max) max = rms;
      }
      return { duration: buf.duration, peaks: peaks.map((v) => Math.round(Math.min(1, Math.pow(v / max, 0.72)) * 100) / 100) };
    } catch (e) { return null; }
    finally { try { ctx.close(); } catch (e) {} }
  }

  /* ---------------- cover rendering (JPEG, square) ---------------- */
  async function blobToBitmap(blob) {
    if (window.createImageBitmap) return createImageBitmap(blob);
    return await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = URL.createObjectURL(blob);
    });
  }
  function canvasB64(canvas, quality = 0.86) { return canvas.toDataURL('image/jpeg', quality).split(',')[1]; }
  async function renderCover(srcBlob, size = 880) {
    const bmp = await blobToBitmap(srcBlob);
    const w = bmp.width || bmp.naturalWidth;
    const h = bmp.height || bmp.naturalHeight;
    const s = Math.min(w, h);
    const big = document.createElement('canvas'); big.width = size; big.height = size;
    big.getContext('2d').drawImage(bmp, (w - s) / 2, (h - s) / 2, s, s, 0, 0, size, size);
    const sm = document.createElement('canvas'); sm.width = 160; sm.height = 160;
    sm.getContext('2d').drawImage(big, 0, 0, 160, 160);
    return { big: canvasB64(big, 0.86), small: canvasB64(sm, 0.82) };
  }
  async function placeholderCover(track, size = 880) {
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const g = c.getContext('2d');
    const col = track.c || '#ff2b3a';
    const bg = g.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, '#150b0c'); bg.addColorStop(0.55, '#0b0708'); bg.addColorStop(1, col + '44');
    g.fillStyle = bg; g.fillRect(0, 0, size, size);
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.arc(size * (0.2 + 0.16 * i), size * (0.85 - 0.12 * i), size * (0.32 - 0.03 * i), 0, Math.PI * 2);
      g.strokeStyle = 'rgba(255,255,255,' + (0.05 - i * 0.008) + ')';
      g.lineWidth = size * 0.004;
      g.stroke();
    }
    g.fillStyle = col;
    g.font = '700 ' + Math.round(size * 0.3) + 'px Unbounded, system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const initials = String(track.en || track.fa || '4F').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    g.fillText(initials, size / 2, size * 0.46);
    g.fillStyle = 'rgba(244,239,238,.55)';
    g.font = '500 ' + Math.round(size * 0.035) + 'px Unbounded, system-ui, sans-serif';
    g.fillText('FELANI4F', size / 2, size * 0.66);
    const sm = document.createElement('canvas'); sm.width = 160; sm.height = 160;
    sm.getContext('2d').drawImage(c, 0, 0, 160, 160);
    return { big: canvasB64(c, 0.88), small: canvasB64(sm, 0.82) };
  }

  /** full upload: audio + cover (file, embedded ID3 art, or placeholder) + catalogue publish */
  async function publishTrack({ track, audioFile, coverFile, keepCover = false, onProgress = () => {} }) {
    assertAdmin(); assertPublisher();
    const id = track.id;
    const out = { id, audio: false, cover: false, autoCover: false, duration: 0, peaks: null };

    let meta = null;
    if (audioFile) {
      onProgress('خواندن فایل و کاور داخلی…', 6);
      meta = await readId3(audioFile).catch(() => null);
      if (meta) {
        if (!coverFile && !keepCover && meta.picture) { coverFile = meta.picture; out.autoCover = true; }
        if (!track.fa && meta.title) track.fa = meta.title;
        if (meta.year && /^\d{4}$/.test(meta.year)) track.year = meta.year;
        out.id3 = { title: meta.title || '', artist: meta.artist || '', album: meta.album || '', hasArt: !!meta.picture };
      }
      onProgress('ساخت نمودار موج و مدت زمان…', 14);
      const a = await analyzeAudio(audioFile).catch(() => null);
      if (a) { track.peaks = a.peaks; track.dur = Math.max(1, Math.round(a.duration)); out.duration = a.duration; out.peaks = a.peaks; }
    }

    if (audioFile) {
      const bytes = new Uint8Array(await audioFile.arrayBuffer());
      if (bytes.length > 60 * 1024 * 1024) throw new Error('فایل صوتی بزرگ‌تر از ۶۰ مگابایت است');
      onProgress('آپلود فایل صوتی روی مخزن…', 28);
      out.audioCommit = await ghPutFile(`assets/audio/${id}.mp3`, toB64(bytes), `felani4f: audio ${id}`);
      out.audio = true;
      track.src = `assets/audio/${id}.mp3?v=${Date.now().toString(36)}`;
    }

    if (coverFile) {
      onProgress('برش و فشرده‌سازی کاور…', 52);
      const imgs = await renderCover(coverFile);
      onProgress('آپلود کاور…', 60);
      await ghPutFile(`assets/img/${id}.jpg`, imgs.big, `felani4f: cover ${id}`);
      await ghPutFile(`assets/img/${id}-sm.jpg`, imgs.small, `felani4f: cover ${id} small`);
      track.img = `assets/img/${id}.jpg`;
      track.imgSmall = `assets/img/${id}-sm.jpg`;
      out.cover = true;
    } else if (!keepCover && !track.img) {
      onProgress('ساخت کاور پیش‌فرض…', 52);
      const imgs = await placeholderCover(track);
      await ghPutFile(`assets/img/${id}.jpg`, imgs.big, `felani4f: cover ${id} placeholder`);
      await ghPutFile(`assets/img/${id}-sm.jpg`, imgs.small, `felani4f: cover ${id} small`);
      track.img = `assets/img/${id}.jpg`;
      track.imgSmall = `assets/img/${id}-sm.jpg`;
      out.cover = true;
    }

    onProgress('ثبت اطلاعات ترک…', 78);
    await applyTrack(track);
    onProgress('انتشار برای همه‌ی بازدیدکننده‌ها…', 88);
    out.publish = await queuePublish(() => publishContent({ silent: true }));
    onProgress('تمام شد', 100);
    return out;
  }

  return {
    CFG, MODE, state, load, refresh, tracks, trackById,
    signup, login, logout, isAdmin, session: () => state.session,
    addComment, deleteComment, commentsFor, commentCount, avgRating,
    incDownload, downloadsOf, totalDownloads, toggleLike, likeCount, iLiked,
    saveTrack, deleteTrack, restoreTrack, setUserRole, banUser, saveSettings, usersList, settings,
    ghToken, setGhToken, publishTrack, publishContent, waitForPages, readId3, analyzeAudio, queuePublish, publishedTrackIds,
    ls: LS,
  };
})();
