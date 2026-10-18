/* ==========================================================
   Felani4F — app.js
   player · shared comments · accounts · admin panel · motion
   ========================================================== */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const FA = '۰۱۲۳۴۵۶۷۸۹';
  const fa = (n) => String(n).replace(/\d/g, (d) => FA[+d]);
  const fmt = (sec) => {
    if (!isFinite(sec) || sec < 0) sec = 0;
    return Math.floor(sec / 60) + ':' + String(Math.floor(sec % 60)).padStart(2, '0');
  };
  const fmtFa = (s) => fa(fmt(s));
  const nf = (n) => fa(Number(n || 0).toLocaleString('en-US'));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rel = (at) => {
    const d = (Date.now() - at) / 1000;
    if (d < 90) return 'همین حالا';
    if (d < 3600) return fa(Math.floor(d / 60)) + ' دقیقه پیش';
    if (d < 86400) return fa(Math.floor(d / 3600)) + ' ساعت پیش';
    if (d < 604800) return fa(Math.floor(d / 86400)) + ' روز پیش';
    return fa(Math.floor(d / 604800)) + ' هفته پیش';
  };
  const ic = (id, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

  /* ---------- track helpers ---------- */
  const allTracks = () => F4F.tracks();
  const byId = (id) => F4F.trackById(id);
  const audioSrc = (t) => t.src || `assets/audio/${t.id}.mp3`;
  const imgBig = (t) => t.img || `assets/img/${t.id}.jpg`;
  const imgSmall = (t) => (t.imgSmall || (t.img ? t.img : `assets/img/${t.id}-sm.jpg`));
  const pseudoPeaks = (t) => {
    let seed = 0;
    for (const ch of t.id) seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
    const rng = (() => { let s = seed || 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const n = 220, out = [];
    for (let i = 0; i < n; i++) {
      const w = Math.sin((i / n) * Math.PI);
      out.push(Math.max(0.08, Math.min(1, (0.35 + rng() * 0.65) * (0.45 + w * 0.8))));
    }
    return out.map((x) => Math.round(x * 1000) / 1000);
  };
  const peaksOf = (t) => (Array.isArray(t.peaks) && t.peaks.length ? t.peaks : pseudoPeaks(t));

  /* ---------- state ---------- */
  const state = { cur: null, playing: false, filter: 'all', q: '', rate: 5, drTrack: null, muted: false, vol: 0.9, onlyMine: false };
  try { const v = localStorage.getItem('f4f.vol'); if (v) state.vol = Number(v) || 0.9; } catch (e) {}

  /* ---------- toasts ---------- */
  const toasts = $('#toasts');
  function toast(msg, ico = 'i-check', ms = 3200) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = ic(ico) + '<span></span>';
    t.lastChild.textContent = msg;
    toasts.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 380); }, ms);
  }
  const errToast = (e) => toast((e && e.message) ? e.message : 'خطایی رخ داد', 'i-ban', 4200);

  /* ---------- preloader ---------- */
  const pre = $('#preload'), plBar = $('#plBar'), plNum = $('#plNum');
  let prog = 0, done = false;
  document.body.classList.add('lock');
  const tick = setInterval(() => {
    prog = Math.min(94, prog + Math.random() * 14);
    plBar.style.width = prog + '%'; plNum.textContent = Math.round(prog) + '%';
  }, 110);
  function finishLoad() {
    if (done) return; done = true;
    clearInterval(tick);
    plBar.style.width = '100%'; plNum.textContent = '100%';
    setTimeout(() => {
      pre.classList.add('done');
      document.body.classList.remove('lock');
      revealAll();
      setTimeout(() => pre.remove(), 1400);
    }, 300);
  }

  /* ---------- reveal ---------- */
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
  const watchReveal = () => $$('.rv:not(.in)').forEach((el) => io.observe(el));
  function revealAll() { setTimeout(watchReveal, 40); }

  /* ---------- header / scroll ---------- */
  const head = $('#head'), scrollProg = $('#scrollProg'), cursor = $('#cursor');
  let scrollY = 0;
  function onScroll() {
    scrollY = window.scrollY;
    head.classList.toggle('scrolled', scrollY > 40);
    const h = document.documentElement.scrollHeight - innerHeight;
    scrollProg.style.width = (h > 0 ? clamp(scrollY / h, 0, 1) * 100 : 0) + '%';
    pinScroll(); parallax();
  }
  addEventListener('scroll', onScroll, { passive: true });

  const navLinks = $$('.nav a');
  const secIO = new IntersectionObserver((es) => {
    es.forEach((e) => {
      if (e.isIntersecting) navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
    });
  }, { rootMargin: '-42% 0px -52% 0px' });
  ['top', 'works', 'library', 'about', 'comments', 'pack'].forEach((id) => { const el = document.getElementById(id); if (el) secIO.observe(el); });

  const sheet = $('#sheet'), burger = $('#burger');
  burger.addEventListener('click', () => {
    const open = sheet.classList.toggle('open');
    burger.setAttribute('aria-expanded', open);
    document.body.classList.toggle('lock', open);
  });
  $$('.sheet a').forEach((a) => a.addEventListener('click', () => {
    sheet.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); document.body.classList.remove('lock');
  }));

  /* ---------- cursor ---------- */
  if (matchMedia('(hover:hover) and (pointer:fine)').matches) {
    let mx = innerWidth / 2, my = innerHeight / 2, cx = mx, cy = my, seen = false;
    addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      if (!seen) { seen = true; cursor.classList.add('on'); }
      const card = e.target.closest('.wcard');
      cursor.classList.toggle('big', !!card);
      cursor.dataset.label = card ? 'باز کن' : '';
    }, { passive: true });
    (function loop() {
      cx += (mx - cx) * 0.18; cy += (my - cy) * 0.18;
      cursor.style.transform = `translate(${cx}px,${cy}px) translate(-50%,-50%)`;
      requestAnimationFrame(loop);
    })();
  }

  /* ---------- hero parallax ---------- */
  const covers = $$('.hcover');
  let pmx = 0, pmy = 0;
  addEventListener('mousemove', (e) => { pmx = e.clientX / innerWidth - 0.5; pmy = e.clientY / innerHeight - 0.5; }, { passive: true });
  function parallax() {
    if (innerWidth < 980 || scrollY > innerHeight) return;
    covers.forEach((c, i) => {
      const d = (i + 1) * 9;
      c.style.translate = `${-pmx * d}px ${-pmy * d + scrollY * 0.05 * (i + 1)}px`;
    });
  }

  /* ---------- ticker ---------- */
  function renderTicker() {
    const T = allTracks();
    const item = (t) => `<span class="tk-i"><b>${esc(t.fa)}</b><span class="dt"></span>${esc(t.en)}<span class="st">${esc(t.genre || '')}</span><span class="dt"></span><span class="en">${t.bpm || '—'} BPM</span><span class="dt"></span>${nf(F4F.downloadsOf(t.id))} دانلود</span>`;
    $('#ticker').innerHTML = T.map(item).join('') + T.map(item).join('');
  }

  /* ---------- waves ---------- */
  const waves = [];
  const trackOfCanvas = (c) => (c.dataset.track ? byId(c.dataset.track) : null);
  function registerWave(canvas, track) {
    if (!canvas || !track) return;
    canvas.dataset.track = track.id;
    const rec = { canvas, track, ctx: canvas.getContext('2d') };
    waves.push(rec);
    drawWave(rec, 0);
    return rec;
  }
  function drawWave(rec, progress) {
    const { canvas, track } = rec;
    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    const h = canvas.clientHeight || 34;
    if (!w || !h) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const ctx = rec.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const peaks = peaksOf(track);
    const n = peaks.length, gap = w < 220 ? 1 : 2;
    const bw = Math.max(1, (w - gap * (n - 1)) / n);
    for (let i = 0; i < n; i++) {
      const x = i * (bw + gap);
      const amp = Math.max(2, peaks[i] * (h - 4));
      const y = (h - amp) / 2;
      const played = i / n <= progress;
      ctx.fillStyle = played ? track.c : 'rgba(255,255,255,.14)';
      ctx.globalAlpha = played ? 0.95 : 0.8;
      const r = Math.min(bw / 2, 2);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, bw, amp, r); else ctx.rect(x, y, bw, amp);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function progressRatio() { return state.cur && audio.duration ? audio.currentTime / audio.duration : 0; }
  function redrawWaves() {
    const p = progressRatio();
    for (let i = waves.length - 1; i >= 0; i--) {
      const rec = waves[i];
      if (!rec.canvas.isConnected) { waves.splice(i, 1); continue; }
      if (state.cur && rec.track.id === state.cur.id) drawWave(rec, p);
    }
    $$('[data-bar]').forEach((b) => {
      b.style.width = state.cur && b.dataset.bar === state.cur.id ? (p * 100).toFixed(1) + '%' : '0%';
    });
    const cur = $('#dkCur'); if (cur && audio) cur.textContent = fmt(audio.currentTime || 0);
  }

  /* ---------- render: works ---------- */
  function renderCards() {
    const T = allTracks();
    $('#haul').innerHTML = T.map((t, i) => `
      <article class="wcard${state.cur && state.cur.id === t.id && state.playing ? ' playing' : ''}" data-open="${t.id}" style="--c:${t.c}" role="button" tabindex="0" aria-label="باز کردن ${esc(t.fa)}">
        <div class="im">
          <img src="${imgBig(t)}" alt="کاور ${esc(t.fa)}" loading="lazy" width="420" height="420">
          <span class="tag-on en">${t.custom ? 'NEW' : 'ORIGINAL'}</span>
          <span class="num en">${String(i + 1).padStart(2, '0')} / ${String(T.length).padStart(2, '0')}</span>
          <span class="pl" data-play="${t.id}" role="button" tabindex="0" aria-label="پخش ${esc(t.fa)}">${ic(state.cur && state.cur.id === t.id && state.playing ? 'i-pause' : 'i-play')}</span>
        </div>
        <div class="bd">
          <h3>${esc(t.fa)} <span class="en">${esc(t.en)}</span></h3>
          <div class="mt"><span>${esc(t.genre || '—')}</span><i></i><span>${t.bpm || '—'} BPM</span><i></i><em>${fmtFa(t.dur || 0)}</em></div>
        </div>
        <div class="bar"><b data-bar="${t.id}"></b></div>
      </article>`).join('');
    pinSetup();
  }

  /* ---------- horizontal pin ---------- */
  const works = $('#works'), pin = $('#pin'), haul = $('#haul');
  let overflow = 0;
  function pinSetup() {
    const desktop = innerWidth > 820;
    pin.style.position = desktop ? 'sticky' : '';
    pin.style.top = desktop ? '0' : '';
    pin.style.height = desktop ? '100svh' : '';
    pin.style.display = desktop ? 'flex' : '';
    pin.style.alignItems = desktop ? 'center' : '';
    pin.style.paddingBlock = desktop ? '86px 104px' : '';
    haul.style.transform = '';
    if (desktop) {
      overflow = Math.max(0, haul.scrollWidth - innerWidth);
      works.style.height = Math.min(innerHeight + overflow + 120, Math.round(innerHeight * 1.72)) + 'px';
    } else { works.style.height = ''; overflow = 0; }
    pinScroll();
  }
  function pinScroll() {
    if (innerWidth <= 820 || !overflow) return;
    const top = works.getBoundingClientRect().top;
    const total = works.offsetHeight - innerHeight;
    const p = clamp(-top / (total || 1), 0, 1);
    haul.style.transform = `translate3d(${(p * overflow).toFixed(1)}px,0,0)`;
  }
  addEventListener('resize', () => { pinSetup(); redrawWaves(); });

  /* ---------- render: library ---------- */
  const genres = () => ['all', ...new Set(allTracks().map((t) => t.genre).filter(Boolean))];
  function renderFilters() {
    $('#filters').innerHTML = genres().map((g) =>
      `<button class="chip${g === state.filter ? ' on' : ''}" data-f="${esc(g)}" role="tab" aria-selected="${g === state.filter}">${g === 'all' ? 'همه' : esc(g)}</button>`
    ).join('') + `<label class="field" style="margin-inline-start:auto;min-width:190px">
        <span class="sr">جست‌وجو</span>
        <span style="position:relative;display:block">
          <input class="input" id="q" value="${esc(state.q)}" placeholder="جست‌وجوی ترک…" style="padding-inline-start:36px">
          <span style="position:absolute;inset-inline-start:12px;top:50%;translate:0 -50%;color:var(--dim)">${ic('i-search')}</span>
        </span></label>`;
  }
  const visibleTracks = () => allTracks().filter((t) =>
    (state.filter === 'all' || t.genre === state.filter) &&
    (!state.q || (t.fa + ' ' + t.en + ' ' + (t.genre || '')).toLowerCase().includes(state.q.toLowerCase())));

  function renderTracks() {
    const list = visibleTracks();
    const el = $('#tracks');
    if (!list.length) { el.innerHTML = `<div class="tr-empty">ترکی با این فیلتر پیدا نشد.</div>`; return; }
    el.innerHTML = list.map((t) => `
      <div class="tr${state.cur && state.cur.id === t.id && state.playing ? ' playing' : ''}" data-open="${t.id}" data-id="${t.id}" style="--c:${t.c}" tabindex="0" role="button" aria-label="${esc(t.fa)}">
        <div class="ix">
          <span class="en">${esc(t.num || '—')}</span>
          <span class="eq"><i></i><i></i><i></i></span>
          ${ic('i-play')}
        </div>
        <div class="th" data-play="${t.id}" title="پخش ${esc(t.fa)}"><img src="${imgSmall(t)}" alt="" width="56" height="56" loading="lazy"><span class="pp">${ic('i-play')}</span></div>
        <div class="t-name">
          <b>${esc(t.fa)} <span class="fa-lat en">${esc(t.en)}</span></b>
          <small>${esc(t.genre || '—')} <i></i> <span class="en">${t.bpm || '—'} BPM</span> <i></i> ${nf(F4F.downloadsOf(t.id))} دانلود <i></i> ${nf(F4F.commentCount(t.id))} نظر</small>
        </div>
        <canvas class="wave" aria-hidden="true"></canvas>
        <div class="dur en">${fmt(t.dur || 0)}</div>
        <div class="acts">
          <button class="mini like${F4F.iLiked(t.id) ? ' liked' : ''}" data-like="${t.id}" aria-label="پسندیدن" aria-pressed="${F4F.iLiked(t.id)}">${ic(F4F.iLiked(t.id) ? 'i-heart-f' : 'i-heart')}<span class="cnt">${nf(F4F.likeCount(t.id))}</span></button>
          <button class="mini cm" data-cm="${t.id}" aria-label="نظرها">${ic('i-comment')}</button>
          <button class="mini dl" data-dl="${t.id}" aria-label="دانلود">${ic('i-download')}</button>
        </div>
      </div>`).join('');
    $$('canvas.wave', el).forEach((c) => registerWave(c, byId(c.closest('.tr').dataset.id)));
    const sum = allTracks().reduce((a, t) => a + (t.dur || 0), 0);
    $('#libCount').textContent = `${fa(allTracks().length)} ترک · مجموع ${fa(Math.floor(sum / 60))} دقیقه و ${fa(Math.round(sum % 60))} ثانیه`;
    syncPlayingUI();
  }

  /* ---------- render: pack ---------- */
  function renderPack() {
    const T = allTracks();
    $('#packList').innerHTML = T.map((t) => `
      <div class="pl-row">
        <img src="${imgSmall(t)}" alt="" width="30" height="30" loading="lazy">
        <div class="pn"><b>${esc(t.fa)}</b><small>${esc(t.en)}</small></div>
        <span class="pd">${nf(F4F.downloadsOf(t.id))} DL</span>
        <button class="mini dl" data-dl="${t.id}" aria-label="دانلود ${esc(t.fa)}">${ic('i-download')}</button>
      </div>`).join('') +
      `<div class="pack-foot"><span><b>${fa(T.length)} فایل</b> · MP3 192</span><span>${nf(F4F.totalDownloads())} دانلود کل</span></div>`;
    $('#packCount').textContent = `${fa(T.length)} فایل`;
  }

  /* ---------- render: comments ---------- */
  function starsHTML(r) {
    let out = '';
    for (let i = 0; i < 5; i++) out += `<svg class="${i < r ? 'f' : ''}" aria-hidden="true"><use href="#i-star"/></svg>`;
    return out;
  }
  function commentCard(c, opts = {}) {
    const t = byId(c.trackId);
    return `<article class="cm-card" data-cid="${c.id}">
      <div class="cm-top">
        <span class="av">${esc((c.user || '?').charAt(0).toUpperCase())}</span>
        <div class="nm">
          <b>${esc(c.user)}</b>
          <small><span class="tk">${t ? esc(t.fa) : '—'}</span> · ${rel(c.at)}</small>
        </div>
        <span class="stars" aria-label="${fa(c.rating)} از ۵">${starsHTML(c.rating)}</span>
        ${opts.admin ? `<button class="mini cm-del" data-delcm="${c.id}" aria-label="حذف نظر">${ic('i-trash')}</button>` : ''}
      </div>
      <p class="cm-body">${esc(c.text)}</p>
    </article>`;
  }
  function renderComments() {
    let list = F4F.state.comments.slice().sort((a, b) => b.at - a.at);
    if (state.onlyMine && F4F.session()) list = list.filter((c) => c.user === F4F.session().username);
    const latest = list.slice(0, 8);
    $('#cmList').innerHTML = latest.length ? latest.map((c) => commentCard(c, { admin: F4F.isAdmin() })).join('')
      : `<div class="cm-empty">هنوز نظری ثبت نشده — اولین نفر باش.</div>`;
    const avg = F4F.avgRating();
    $('#avgNum').textContent = F4F.state.comments.length ? fa(avg.toFixed(1)) : '—';
    $('#avgStars').innerHTML = starsHTML(Math.round(avg));
    $('#avgCount').textContent = nf(F4F.state.comments.length) + ' نظر';
    updateStats();
    renderAuthUI();
  }

  function renderDrawerComments() {
    if (!state.drTrack) return;
    const list = F4F.commentsFor(state.drTrack.id);
    $('#drCmCount').textContent = fa(list.length) + ' نظر';
    $('#drCmList').innerHTML = list.length ? list.map((c) => commentCard(c, { admin: F4F.isAdmin() })).join('')
      : `<div class="cm-empty">هنوز نظری برای این ترک ثبت نشده — اولین نفر باش.</div>`;
    const logged = !!F4F.session();
    $('#drRequired').hidden = logged;
    $('#drCmForm').hidden = !logged;
    if (logged) {
      $('#drAv').textContent = F4F.session().username.charAt(0).toUpperCase();
      $('#drAs').textContent = F4F.session().username;
    }
  }

  /* ---------- stats ---------- */
  function updateStats() {
    const T = allTracks();
    $('#statTracks').innerHTML = fa(T.length) + '<i>TRACKS</i>';
    $('#statDur').textContent = fmtFa(T.reduce((a, t) => a + (t.dur || 0), 0));
    $('#statDl').textContent = nf(F4F.totalDownloads());
    $('#statCm').textContent = nf(F4F.state.comments.length);
  }

  /* ---------- audio ---------- */
  const audio = $('#audio');
  const dock = $('#dock');
  audio.volume = state.vol;

  function loadTrack(id, autoplay = true) {
    const t = byId(id);
    if (!t) return;
    const same = state.cur && state.cur.id === id;
    if (!same) {
      state.cur = t;
      audio.src = audioSrc(t);
      $('#dkCover').src = imgSmall(t);
      $('#dkTitle').textContent = t.fa + ' — ' + t.en;
      $('#dkSub').textContent = t.genre || 'Felani4F';
      $('#dkDur').textContent = fmt(t.dur || 0);
      $('#dkCur').textContent = '0:00';
      dock.classList.add('up');
      syncPlayingUI();
      if (drawer.classList.contains('open')) openDrawer(id, { focus: false });
    }
    if (autoplay) audio.play().catch(() => { state.playing = false; syncPlayingUI(); });
  }
  function syncPlayingUI() {
    const id = state.cur && state.cur.id;
    dock.classList.toggle('playing', !!(state.playing && id));
    $('#dkPlay').innerHTML = ic(state.playing ? 'i-pause' : 'i-play');
    const liked = state.cur && F4F.iLiked(state.cur.id);
    $('#dkLike').classList.toggle('liked', !!liked);
    $('#dkLike').innerHTML = ic(liked ? 'i-heart-f' : 'i-heart');
    $$('.tr').forEach((r) => r.classList.toggle('playing', r.dataset.id === id && state.playing));
    $$('.wcard').forEach((c) => {
      const on = c.dataset.open === id && state.playing;
      c.classList.toggle('playing', on);
      const pl = c.querySelector('.pl'); if (pl) pl.innerHTML = ic(on ? 'i-pause' : 'i-play');
    });
    const hp = $('#heroPlay use'); if (hp) hp.setAttribute('href', state.playing ? '#i-pause' : '#i-play');
    const dp = $('#drPlay');
    const drOn = state.playing && id && state.drTrack && id === state.drTrack.id;
    if (dp) dp.innerHTML = ic(drOn ? 'i-pause' : 'i-play') + (drOn ? ' توقف' : ' پخش');
    redrawWaves();
    updateMediaSession();
  }
  function togglePlay() {
    if (!state.cur) { const T = allTracks(); if (T.length) loadTrack(T[0].id, true); return; }
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  }
  function step(dir) {
    const T = allTracks(); if (!T.length) return;
    let i = state.cur ? T.findIndex((t) => t.id === state.cur.id) : 0;
    i = (i + dir + T.length) % T.length;
    loadTrack(T[i].id, true);
  }
  audio.addEventListener('play', () => { state.playing = true; syncPlayingUI(); });
  audio.addEventListener('pause', () => { state.playing = false; syncPlayingUI(); });
  audio.addEventListener('timeupdate', () => {
    const cur = $('#dkCur'); if (cur) cur.textContent = fmt(audio.currentTime);
    redrawWaves();
  });
  audio.addEventListener('loadedmetadata', () => { $('#dkDur').textContent = fmt(audio.duration); redrawWaves(); });
  audio.addEventListener('ended', () => step(1));
  audio.addEventListener('error', () => { if (state.cur) toast('فایل صوتی این ترک در دسترس نیست', 'i-ban'); });
  function updateMediaSession() {
    if (!('mediaSession' in navigator) || !state.cur) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: state.cur.fa + ' — ' + state.cur.en,
        artist: 'Felani4F',
        album: 'Felani4F · Vol.01',
        artwork: [{ src: new URL(imgBig(state.cur), location.href).href, sizes: '880x880', type: 'image/jpeg' }],
      });
      navigator.mediaSession.setActionHandler('play', () => audio.play());
      navigator.mediaSession.setActionHandler('pause', () => audio.pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
      navigator.mediaSession.setActionHandler('previoustrack', () => step(-1));
    } catch (e) {}
  }

  /* dock */
  $('#dkPlay').addEventListener('click', togglePlay);
  $('#dkPrev').addEventListener('click', () => step(-1));
  $('#dkNext').addEventListener('click', () => step(1));
  $('#dkClose').addEventListener('click', () => { audio.pause(); dock.classList.remove('up'); });
  $('#dkLike').addEventListener('click', () => state.cur && doLike(state.cur.id));
  $('#dkDl').addEventListener('click', () => state.cur && download(state.cur.id));
  $('#dkCm').addEventListener('click', () => state.cur && openDrawer(state.cur.id, { focus: true }));
  $('#dkOpen').addEventListener('click', () => state.cur && openDrawer(state.cur.id, { focus: false }));
  $('#dkMute').addEventListener('click', () => {
    state.muted = !state.muted;
    audio.muted = state.muted;
    $('#dkMute').innerHTML = ic(state.muted ? 'i-mute' : 'i-volume');
    $('#dkMute').classList.toggle('on', state.muted);
  });
  const vol = $('#dkVol'); vol.value = state.vol;
  vol.addEventListener('input', () => {
    state.vol = +vol.value; audio.volume = state.vol; state.muted = state.vol === 0;
    audio.muted = state.muted; try { localStorage.setItem('f4f.vol', state.vol); } catch (e) {}
    $('#dkMute').innerHTML = ic(state.muted ? 'i-mute' : 'i-volume');
  });
  $('#dkWave').addEventListener('click', (e) => {
    if (!state.cur || !audio.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    audio.currentTime = clamp((e.clientX - r.left) / r.width, 0, 1) * audio.duration;
  });
  $('#tracks').addEventListener('click', (e) => {
    const w = e.target.closest('canvas.wave'); if (!w) return;
    const t = byId(w.closest('.tr').dataset.id);
    const r = w.getBoundingClientRect();
    const p = clamp((e.clientX - r.left) / r.width, 0, 1);
    if (!state.cur || state.cur.id !== t.id) { loadTrack(t.id, true); setTimeout(() => { if (audio.duration) audio.currentTime = p * audio.duration; }, 500); }
    else if (audio.duration) audio.currentTime = p * audio.duration;
    e.stopPropagation();
  });

  /* ---------- likes / downloads ---------- */
  async function doLike(id) {
    if (!F4F.session()) { openAuth('login'); toast('برای پسندیدن وارد حساب شو', 'i-lock'); return; }
    try {
      const liked = await F4F.toggleLike(id);
      renderTracks(); syncPlayingUI();
      if (drawer.classList.contains('open')) syncDrawerLike();
      toast(liked ? 'به علاقه‌مندی‌هایت اضافه شد' : 'از علاقه‌مندی‌ها حذف شد', 'i-heart-f', 2000);
    } catch (e) { errToast(e); }
  }
  function download(id) {
    const t = byId(id); if (!t) return;
    const a = document.createElement('a');
    a.href = audioSrc(t);
    a.download = `Felani4F - ${t.en}.mp3`;
    if (/^https?:/i.test(a.href)) a.target = '_blank';
    document.body.appendChild(a); a.click(); a.remove();
    F4F.incDownload(id).then(() => { renderTracks(); renderPack(); updateStats(); });
    toast(`«${t.fa}» در حال دانلود است`, 'i-download');
  }
  function downloadAll() {
    const T = allTracks();
    toast(`پک ${fa(T.length)} ترک Felani4F در حال دانلود است`, 'i-download');
    T.forEach((t, i) => setTimeout(() => {
      const a = document.createElement('a');
      a.href = audioSrc(t); a.download = `Felani4F - ${t.num || ''} - ${t.en}.mp3`;
      if (/^https?:/i.test(a.href)) a.target = '_blank';
      document.body.appendChild(a); a.click(); a.remove();
      F4F.incDownload(t.id);
    }, 650 * i));
    setTimeout(() => { renderTracks(); renderPack(); updateStats(); }, 700 * T.length + 400);
  }

  /* ---------- drawer ---------- */
  const drawer = $('#drawer'), scrim = $('#scrim');
  function syncDrawerLike() {
    const b = $('#drLike');
    const on = F4F.iLiked(state.drTrack.id);
    b.classList.toggle('liked', on);
    b.innerHTML = ic(on ? 'i-heart-f' : 'i-heart') + ' پسندیدن';
  }
  function openDrawer(id, opts = {}) {
    const t = byId(id); if (!t) return;
    state.drTrack = t;
    $('#drImg').src = imgBig(t);
    $('#drTitle').textContent = t.fa;
    $('#drEn').textContent = t.en + ' · Felani4F';
    $('#drTag').textContent = t.custom ? 'NEW · VOL.01' : 'ORIGINAL · VOL.01';
    $('#drGenre').textContent = t.genre || '—';
    $('#drBpm').textContent = (t.bpm || '—') + ' BPM';
    $('#drKey').textContent = t.key || '—';
    $('#drDur').textContent = fmt(t.dur || 0);
    $('#drDls').textContent = nf(F4F.downloadsOf(t.id));
    $('#drDesc').textContent = t.desc || '';
    syncDrawerLike();
    $('#drPlay').innerHTML = ic(state.playing && state.cur && state.cur.id === id ? 'i-pause' : 'i-play') + (state.playing && state.cur && state.cur.id === id ? ' توقف' : ' پخش');
    const w = $('#drWave');
    const existing = waves.find((r) => r.canvas === w);
    if (existing) waves.splice(waves.indexOf(existing), 1);
    registerWave(w, t);
    renderDrawerComments();
    drawer.scrollTop = 0;
    drawer.classList.add('open'); scrim.classList.add('open'); document.body.classList.add('lock');
    setTimeout(() => { const rec = waves.find((r) => r.canvas === w); if (rec) drawWave(rec, state.cur && state.cur.id === t.id ? progressRatio() : 0); }, 60);
    if (opts.focus) setTimeout(() => { const f = $('#drCmText'); if (f && !f.closest('form').hidden) f.focus(); }, 600);
  }
  function closeDrawer() {
    drawer.classList.remove('open'); scrim.classList.remove('open');
    if (!adminModal.classList.contains('open') && !authModal.classList.contains('open')) document.body.classList.remove('lock');
  }
  $('#drClose').addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);
  $('#drPlay').addEventListener('click', () => {
    const id = state.drTrack && state.drTrack.id; if (!id) return;
    if (state.cur && state.cur.id === id) togglePlay(); else loadTrack(id, true);
  });
  $('#drDl').addEventListener('click', () => state.drTrack && download(state.drTrack.id));
  $('#drLike').addEventListener('click', () => state.drTrack && doLike(state.drTrack.id));
  $('#drShare').addEventListener('click', shareSite);

  /* ---------- stars ---------- */
  function starInput(container, initial = 5, onChange = () => {}) {
    let val = initial;
    const paint = () => $$('button', container).forEach((b, i) => {
      b.classList.toggle('on', i < val);
      b.setAttribute('aria-checked', i + 1 === val);
    });
    container.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', fa(i + 1) + ' ستاره');
      b.innerHTML = ic('i-star');
      b.addEventListener('click', () => { val = i + 1; paint(); onChange(val); });
      container.appendChild(b);
    }
    paint();
    return { get: () => val, set: (v) => { val = v; paint(); } };
  }
  const mainStars = starInput($('#starIn'), 5, (v) => { state.rate = v; });
  state.rate = 5;
  const drStars = starInput($('#drStars'), 5);

  /* ---------- auth ---------- */
  const authModal = $('#authModal'), adminModal = $('#adminModal');
  let authMode = 'login';
  function openAuth(mode = 'login') {
    authMode = mode;
    $('#authErr').hidden = true;
    $$('.auth-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === mode));
    $('#authTitle').textContent = mode === 'signup' ? 'ساخت حساب' : 'ورود به حساب';
    $('#authSubmit').innerHTML = (mode === 'signup' ? 'ثبت‌نام' : 'ورود') + ' ' + ic('i-arrow');
    $('#authPass2Wrap').hidden = mode !== 'signup';
    $('#authPass').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    authModal.classList.add('open'); document.body.classList.add('lock');
    setTimeout(() => $('#authUser').focus(), 350);
  }
  function closeAuth() {
    authModal.classList.remove('open');
    if (!drawer.classList.contains('open') && !adminModal.classList.contains('open')) document.body.classList.remove('lock');
  }
  $$('.auth-open').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); openAuth(b.dataset.mode || 'login'); sheet.classList.remove('open'); }));
  $$('.auth-tabs button').forEach((b) => b.addEventListener('click', () => openAuth(b.dataset.tab)));
  $$('.m-close').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.close;
    if (id === 'authModal') closeAuth();
    if (id === 'adminModal') closeAdmin();
    if (id === 'trackModal') $('#trackModal').classList.remove('open');
  }));
  [authModal, adminModal].forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) { m === authModal ? closeAuth() : closeAdmin(); } }));

  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = $('#authUser').value.trim(), p = $('#authPass').value, p2 = $('#authPass2').value;
    const err = $('#authErr');
    err.hidden = true;
    const btn = $('#authSubmit'); btn.disabled = true; btn.style.opacity = .7;
    try {
      if (authMode === 'signup') {
        if (p !== p2) throw new Error('رمزها یکسان نیستند');
        await F4F.signup(u, p);
        toast('حساب ساخته شد — خوش آمدی!', 'i-check');
      } else {
        await F4F.login(u, p);
        toast('خوش برگشتی، ' + F4F.session().username, 'i-user');
      }
      closeAuth();
      $('#authForm').reset();
      renderAuthUI();
    } catch (ex) {
      err.textContent = ex.message || 'خطا در ورود';
      err.hidden = false;
    } finally { btn.disabled = false; btn.style.opacity = 1; }
  });

  function renderAuthUI() {
    const s = F4F.session();
    const logged = !!s;
    $('#loginBtn').hidden = logged;
    $('#userMenu').hidden = !logged;
    $('#goAdmin').hidden = !F4F.isAdmin();
    $('#adminLink').hidden = !F4F.isAdmin();
    if (logged) {
      const av = s.username.charAt(0).toUpperCase();
      $('#userAv').textContent = av; $('#userAv2').textContent = av;
      $('#userName').textContent = s.username; $('#userName2').textContent = s.username;
      $('#userRole').textContent = s.role === 'admin' ? 'مدیر سایت' : 'شنونده';
    }
    const cmLogged = logged;
    $('#cmRequired').hidden = cmLogged;
    $('#cmFields').hidden = !cmLogged;
    if (cmLogged) { $('#cmAv').textContent = s.username.charAt(0).toUpperCase(); $('#cmAs').textContent = s.username; }
    renderDrawerComments();
    const t = state.drTrack;
    if (t) $('#drPlay').innerHTML = ic(state.playing && state.cur && state.cur.id === t.id ? 'i-pause' : 'i-play') + (state.playing && state.cur && state.cur.id === t.id ? ' توقف' : ' پخش');
  }
  const userChip = $('#userChip'), userPop = $('#userPop');
  userChip.addEventListener('click', () => {
    const open = userPop.classList.toggle('open');
    userChip.setAttribute('aria-expanded', open);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#userMenu')) { userPop.classList.remove('open'); userChip.setAttribute('aria-expanded', false); }
  });
  $('#logoutBtn').addEventListener('click', () => {
    F4F.logout(); userPop.classList.remove('open');
    renderAuthUI(); renderComments(); toast('از حساب خارج شدی', 'i-logout');
  });
  $('#goAdmin').addEventListener('click', () => { userPop.classList.remove('open'); openAdmin(); });
  $('#adminLink').addEventListener('click', openAdmin);
  $('#goMyComments').addEventListener('click', () => {
    userPop.classList.remove('open');
    state.onlyMine = true;
    renderComments();
    document.getElementById('comments').scrollIntoView({ behavior: 'smooth' });
    toast('فقط نظرهای تو نمایش داده می‌شود', 'i-comment');
    setTimeout(() => {
      const bar = $('#mineBar'); if (bar) bar.hidden = false;
    }, 400);
  });

  /* ---------- comment forms ---------- */
  $('#cmForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('#cmText').value.trim();
    if (text.length < 3) { toast('نظرت کمی کوتاه است', 'i-comment'); return; }
    try {
      await F4F.addComment($('#cmTrack').value, state.rate, text);
      $('#cmText').value = ''; mainStars.set(5); state.rate = 5;
      renderComments(); renderTracks(); if (state.cur) syncPlayingUI();
      toast('نظرت ثبت شد — حالا همه می‌بیننش', 'i-check');
    } catch (ex) { errToast(ex); }
  });
  $('#drCmForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.drTrack) return;
    const text = $('#drCmText').value.trim();
    if (text.length < 3) { toast('نظرت کمی کوتاه است', 'i-comment'); return; }
    try {
      await F4F.addComment(state.drTrack.id, drStars.get(), text);
      $('#drCmText').value = ''; drStars.set(5);
      renderDrawerComments(); renderComments(); renderTracks();
      toast('نظرت ثبت شد', 'i-check');
    } catch (ex) { errToast(ex); }
  });
  document.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-delcm]');
    if (del) {
      if (!F4F.isAdmin()) return;
      if (!confirm('این نظر حذف شود؟')) return;
      try { await F4F.deleteComment(del.dataset.delcm); renderComments(); renderDrawerComments(); toast('نظر حذف شد', 'i-trash'); }
      catch (ex) { errToast(ex); }
    }
  });

  /* ---------- global click routing ---------- */
  document.addEventListener('click', (e) => {
    // action buttons win over the row/card "open" handler
    const pl = e.target.closest('[data-play]');
    if (pl) { e.stopPropagation(); const id = pl.dataset.play; if (state.cur && state.cur.id === id) togglePlay(); else loadTrack(id, true); return; }
    const like = e.target.closest('[data-like]');
    if (like) { e.stopPropagation(); doLike(like.dataset.like); return; }
    const cm = e.target.closest('[data-cm]');
    if (cm) { e.stopPropagation(); openDrawer(cm.dataset.cm, { focus: true }); return; }
    const dl = e.target.closest('[data-dl]');
    if (dl) { e.stopPropagation(); download(dl.dataset.dl); return; }
    const open = e.target.closest('[data-open]');
    if (open) { openDrawer(open.dataset.open, {}); return; }
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input,textarea,select')) return;
    if (e.key === 'Enter' || e.key === ' ') {
      const card = e.target.closest('[data-open],[data-play]');
      if (card) { e.preventDefault(); e.target.click(); }
    }
  });

  /* ---------- filters ---------- */
  $('#filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    state.filter = b.dataset.f; renderFilters(); renderTracks();
  });
  $('#filters').addEventListener('input', (e) => {
    if (e.target.id === 'q') { state.q = e.target.value.trim(); renderTracks(); }
  });
  $('#searchBtn').addEventListener('click', () => {
    document.getElementById('library').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => { const q = $('#q'); if (q) q.focus(); }, 650);
  });

  /* ---------- share / pack ---------- */
  async function shareSite() {
    const data = { title: 'Felani4F — فلانی فور اف', text: 'موسیقی مستقل؛ بشنو، دانلود کن، نظر بده.', url: location.href };
    try {
      if (navigator.share) { await navigator.share(data); return; }
      await navigator.clipboard.writeText(location.href);
      toast('لینک سایت کپی شد', 'i-check');
    } catch (e) { toast('لینک: ' + location.href, 'i-share'); }
  }
  $('#shareBtn').addEventListener('click', shareSite);
  $('#dlAll').addEventListener('click', downloadAll);
  $('#heroPlay').addEventListener('click', () => { if (!state.cur) { const T = allTracks(); if (T.length) loadTrack(T[0].id, true); } else togglePlay(); });

  /* ==========================================================
     ADMIN PANEL
     ========================================================== */
  function openAdmin() {
    if (!F4F.isAdmin()) { openAuth('login'); toast('فقط مدیر سایت دسترسی دارد', 'i-lock'); return; }
    adminModal.classList.add('open'); document.body.classList.add('lock');
    renderAdmin();
  }
  function closeAdmin() {
    adminModal.classList.remove('open');
    if (!drawer.classList.contains('open') && !authModal.classList.contains('open')) document.body.classList.remove('lock');
  }
  $$('.admin-tabs button').forEach((b) => b.addEventListener('click', () => {
    $$('.admin-tabs button').forEach((x) => x.classList.toggle('on', x === b));
    $$('.atab').forEach((p) => p.classList.toggle('on', p.dataset.panel === b.dataset.atab));
    if (b.dataset.atab === 'users') renderAdminUsers();
    if (b.dataset.atab === 'comments') renderAdminComments();
    if (b.dataset.atab === 'stats') renderAdminStats();
    if (b.dataset.atab === 'publish') { $('#ghToken').value = F4F.ghToken(); }
  }));
  function renderAdmin() {
    renderAdminTracks(); renderAdminUsers(); renderAdminComments(); renderAdminStats();
    $('#ghToken').value = F4F.ghToken();
    $('#ghRepo').value = F4F.CFG.repo; $('#ghBranch').value = F4F.CFG.branch;
  }
  function renderAdminTracks() {
    const baseIds = new Set((typeof TRACKS !== 'undefined' ? TRACKS : []).map((t) => t.id));
    const list = allTracks();
    const hidden = Object.keys(F4F.state.core.overrides || {}).filter((k) => F4F.state.core.overrides[k].deleted)
      .map((k) => (typeof TRACKS !== 'undefined' ? TRACKS.find((t) => t.id === k) : null)).filter(Boolean);
    $('#admTracks').innerHTML = list.map((t) => `
      <div class="adm-tr" data-aid="${t.id}">
        <img src="${imgSmall(t)}" alt="" width="46" height="46">
        <div class="at-meta">
          <b>${esc(t.fa)} <span class="en">${esc(t.en)}</span></b>
          <small>${esc(t.genre || '—')} · ${t.bpm || '—'} BPM · ${fmt(t.dur || 0)} ${t.custom ? '· <span class="badge new">جدید</span>' : ''}</small>
        </div>
        <div class="at-nums"><span>${nf(F4F.downloadsOf(t.id))} دانلود</span><span>${nf(F4F.commentCount(t.id))} نظر</span><span>${nf(F4F.likeCount(t.id))} لایک</span></div>
        <div class="at-acts">
          <button class="mini" data-edit="${t.id}" aria-label="ویرایش">${ic('i-edit')}</button>
          <button class="mini dl" data-audioreplace="${t.id}" aria-label="تغییر فایل صوتی">${ic('i-wave')}</button>
          <button class="mini cm-del" data-deletetrack="${t.id}" aria-label="حذف">${ic('i-trash')}</button>
        </div>
      </div>`).join('') || '<div class="cm-empty">ترکی وجود ندارد.</div>'
      + (hidden.length ? `<div class="adm-hidden"><b>ترک‌های حذف‌شده:</b> ${hidden.map((t) => `<button class="chip" data-restoretrack="${t.id}">${esc(t.fa)} — بازگردانی</button>`).join(' ')}</div>` : '');
  }
  function renderAdminUsers() {
    const users = F4F.usersList().sort((a, b) => (b.role === 'admin') - (a.role === 'admin') || b.createdAt - a.createdAt);
    $('#admUsers').innerHTML = `<div class="adm-row head"><span>کاربر</span><span>نقش</span><span>عضویت</span><span>وضعیت</span><span></span></div>` +
      users.map((u) => `<div class="adm-row">
        <span class="u-cell"><span class="av">${esc(u.username.charAt(0).toUpperCase())}</span> ${esc(u.username)} ${u.role === 'admin' ? '<span class="badge admin">مدیر</span>' : ''}</span>
        <span>${u.role === 'admin' ? 'مدیر' : 'شنونده'}</span>
        <span class="en">${new Date(u.createdAt || Date.now()).toLocaleDateString('en-GB')}</span>
        <span>${F4F.state.core.banned[u.username] ? '<span class="badge ban">مسدود</span>' : '<span class="badge ok">فعال</span>'}</span>
        <span class="row-acts">
          ${u.username === 'Xray_Venom' ? '' : `
            <button class="mini" data-role="${esc(u.username)}" data-value="${u.role === 'admin' ? 'user' : 'admin'}" title="${u.role === 'admin' ? 'حذف نقش مدیر' : 'ارتقا به مدیر'}">${ic('i-crown')}</button>
            <button class="mini cm-del" data-ban="${esc(u.username)}" data-value="${F4F.state.core.banned[u.username] ? '0' : '1'}" title="${F4F.state.core.banned[u.username] ? 'رفع مسدودی' : 'مسدود کردن'}">${ic('i-ban')}</button>`}
        </span>
      </div>`).join('');
  }
  function renderAdminComments() {
    const list = F4F.state.comments.slice().sort((a, b) => b.at - a.at).slice(0, 60);
    $('#admComments').innerHTML = list.length ? list.map((c) => {
      const t = byId(c.trackId);
      return `<div class="adm-cm">
        <div class="adm-cm-top"><span class="av">${esc(c.user.charAt(0).toUpperCase())}</span><b>${esc(c.user)}</b>
          <span class="stars">${starsHTML(c.rating)}</span>
          <small>${t ? esc(t.fa) : '—'} · ${rel(c.at)}</small>
          <button class="mini cm-del" data-delcm="${c.id}" aria-label="حذف">${ic('i-trash')}</button></div>
        <p>${esc(c.text)}</p>
      </div>`;
    }).join('') : '<div class="cm-empty">نظری ثبت نشده.</div>';
  }
  function renderAdminStats() {
    const T = allTracks();
    const users = F4F.usersList();
    $('#admStats').innerHTML = `
      <div class="sc"><span>دانلود کل</span><b>${nf(F4F.totalDownloads())}</b></div>
      <div class="sc"><span>نظرها</span><b>${nf(F4F.state.comments.length)}</b></div>
      <div class="sc"><span>کاربران</span><b>${nf(users.length)}</b></div>
      <div class="sc"><span>ترک‌ها</span><b>${nf(T.length)}</b></div>
      <div class="sc"><span>میانگین امتیاز</span><b>${F4F.state.comments.length ? fa(F4F.avgRating().toFixed(1)) : '—'}</b></div>
      <div class="sc"><span>حالت ذخیره‌سازی</span><b style="font-size:14px;color:${F4F.MODE === 'shared' ? 'var(--acc)' : 'var(--dim)'}">${F4F.MODE === 'shared' ? 'دیتابیس مشترک' : 'محلی (این مرورگر)'}</b></div>`;
    $('#admDlTable').innerHTML = `<div class="adm-row head"><span>ترک</span><span>دانلود</span><span>نظر</span><span>لایک</span><span></span></div>` +
      T.map((t) => `<div class="adm-row"><span class="u-cell"><img src="${imgSmall(t)}" width="26" height="26" alt=""> ${esc(t.fa)}</span><span class="en">${nf(F4F.downloadsOf(t.id))}</span><span class="en">${nf(F4F.commentCount(t.id))}</span><span class="en">${nf(F4F.likeCount(t.id))}</span><span></span></div>`).join('');
  }

  /* track editor */
  const trackModal = $('#trackModal');
  function openTrackEditor(id) {
    const t = id ? byId(id) : null;
    $('#trTitle').innerHTML = (t ? ic('i-edit') + ' ویرایش ترک' : ic('i-plus') + ' ترک جدید');
    $('#trId').value = t ? t.id : '';
    $('#trId').dataset.custom = t && t.custom ? '1' : '0';
    $('#trFa').value = t ? t.fa : '';
    $('#trEn').value = t ? t.en : '';
    $('#trGenre').value = t ? t.genre || '' : '';
    $('#trColor').value = t ? t.c || '#ff2b3a' : '#ff2b3a';
    $('#trBpm').value = t ? t.bpm || 100 : 100;
    $('#trKey').value = t ? t.key || '' : 'A min';
    $('#trDur').value = t ? Math.round(t.dur || 0) : 120;
    $('#trNum').value = t ? t.num || '' : String(allTracks().length + 1).padStart(2, '0');
    $('#trDesc').value = t ? t.desc || '' : '';
    $('#trAudio').value = ''; $('#trCover').value = '';
    $('#trSrc').value = t && t.src && /^https?:/i.test(t.src) ? t.src : (t && t.src && !/^assets\//.test(t.src) ? t.src : '');
    $('#trImg').value = t && t.img && /^https?:/i.test(t.img) ? t.img : '';
    $('#trErr').hidden = true;
    const isBase = t && (typeof TRACKS !== 'undefined') && TRACKS.some((b) => b.id === t.id);
    $('#trDelete').hidden = !t;
    $('#trRestore').hidden = true;
    $('#trHint').textContent = id ? '' : 'شناسه از نام انگلیسی ساخته می‌شود.';
    if (!id) { $('#trId').dataset.newid = '1'; } else { delete $('#trId').dataset.newid; }
    trackModal.classList.add('open');
    setTimeout(() => $('#trFa').focus(), 300);
  }
  $('#newTrackBtn').addEventListener('click', () => openTrackEditor(null));
  $('#trDelete').addEventListener('click', async () => {
    const id = $('#trId').value; if (!id) return;
    if (!confirm('این ترک حذف شود؟ (قابل بازگردانی)')) return;
    try {
      await F4F.deleteTrack(id);
      trackModal.classList.remove('open');
      rerenderAll();
      toast('ترک حذف شد', 'i-trash');
    } catch (e) { errToast(e); }
  });
  $('#trRestore').addEventListener('click', async () => {
    const id = $('#trId').value; if (!id) return;
    try { await F4F.restoreTrack(id); trackModal.classList.remove('open'); rerenderAll(); toast('ترک بازگردانده شد', 'i-check'); }
    catch (e) { errToast(e); }
  });
  $('#trackForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const idField = $('#trId').value.trim();
    const en = $('#trEn').value.trim();
    let id = idField || en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    if (!id) { showTrErr('نام انگلیسی برای ساخت شناسه لازم است'); return; }
    const existing = byId(id);
    if (!idField && existing) { showTrErr('ترکی با این شناسه از قبل وجود دارد'); return; }
    const isBase = (typeof TRACKS !== 'undefined') && TRACKS.some((b) => b.id === id);
    const audioFile = $('#trAudio').files[0] || null;
    const coverFile = $('#trCover').files[0] || null;
    const payload = {
      id,
      fa: $('#trFa').value.trim() || en,
      en,
      genre: $('#trGenre').value.trim() || 'الکترونیک',
      c: $('#trColor').value || '#ff2b3a',
      bpm: Number($('#trBpm').value) || 100,
      key: $('#trKey').value.trim() || 'A min',
      dur: Number($('#trDur').value) || 120,
      num: $('#trNum').value.trim() || '—',
      desc: $('#trDesc').value.trim(),
      year: '۲۰۲۶',
      custom: !isBase,
      peaks: existing && Array.isArray(existing.peaks) && existing.peaks.length ? existing.peaks : pseudoPeaks({ id }),
      likes: existing ? existing.likes : 0, dls: existing ? existing.dls : 0, size: existing ? existing.size : 0,
    };
    const srcUrl = $('#trSrc').value.trim();
    const imgUrl = $('#trImg').value.trim();
    if (srcUrl) payload.src = srcUrl;
    if (imgUrl) payload.img = imgUrl;
    if (!srcUrl && !audioFile && !isBase) { showTrErr('فایل صوتی یا لینک مستقیم لازم است'); return; }
    try {
      const btn = e.submitter || $('#trackForm button[type=submit]');
      if (btn) { btn.disabled = true; btn.style.opacity = .7; }
      if (audioFile || coverFile) {
        if (!F4F.ghToken()) throw new Error('برای بارگذاری فایل، اول در تب «انتشار فایل» توکن را ذخیره کن (یا از لینک مستقیم استفاده کن)');
        await F4F.publishTrack({ track: payload, audioFile, coverFile });
        toast('فایل‌ها منتشر شدند', 'i-cloud');
      }
      await F4F.saveTrack(payload);
      trackModal.classList.remove('open');
      rerenderAll();
      toast(idField ? 'ترک به‌روزرسانی شد' : 'ترک جدید منتشر شد', 'i-check');
    } catch (ex) { showTrErr(ex.message || 'خطا در ذخیره'); }
    finally { const btn = e.submitter || $('#trackForm button[type=submit]'); if (btn) { btn.disabled = false; btn.style.opacity = 1; } }
  });
  function showTrErr(msg) { const el = $('#trErr'); el.textContent = msg; el.hidden = false; }

  /* admin track actions */
  $('#admTracks').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) { openTrackEditor(ed.dataset.edit); return; }
    const del = e.target.closest('[data-deletetrack]');
    if (del) {
      if (!confirm('حذف شود؟')) return;
      try { await F4F.deleteTrack(del.dataset.deletetrack); rerenderAll(); toast('ترک حذف شد', 'i-trash'); } catch (ex) { errToast(ex); }
      return;
    }
    const rs = e.target.closest('[data-restoretrack]');
    if (rs) { try { await F4F.restoreTrack(rs.dataset.restoretrack); rerenderAll(); toast('بازگردانده شد', 'i-check'); } catch (ex) { errToast(ex); } return; }
    const ar = e.target.closest('[data-audioreplace]');
    if (ar) {
      const id = ar.dataset.audioreplace;
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'audio/mpeg,audio/mp3';
      inp.addEventListener('change', async () => {
        const f = inp.files[0]; if (!f) return;
        try {
          if (!F4F.ghToken()) throw new Error('برای جایگزینی فایل، توکن انتشار لازم است');
          const t = byId(id);
          await F4F.publishTrack({ track: Object.assign({}, t, { id }), audioFile: f, coverFile: null });
          toast('فایل صوتی به‌روزرسانی شد', 'i-wave');
          rerenderAll();
        } catch (ex) { errToast(ex); }
      });
      inp.click();
    }
  });
  $('#admUsers').addEventListener('click', async (e) => {
    const r = e.target.closest('[data-role]');
    if (r) {
      try { await F4F.setUserRole(r.dataset.role, r.dataset.value); renderAdminUsers(); toast('نقش کاربر تغییر کرد', 'i-crown'); }
      catch (ex) { errToast(ex); }
    }
    const b = e.target.closest('[data-ban]');
    if (b) {
      try { await F4F.banUser(b.dataset.ban, b.dataset.value === '1'); renderAdminUsers(); toast('وضعیت کاربر تغییر کرد', 'i-ban'); }
      catch (ex) { errToast(ex); }
    }
  });
  document.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-delcm]');
    if (!del || !adminModal.classList.contains('open')) { if (del && !F4F.isAdmin()) return; }
  }, true);
  $('#admComments').addEventListener('click', async (e) => {
    const d = e.target.closest('[data-delcm]');
    if (!d) return;
    if (!confirm('نظر حذف شود؟')) return;
    try { await F4F.deleteComment(d.dataset.delcm); renderAdminComments(); renderComments(); toast('حذف شد', 'i-trash'); }
    catch (ex) { errToast(ex); }
  });

  /* publish tab */
  $('#saveToken').addEventListener('click', () => {
    F4F.setGhToken($('#ghToken').value);
    F4F.ls.set('ghRepo', $('#ghRepo').value.trim());
    F4F.ls.set('ghBranch', $('#ghBranch').value.trim());
    $('#pubState').textContent = 'ذخیره شد ✓';
    toast('توکن انتشار ذخیره شد', 'i-check');
  });
  $('#testToken').addEventListener('click', async () => {
    const st = $('#pubState'); st.textContent = 'در حال تست…';
    try {
      const t = F4F.ghToken();
      if (!t) throw new Error('توکن خالی است');
      const r = await fetch(`https://api.github.com/repos/${$('#ghRepo').value.trim() || F4F.CFG.repo}`, { headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' } });
      if (!r.ok) throw new Error('دسترسی به مخزن ندارد (' + r.status + ')');
      st.textContent = 'اتصال سالم است ✓'; st.style.color = 'var(--acc)';
    } catch (e) { st.textContent = e.message; st.style.color = 'var(--ok-red, #ff6a6a)'; }
  });

  /* publish content + DB wiring */
  const pubBtn = document.getElementById('publishContent');
  if (pubBtn) pubBtn.addEventListener('click', async () => {
    try {
      await F4F.publishContent();
      toast('تغییرات ترک‌ها روی سایت منتشر شد', 'i-cloud');
    } catch (e) { errToast(e); }
  });
  const saveDbBtn = document.getElementById('saveDb');
  if (saveDbBtn) saveDbBtn.addEventListener('click', async () => {
    const url = $('#sbUrl').value.trim().replace(/\/$/, '');
    const key = $('#sbKey').value.trim();
    const st = $('#dbState');
    if (!/^https:\/\//.test(url) || key.length < 20) { st.textContent = 'آدرس یا کلید معتبر نیست'; st.style.color = '#ff8484'; return; }
    try {
      st.textContent = 'در حال تست اتصال…';
      const r = await fetch(`${url}/rest/v1/f4f_state?id=eq.1&select=id`, { headers: { apikey: key, Authorization: 'Bearer ' + key } });
      if (!r.ok) throw new Error('اتصال برقرار نشد (' + r.status + ') — جدول یا کلید را بررسی کن');
      await F4F.publishContent({ db: { url, anonKey: key } });
      st.textContent = 'ذخیره و منتشر شد ✓ — بعد از چند لحظه سایت را رفرش کن';
      st.style.color = 'var(--acc)';
      toast('دیتابیس وصل شد — سایت را رفرش کن', 'i-check', 5000);
    } catch (e) { st.textContent = e.message; st.style.color = '#ff8484'; }
  });

  /* ---------- rerender everything after data change ---------- */
  function rerenderAll() {
    renderTicker(); renderCards(); renderFilters(); renderTracks(); renderPack(); renderComments();
    renderAdminTracks(); renderAdminUsers(); renderAdminComments(); renderAdminStats();
    updateStats();
    if (state.cur) {
      const t = byId(state.cur.id);
      if (!t) { audio.pause(); dock.classList.remove('up'); state.cur = null; }
      else state.cur = t;
    }
    if (drawer.classList.contains('open') && state.drTrack) { const t = byId(state.drTrack.id); if (t) openDrawer(t.id, {}); }
  }

  /* ---------- F4F events ---------- */
  document.addEventListener('f4f:change', (e) => {
    const kind = e.detail && e.detail.kind;
    if (kind === 'downloads') { renderPack(); renderTracks(); updateStats(); }
    else if (kind === 'likes') { renderTracks(); syncPlayingUI(); }
    else if (kind === 'tracks' || kind === 'core' || kind === 'refresh') rerenderAll();
    else { renderTicksLight(); }
  });
  function renderTicksLight() { renderTracks(); renderPack(); updateStats(); }
  document.addEventListener('f4f:comments', () => { renderComments(); renderDrawerComments(); renderTracks(); updateStats(); });
  document.addEventListener('f4f:auth', () => { renderAuthUI(); renderComments(); renderTracks(); });
  document.addEventListener('f4f:ready', () => {
    rerenderAll();
    if (!F4F.state.online) toast('حالت آفلاین — اتصال به سرور برقرار نشد', 'i-ban', 5000);
  });

  /* ---------- keyboard ---------- */
  addEventListener('keydown', (e) => {
    if (e.target.matches('input,textarea,select')) return;
    if (e.key === 'Escape') {
      if (trackModal.classList.contains('open')) trackModal.classList.remove('open');
      else if (adminModal.classList.contains('open')) closeAdmin();
      else if (authModal.classList.contains('open')) closeAuth();
      else if (drawer.classList.contains('open')) closeDrawer();
      else if (sheet.classList.contains('open')) { sheet.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); document.body.classList.remove('lock'); }
      return;
    }
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowLeft') { if (audio.duration) audio.currentTime = clamp(audio.currentTime + 5, 0, audio.duration); }
    else if (e.key === 'ArrowRight') { if (audio.duration) audio.currentTime = clamp(audio.currentTime - 5, 0, audio.duration); }
    else if (e.key.toLowerCase() === 'n') step(1);
    else if (e.key.toLowerCase() === 'p') step(-1);
    else if (e.key.toLowerCase() === 'm') $('#dkMute').click();
  });

  /* ---------- PWA ---------- */
  let installEvt = null;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#installBtn').hidden = false; });
  $('#installBtn').addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt();
    const r = await installEvt.userChoice;
    if (r.outcome === 'accepted') { toast('Felani4F روی دستگاهت نصب شد', 'i-install'); $('#installBtn').hidden = true; }
    installEvt = null;
  });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  /* ---------- boot ---------- */
  async function boot() {
    onScroll(); pinSetup(); revealAll();
    try {
      await F4F.load();
    } catch (e) { /* offline */ }
    renderTicker(); renderCards(); renderFilters(); renderTracks(); renderPack();
    renderComments(); renderAuthUI(); updateStats();
    $('#cmTrack').innerHTML = allTracks().map((t) => `<option value="${t.id}">${esc(t.fa)} — ${esc(t.en)}</option>`).join('');
    if (state.cur) registerWave($('#dkWave'), state.cur);
    onScroll(); pinSetup(); setTimeout(pinSetup, 400);
    finishLoad();
    if (F4F.MODE === 'local') {
      const wrap = document.querySelector('#comments .cm-wrap');
      if (wrap && !document.getElementById('modeNote')) {
        const n = document.createElement('div');
        n.id = 'modeNote';
        n.className = 'mode-note';
        n.innerHTML = '<svg><use href="#i-lock"/></svg><div><b>حالت محلی</b><span>حساب‌ها و نظرها الان فقط روی همین مرورگر ذخیره می‌شوند. مدیر سایت می‌تواند از پنل، دیتابیس مشترک (Supabase) را وصل کند تا همه نظرهای همدیگر را ببینند.</span></div>';
        wrap.parentElement.insertBefore(n, wrap);
      }
    }
    if (F4F.MODE === 'shared') {
      const st = document.getElementById('dbState'); if (st) { st.textContent = 'دیتابیس متصل است ✓'; st.style.color = 'var(--acc)'; }
    }
    if (location.hash === '#admin') setTimeout(() => { if (F4F.isAdmin()) openAdmin(); else openAuth('login'); }, 700);
    if (location.hash === '#comments') { /* fine */ }
    try { const q = new URLSearchParams(location.search).get('q'); if (q) { state.q = q; renderFilters(); renderTracks(); } } catch (e) {}
  }
  boot();
  setTimeout(finishLoad, 6000);
  addEventListener('orientationchange', () => setTimeout(pinSetup, 300));
  addEventListener('resize', () => redrawWaves());
})();
