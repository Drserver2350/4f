/* ==========================================================
   4F — app.js
   player · waveforms · comments · motion · admin (local)
   ========================================================== */
(() => {
  'use strict';

  /* ---------- utils ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const FA = '۰۱۲۳۴۵۶۷۸۹';
  const fa = (n) => String(n).replace(/\d/g, (d) => FA[+d]);
  const fmt = (sec) => {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  };
  const fmtFa = (sec) => fa(fmt(sec));
  const nf = (n) => fa(Number(n).toLocaleString('en-US'));
  const rel = (at) => {
    const d = (Date.now() - at) / 1000;
    if (d < 90) return 'همین حالا';
    if (d < 3600) return fa(Math.floor(d / 60)) + ' دقیقه پیش';
    if (d < 86400) return fa(Math.floor(d / 3600)) + ' ساعت پیش';
    if (d < 604800) return fa(Math.floor(d / 86400)) + ' روز پیش';
    return fa(Math.floor(d / 604800)) + ' هفته پیش';
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('4f.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('4f.' + k, JSON.stringify(v)); } catch (e) {} },
  };
  const byId = (id) => TRACKS.find((t) => t.id === id);
  const idxOf = (id) => TRACKS.findIndex((t) => t.id === id);

  /* ---------- state ---------- */
  const state = {
    cur: null,
    playing: false,
    filter: 'all',
    q: '',
    rate: 5,
    drTrack: null,
    muted: false,
    vol: store.get('vol', 0.9),
  };
  const likes = store.get('likes', {});
  const dls = store.get('dls', {});

  /* ---------- icons ---------- */
  const ic = (id, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

  /* ---------- comments store ---------- */
  const SEED = [
    { track: 'orbit-zero', name: 'سارا م.', rating: 5, text: 'مدار صفر رو تو مسیر کار گوش دادم، سه بار پشت سر هم. اون بخش بیس و آرپ آخرش واقعاً دیوانه‌کننده‌ست.', at: Date.now() - 1000 * 60 * 60 * 26 },
    { track: 'neon-night', name: 'امیرحسین', rating: 5, text: 'شب نئون دقیقاً همون حال‌وهواییه که دنبالش بودم؛ خش وینیل و پیانوی خواب‌آلودش عالیه.', at: Date.now() - 1000 * 60 * 60 * 51 },
    { track: 'glass', name: 'الهام', rating: 5, text: 'شیشه برای مدیتیشن قبل خواب فوق‌العاده‌ست. کاش نسخه‌ی طولانی‌تر هم بذارید.', at: Date.now() - 1000 * 60 * 60 * 74 },
    { track: 'circuit', name: 'پویا', rating: 4, text: 'مدار (Circuit) انرژی زیادی داره؛ برای دویدن عالیه. کاش نسخه‌ی لایو هم داشته باشید.', at: Date.now() - 1000 * 60 * 60 * 96 },
    { track: 'dusk', name: 'کیان', rating: 4, text: 'غروب رو تو جاده گذاشتم؛ حس رانندگی شبانه می‌ده. دم شما گرم.', at: Date.now() - 1000 * 60 * 60 * 120 },
    { track: 'orbit-zero', name: 'نگار', rating: 5, text: 'کیفیت میکس تمیزه. با هدفون گوش دادم، پن‌ها خیلی خوب چیده شدن. دانلود هم سریع بود.', at: Date.now() - 1000 * 60 * 60 * 150 },
    { track: 'neon-night', name: 'رها', rating: 5, text: 'سایت و پلیرش خیلی روونه. حس می‌کنی داری یه گالری موسیقی واقعی رو می‌بینی، نه یه صفحه‌ی ساده.', at: Date.now() - 1000 * 60 * 60 * 190 },
  ].map((c, i) => ({ id: 'seed' + i, ...c }));

  let comments = store.get('comments', null);
  if (!Array.isArray(comments)) { comments = SEED.slice(); store.set('comments', comments); }
  const saveComments = () => store.set('comments', comments);
  const trackComments = (id) => comments.filter((c) => c.track === id).sort((a, b) => b.at - a.at);

  /* ---------- toasts ---------- */
  const toasts = $('#toasts');
  function toast(msg, ico = 'i-check') {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = ic(ico) + '<span></span>';
    t.lastChild.textContent = msg;
    toasts.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 380); }, 2900);
  }

  /* ---------- preloader ---------- */
  const pre = $('#preload'), plBar = $('#plBar'), plNum = $('#plNum');
  let prog = 0, done = false;
  const tick = setInterval(() => {
    prog = Math.min(96, prog + Math.random() * 17);
    plBar.style.width = prog + '%';
    plNum.textContent = Math.round(prog) + '%';
  }, 100);
  function finishLoad() {
    if (done) return; done = true;
    clearInterval(tick);
    plBar.style.width = '100%'; plNum.textContent = '100%';
    setTimeout(() => {
      pre.classList.add('done');
      document.body.classList.remove('lock');
      document.body.classList.add('loaded');
      revealAll();
      setTimeout(() => pre.remove(), 1400);
    }, 320);
  }
  document.body.classList.add('lock');
  window.addEventListener('load', () => setTimeout(finishLoad, 420));
  setTimeout(finishLoad, 3200);

  /* ---------- reveal on scroll ---------- */
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  const watchReveal = () => $$('.rv:not(.in)').forEach((el) => io.observe(el));
  function revealAll() { setTimeout(watchReveal, 60); }

  /* ---------- header ---------- */
  const head = $('#head'), scrollProg = $('#scrollProg'), cursor = $('#cursor');
  let scrollY = window.scrollY;
  function onScroll() {
    scrollY = window.scrollY;
    head.classList.toggle('scrolled', scrollY > 40);
    const h = document.documentElement.scrollHeight - innerHeight;
    scrollProg.style.width = (h > 0 ? clamp(scrollY / h, 0, 1) * 100 : 0) + '%';
    pinScroll();
    parallax();
  }
  addEventListener('scroll', onScroll, { passive: true });

  /* active nav */
  const navLinks = $$('.nav a');
  const secIO = new IntersectionObserver((es) => {
    es.forEach((e) => {
      if (e.isIntersecting) {
        navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
      }
    });
  }, { rootMargin: '-42% 0px -52% 0px' });
  ['top', 'works', 'library', 'about', 'comments', 'pack'].forEach((id) => { const el = document.getElementById(id); if (el) secIO.observe(el); });

  /* mobile sheet */
  const sheet = $('#sheet'), burger = $('#burger');
  burger.addEventListener('click', () => {
    const open = sheet.classList.toggle('open');
    burger.setAttribute('aria-expanded', open);
    document.body.classList.toggle('lock', open);
  });
  $$('.sheet a').forEach((a) => a.addEventListener('click', () => {
    sheet.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); document.body.classList.remove('lock');
  }));

  /* ---------- custom cursor ---------- */
  if (matchMedia('(hover:hover) and (pointer:fine)').matches) {
    let mx = innerWidth / 2, my = innerHeight / 2, cx = mx, cy = my, seen = false;
    addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      if (!seen) { seen = true; cursor.classList.add('on'); }
      const t = e.target.closest('a,button,canvas,.wcard,.tr,[data-cursor]');
      cursor.classList.toggle('big', !!t && !!t.closest('.wcard'));
      cursor.dataset.label = t && t.closest('.wcard') ? 'باز کن' : '';
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
  addEventListener('mousemove', (e) => {
    pmx = (e.clientX / innerWidth - 0.5); pmy = (e.clientY / innerHeight - 0.5);
  }, { passive: true });
  function parallax() {
    if (innerWidth < 980) return;
    if (scrollY > innerHeight) return;
    covers.forEach((c, i) => {
      const d = (i + 1) * 10;
      c.style.translate = `${-pmx * d}px ${-pmy * d + scrollY * 0.05 * (i + 1)}px`;
    });
  }

  /* ---------- ticker ---------- */
  const ticker = $('#ticker');
  const tickItem = (t) =>
    `<span class="tk-i"><b>${esc(t.fa)}</b><span class="dt"></span>${esc(t.en)}<span class="st">${esc(t.genre)}</span><span class="dt"></span><span class="en">${t.bpm} BPM</span><span class="dt"></span>دانلود</span>`;
  ticker.innerHTML = TRACKS.map(tickItem).join('') + TRACKS.map(tickItem).join('');

  /* ---------- cards ---------- */
  const haul = $('#haul');
  haul.innerHTML = TRACKS.map((t) => `
    <article class="wcard" data-open="${t.id}" data-cursor="باز کن" style="--c:${t.c}" role="button" tabindex="0" aria-label="باز کردن ${esc(t.fa)}">
      <div class="im">
        <img src="assets/img/${t.id}.jpg" alt="کاور ${esc(t.fa)}" loading="lazy" width="420" height="420">
        <span class="tag-on en">ORIGINAL</span>
        <span class="num en">${t.num} / 05</span>
        <span class="pl" data-play="${t.id}" role="button" tabindex="0" aria-label="پخش ${esc(t.fa)}">${ic('i-play')}</span>
      </div>
      <div class="bd">
        <h3>${esc(t.fa)} <span class="en">${esc(t.en)}</span></h3>
        <div class="mt"><span>${esc(t.genre)}</span><i></i><span>${t.bpm} BPM</span><i></i><em>${fmtFa(t.dur)}</em></div>
      </div>
      <div class="bar"><b data-bar="${t.id}"></b></div>
    </article>`).join('');

  /* ---------- horizontal pin ---------- */
  const works = $('#works'), pin = $('#pin');
  let overflow = 0;
  function pinSetup() {
    const desktop = innerWidth > 820;
    pin.style.position = desktop ? 'sticky' : '';
    pin.style.top = desktop ? '0' : '';
    pin.style.height = desktop ? '100svh' : '';
    pin.style.display = desktop ? 'flex' : '';
    pin.style.paddingBlock = desktop ? '86px 104px' : '';
    pin.style.alignItems = desktop ? 'center' : '';
    haul.style.transform = '';
    if (desktop) {
      overflow = Math.max(0, haul.scrollWidth - innerWidth);
      // enough scroll room to reveal all cards, but never a mostly-empty stage
      works.style.height = Math.min(innerHeight + overflow + 120, Math.round(innerHeight * 1.72)) + 'px';
    } else {
      works.style.height = '';
      overflow = 0;
    }
    pinScroll();
  }
  function pinScroll() {
    if (innerWidth <= 820 || !overflow) return;
    const top = works.getBoundingClientRect().top;
    const total = works.offsetHeight - innerHeight;
    const p = clamp(-top / total, 0, 1);
    haul.style.transform = `translate3d(${(p * overflow).toFixed(1)}px,0,0)`;
  }
  addEventListener('resize', pinSetup);
  setTimeout(pinSetup, 60);
  window.addEventListener('load', pinSetup);

  /* ---------- waveforms ---------- */
  const waves = [];
  function registerWave(canvas, track) {
    if (!canvas) return;
    const rec = { canvas, track, ctx: canvas.getContext('2d') };
    waves.push(rec);
    drawWave(rec, 0);
    return rec;
  }
  function drawWave(rec, progress) {
    const { canvas } = rec;
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
    const peaks = rec.track.peaks;
    const n = peaks.length;
    const gap = w < 220 ? 1 : 2;
    const bw = Math.max(1, (w - gap * (n - 1)) / n);
    const color = rec.track.c;
    for (let i = 0; i < n; i++) {
      const x = i * (bw + gap);
      const amp = Math.max(2, peaks[i] * (h - 4));
      const y = (h - amp) / 2;
      const played = i / n <= progress;
      ctx.fillStyle = played ? color : 'rgba(255,255,255,.15)';
      ctx.globalAlpha = played ? 0.95 : 0.75;
      const r = Math.min(bw / 2, 2);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, bw, amp, r); else ctx.rect(x, y, bw, amp);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function redrawWaves() {
    const p = state.cur && audio.duration ? audio.currentTime / audio.duration : 0;
    waves.forEach((r) => {
      if (r.track.id === (state.cur && state.cur.id)) drawWave(r, p);
    });
    $$('[data-bar]').forEach((b) => {
      b.style.width = state.cur && b.dataset.bar === state.cur.id ? (p * 100) + '%' : '0%';
    });
  }

  /* ---------- render library ---------- */
  const genres = ['all', ...new Set(TRACKS.map((t) => t.genre))];
  const filters = $('#filters');
  filters.innerHTML = genres.map((g) =>
    `<button class="chip${g === 'all' ? ' on' : ''}" data-f="${g}" role="tab" aria-selected="${g === 'all'}">${g === 'all' ? 'همه' : esc(g)}</button>`
  ).join('') + `<label class="field" style="margin-inline-start:auto;min-width:190px">
      <span class="sr">جست‌وجو</span>
      <span style="position:relative;display:block">
        <input class="input" id="q" placeholder="جست‌وجوی ترک…" style="padding-inline-start:36px">
        <span style="position:absolute;inset-inline-start:12px;top:50%;translate:0 -50%;color:var(--dim)">${ic('i-search')}</span>
      </span>
    </label>`;

  const tracksEl = $('#tracks');
  function likeCount(t) { return t.likes + (likes[t.id] ? 1 : 0); }
  function dlCount(t) { return t.dls + (dls[t.id] || 0); }
  function visibleTracks() {
    return TRACKS.filter((t) => (state.filter === 'all' || t.genre === state.filter) &&
      (!state.q || (t.fa + ' ' + t.en + ' ' + t.genre + ' ' + t.tags.join(' ')).toLowerCase().includes(state.q.toLowerCase())));
  }
  function renderTracks() {
    const list = visibleTracks();
    if (!list.length) { tracksEl.innerHTML = `<div class="tr-empty">ترکی با این فیلتر پیدا نشد.</div>`; return; }
    tracksEl.innerHTML = list.map((t) => `
      <div class="tr" data-open="${t.id}" data-id="${t.id}" style="--c:${t.c}" tabindex="0" role="button" aria-label="${esc(t.fa)}">
        <div class="ix">
          <span class="en">${t.num}</span>
          <span class="eq"><i></i><i></i><i></i></span>
          ${ic('i-play')}
        </div>
        <div class="th" data-play="${t.id}" title="پخش ${esc(t.fa)}"><img src="assets/img/${t.id}-sm.jpg" alt="" width="56" height="56" loading="lazy"><span class="pp">${ic('i-play')}</span></div>
        <div class="t-name">
          <b>${esc(t.fa)} <span class="fa-lat en">${esc(t.en)}</span></b>
          <small>${esc(t.genre)} <i></i> <span class="en">${t.bpm} BPM</span> <i></i> ${t.year}</small>
        </div>
        <canvas class="wave" data-wave="${t.id}" aria-hidden="true"></canvas>
        <div class="dur en">${fmt(t.dur)}</div>
        <div class="acts">
          <button class="mini like${likes[t.id] ? ' liked' : ''}" data-like="${t.id}" aria-label="پسندیدن" aria-pressed="${!!likes[t.id]}">${ic(likes[t.id] ? 'i-heart-f' : 'i-heart')}<span class="cnt">${nf(likeCount(t))}</span></button>
          <button class="mini cm" data-cm="${t.id}" aria-label="نظرها">${ic('i-comment')}</button>
          <button class="mini dl" data-dl="${t.id}" aria-label="دانلود">${ic('i-download')}</button>
        </div>
      </div>`).join('');

    for (let i = waves.length - 1; i >= 0; i--) {
      const c = waves[i].canvas;
      if (c.classList.contains('wave') && !c.isConnected) waves.splice(i, 1);
    }
    $$('canvas[data-wave]').forEach((c) => registerWave(c, byId(c.dataset.wave)));
    syncPlayingUI();
  }

  const durSum = TRACKS.reduce((a, t) => a + t.dur, 0);
  $('#libCount').textContent = `${fa(TRACKS.length)} ترک · مجموع ${fa(Math.floor(durSum / 60))} دقیقه و ${fa(Math.round(durSum % 60))} ثانیه`;
  $('#statDur').textContent = fmtFa(durSum);

  filters.addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    state.filter = b.dataset.f;
    $$('.chip', filters).forEach((c) => { c.classList.toggle('on', c === b); c.setAttribute('aria-selected', c === b); });
    renderTracks();
  });
  filters.addEventListener('input', (e) => {
    if (e.target.id === 'q') { state.q = e.target.value.trim(); renderTracks(); }
  });
  $('#searchBtn').addEventListener('click', () => {
    document.getElementById('library').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => { const q = $('#q'); if (q) { q.focus(); } }, 700);
  });

  /* ---------- likes / downloads ---------- */
  function toggleLike(id) {
    likes[id] = !likes[id];
    store.set('likes', likes);
    const t = byId(id);
    $$(`[data-like="${id}"]`).forEach((b) => {
      b.classList.toggle('liked', !!likes[id]);
      b.setAttribute('aria-pressed', !!likes[id]);
      b.innerHTML = ic(likes[id] ? 'i-heart-f' : 'i-heart') + `<span class="cnt">${nf(likeCount(t))}</span>`;
    });
    syncDockMeta();
    if (likes[id]) toast('به ترک‌های موردعلاقه‌ات اضافه شد', 'i-heart-f');
  }
  function download(id) {
    const t = byId(id);
    const a = document.createElement('a');
    a.href = `assets/audio/${id}.mp3`;
    a.download = `4F - ${t.en}.mp3`;
    document.body.appendChild(a); a.click(); a.remove();
    dls[id] = (dls[id] || 0) + 1;
    store.set('dls', dls);
    updateStats();
    toast(`«${t.fa}» در حال دانلود است`, 'i-download');
  }
  function downloadAll() {
    toast('پک کامل ۴F در حال دانلود است — ۵ فایل', 'i-download');
    TRACKS.forEach((t, i) => setTimeout(() => {
      const a = document.createElement('a');
      a.href = `assets/audio/${t.id}.mp3`;
      a.download = `4F - ${t.num} - ${t.en}.mp3`;
      document.body.appendChild(a); a.click(); a.remove();
      dls[t.id] = (dls[t.id] || 0) + 1;
      store.set('dls', dls); updateStats();
    }, 700 * i));
  }

  /* ---------- stats ---------- */
  function updateStats() {
    const total = TRACKS.reduce((a, t) => a + dlCount(t), 0);
    $('#statDl').innerHTML = nf(total) + '<i>+</i>';
    $('#statTracks').innerHTML = fa(TRACKS.length) + '<i>TRACKS</i>';
    const cs = comments.length;
    $('#statCm').textContent = nf(cs);
  }

  /* ---------- audio player ---------- */
  const audio = $('#audio');
  const dock = $('#dock');
  audio.volume = state.vol;

  function loadTrack(id, autoplay = true) {
    const t = byId(id);
    if (!t) return;
    const same = state.cur && state.cur.id === id;
    if (!same) {
      state.cur = t;
      audio.src = `assets/audio/${id}.mp3`;
      $('#dkCover').src = `assets/img/${id}-sm.jpg`;
      $('#dkTitle').textContent = t.fa + ' — ' + t.en;
      $('#dkSub').textContent = t.genre;
      $('#dkDur').textContent = fmt(t.dur);
      $('#dkCur').textContent = '0:00';
      syncDockMeta();
      dock.classList.add('up');
      syncPlayingUI();
      const dr = $('#drawer');
      if (dr.classList.contains('open') && state.drTrack && state.drTrack.id !== id) openDrawer(id, false);
    }
    if (autoplay) {
      audio.play().catch(() => {
        state.playing = false; syncPlayingUI();
      });
    }
  }
  function syncDockMeta() {
    if (!state.cur) return;
    const t = state.cur;
    const on = !!likes[t.id];
    const b = $('#dkLike');
    b.classList.toggle('liked', on);
    b.innerHTML = ic(on ? 'i-heart-f' : 'i-heart');
    const drl = $('#drLike');
    if (drl) drl.classList.toggle('liked', on);
  }
  function syncPlayingUI() {
    const id = state.cur && state.cur.id;
    dock.classList.toggle('playing', !!(state.playing && id));
    const btn = $('#dkPlay');
    btn.innerHTML = ic(state.playing ? 'i-pause' : 'i-play');
    $$('.tr').forEach((r) => r.classList.toggle('playing', r.dataset.id === id && state.playing));
    $$('.wcard').forEach((c) => {
      c.classList.toggle('playing', c.dataset.open === id && state.playing);
      const pl = c.querySelector('.pl');
      if (pl) pl.innerHTML = ic(c.dataset.open === id && state.playing ? 'i-pause' : 'i-play');
    });
    $$('[data-play]').forEach(() => {});
    const hp = $('#heroPlay');
    if (hp) hp.querySelector('use').setAttribute('href', state.playing && id ? '#i-pause' : '#i-play');
    const dp = $('#drPlay');
    if (dp) dp.innerHTML = ic(state.playing && id && state.drTrack && id === state.drTrack.id ? 'i-pause' : 'i-play') + (state.playing && id && state.drTrack && id === state.drTrack.id ? ' توقف' : ' پخش');
    redrawWaves();
    updateMediaSession();
  }
  function togglePlay() {
    if (!state.cur) { loadTrack(TRACKS[0].id, true); return; }
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  }
  function step(dir) {
    const list = TRACKS;
    let i = state.cur ? idxOf(state.cur.id) : 0;
    i = (i + dir + list.length) % list.length;
    loadTrack(list[i].id, true);
  }
  audio.addEventListener('play', () => { state.playing = true; syncPlayingUI(); });
  audio.addEventListener('pause', () => { state.playing = false; syncPlayingUI(); });
  audio.addEventListener('timeupdate', () => {
    const p = audio.duration ? audio.currentTime / audio.duration : 0;
    $('#dkCur').textContent = fmt(audio.currentTime);
    const dr = $('#drawer');
    if (dr.classList.contains('open')) {
      const prog = dr.querySelector('.dr-prog');
      if (prog) prog.textContent = fmtFa(audio.currentTime) + ' / ' + fmtFa(audio.duration || 0);
    }
    redrawWaves();
    updateProgressBars(p);
  });
  audio.addEventListener('loadedmetadata', () => {
    $('#dkDur').textContent = fmt(audio.duration);
    redrawWaves();
  });
  audio.addEventListener('ended', () => step(1));
  audio.addEventListener('error', () => {
    if (state.cur) toast('فایل صوتی پیدا نشد — مسیر assets/audio را بررسی کن', 'i-close');
  });
  function updateProgressBars(p) {
    $$('[data-bar]').forEach((b) => { b.style.width = state.cur && b.dataset.bar === state.cur.id ? (p * 100).toFixed(1) + '%' : '0%'; });
  }
  function updateMediaSession() {
    if (!('mediaSession' in navigator) || !state.cur) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: state.cur.fa + ' — ' + state.cur.en,
        artist: '4F',
        album: '4F · Vol.01',
        artwork: [{ src: new URL(`assets/img/${state.cur.id}.jpg`, location.href).href, sizes: '880x880', type: 'image/jpeg' }],
      });
      navigator.mediaSession.setActionHandler('play', () => audio.play());
      navigator.mediaSession.setActionHandler('pause', () => audio.pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
      navigator.mediaSession.setActionHandler('previoustrack', () => step(-1));
    } catch (e) {}
  }

  /* dock controls */
  $('#dkPlay').addEventListener('click', togglePlay);
  $('#dkPrev').addEventListener('click', () => step(-1));
  $('#dkNext').addEventListener('click', () => step(1));
  $('#dkClose').addEventListener('click', () => { audio.pause(); dock.classList.remove('up'); });
  $('#dkLike').addEventListener('click', () => state.cur && toggleLike(state.cur.id));
  $('#dkDl').addEventListener('click', () => state.cur && download(state.cur.id));
  $('#dkCm').addEventListener('click', () => state.cur && openDrawer(state.cur.id, true));
  $('#dkOpen').addEventListener('click', () => state.cur && openDrawer(state.cur.id, true));
  $('#dkMute').addEventListener('click', () => {
    state.muted = !state.muted;
    audio.muted = state.muted;
    $('#dkMute').innerHTML = ic(state.muted ? 'i-mute' : 'i-volume');
    $('#dkMute').classList.toggle('on', state.muted);
  });
  const vol = $('#dkVol');
  vol.value = state.vol;
  vol.addEventListener('input', () => {
    state.vol = +vol.value; audio.volume = state.vol; state.muted = state.vol === 0;
    audio.muted = state.muted; store.set('vol', state.vol);
    $('#dkMute').innerHTML = ic(state.muted ? 'i-mute' : 'i-volume');
  });

  /* seek on dock waveform */
  const dkWave = $('#dkWave');
  dkWave.addEventListener('click', (e) => {
    if (!state.cur || !audio.duration) return;
    const r = dkWave.getBoundingClientRect();
    const p = clamp((e.clientX - r.left) / r.width, 0, 1);
    audio.currentTime = p * audio.duration;
    redrawWaves();
  });
  /* seek on library waveform */
  tracksEl.addEventListener('click', (e) => {
    const w = e.target.closest('canvas.wave');
    if (!w) return;
    const t = byId(w.dataset.wave);
    const r = w.getBoundingClientRect();
    const p = clamp((e.clientX - r.left) / r.width, 0, 1);
    if (!state.cur || state.cur.id !== t.id) { loadTrack(t.id, true); setTimeout(() => { if (audio.duration) audio.currentTime = p * audio.duration; }, 400); }
    else if (audio.duration) { audio.currentTime = p * audio.duration; }
    e.stopPropagation();
  });

  /* hero play / cards */
  $('#heroPlay').addEventListener('click', () => { if (!state.cur) loadTrack(TRACKS[0].id, true); else togglePlay(); });
  document.addEventListener('click', (e) => {
    const pl = e.target.closest('[data-play]');
    if (pl) {
      e.stopPropagation();
      const id = pl.dataset.play;
      if (state.cur && state.cur.id === id) togglePlay(); else loadTrack(id, true);
      return;
    }
    const open = e.target.closest('[data-open]');
    if (open) { openDrawer(open.dataset.open, false); return; }
    const like = e.target.closest('[data-like]');
    if (like) { e.stopPropagation(); toggleLike(like.dataset.like); return; }
    const cm = e.target.closest('[data-cm]');
    if (cm) { e.stopPropagation(); openDrawer(cm.dataset.cm, true); return; }
    const dl = e.target.closest('[data-dl]');
    if (dl) { e.stopPropagation(); download(dl.dataset.dl); return; }
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input,textarea,select')) return;
    if (e.key === 'Enter' || e.key === ' ') {
      const card = e.target.closest('[data-open],[data-play]');
      if (card) { e.preventDefault(); e.target.click(); }
    }
  });

  /* ---------- drawer ---------- */
  const drawer = $('#drawer'), scrim = $('#scrim');
  function openDrawer(id, focusComments) {
    const t = byId(id);
    if (!t) return;
    state.drTrack = t;
    $('#drImg').src = `assets/img/${id}.jpg`;
    $('#drTitle').textContent = t.fa;
    $('#drEn').textContent = t.en + ' · 4F';
    $('#drTag').textContent = 'ORIGINAL · VOL.01';
    $('#drGenre').textContent = t.genre;
    $('#drBpm').textContent = t.bpm + ' BPM';
    $('#drKey').textContent = t.key;
    $('#drDur').textContent = fmt(t.dur);
    $('#drDesc').textContent = t.desc;
    const likeBtn = $('#drLike');
    likeBtn.classList.toggle('liked', !!likes[t.id]);
    likeBtn.innerHTML = ic(likes[t.id] ? 'i-heart-f' : 'i-heart') + ' پسندیدن';
    $('#drPlay').innerHTML = ic(state.playing && state.cur && state.cur.id === id ? 'i-pause' : 'i-play') + (state.playing && state.cur && state.cur.id === id ? ' توقف' : ' پخش');
    const w = $('#drWave');
    const old = waves.find((r) => r.canvas === w);
    if (old) waves.splice(waves.indexOf(old), 1);
    registerWave(w, t);
    renderDrawerComments();
    drawer.scrollTop = 0;
    drawer.classList.add('open');
    scrim.classList.add('open');
    document.body.classList.add('lock');
    setTimeout(() => drawWave(waves.find((r) => r.canvas === w), 0), 60);
    if (focusComments) setTimeout(() => $('#drCmText').focus(), 600);
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    scrim.classList.remove('open');
    document.body.classList.remove('lock');
  }
  $('#drClose').addEventListener('click', closeDrawer);
  scrim.addEventListener('click', () => { closeDrawer(); closeAdmin(); });
  $('#drPlay').addEventListener('click', () => {
    const id = state.drTrack && state.drTrack.id;
    if (!id) return;
    if (state.cur && state.cur.id === id) togglePlay(); else loadTrack(id, true);
  });
  $('#drDl').addEventListener('click', () => state.drTrack && download(state.drTrack.id));
  $('#drLike').addEventListener('click', () => {
    if (!state.drTrack) return;
    toggleLike(state.drTrack.id);
    const on = !!likes[state.drTrack.id];
    const b = $('#drLike');
    b.classList.toggle('liked', on);
    b.innerHTML = ic(on ? 'i-heart-f' : 'i-heart') + ' پسندیدن';
  });
  $('#drShare').addEventListener('click', shareSite);

  /* ---------- shared star input ---------- */
  function starInput(container, initial = 5, onChange = () => {}) {
    let val = initial;
    const paint = () => {
      $$('button', container).forEach((b, i) => {
        b.classList.toggle('on', i < val);
        b.setAttribute('aria-checked', i + 1 === val);
        b.innerHTML = ic('i-star');
      });
    };
    container.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', fa(i + 1) + ' ستاره');
      b.addEventListener('click', () => { val = i + 1; paint(); onChange(val); });
      container.appendChild(b);
    }
    paint();
    return { get: () => val, set: (v) => { val = v; paint(); } };
  }
  const mainStars = starInput($('#starIn'), 5, (v) => { state.rate = v; });
  state.rate = 5;
  const drStars = starInput($('#drStars'), 5);

  /* ---------- render comments ---------- */
  function starsHTML(r) {
    let out = '';
    for (let i = 0; i < 5; i++) out += `<svg class="${i < r ? 'f' : ''}" aria-hidden="true"><use href="#i-star"/></svg>`;
    return out;
  }
  function commentCard(c) {
    const t = byId(c.track);
    return `<article class="cm-card">
      <div class="cm-top">
        <span class="av">${esc((c.name || '؟').trim().charAt(0))}</span>
        <div class="nm">
          <b>${esc(c.name)}</b>
          <small><span class="tk">${t ? esc(t.fa) : '—'}</span> · ${rel(c.at)}</small>
        </div>
        <span class="stars" aria-label="${fa(c.rating)} از ۵">${starsHTML(c.rating)}</span>
      </div>
      <p class="cm-body">${esc(c.text)}</p>
    </article>`;
  }
  function renderCommentSection() {
    const list = $('#cmList');
    const latest = comments.slice().sort((a, b) => b.at - a.at).slice(0, 6);
    list.innerHTML = latest.map(commentCard).join('');
    const avg = comments.length ? comments.reduce((a, c) => a + c.rating, 0) / comments.length : 0;
    $('#avgNum').textContent = comments.length ? fa(avg.toFixed(1)) : '—';
    $('#avgStars').innerHTML = starsHTML(Math.round(avg));
    $('#avgCount').textContent = nf(comments.length) + ' نظر';
    updateStats();
  }
  function renderDrawerComments() {
    if (!state.drTrack) return;
    const list = trackComments(state.drTrack.id);
    $('#drCmCount').textContent = fa(list.length) + ' نظر';
    $('#drCmList').innerHTML = list.length ? list.map(commentCard).join('')
      : `<div class="cm-empty">هنوز نظری برای این ترک ثبت نشده — اولین نفر باش.</div>`;
  }
  function addComment(trackId, name, rating, text) {
    const c = { id: 'c' + Date.now(), track: trackId, name: name.trim(), rating, text: text.trim(), at: Date.now() };
    comments.push(c);
    saveComments();
    renderCommentSection();
    if (state.drTrack && state.drTrack.id === trackId) renderDrawerComments();
    toast('نظرت ثبت شد — ممنون!', 'i-check');
    return c;
  }

  /* ---------- forms ---------- */
  const cmSel = $('#cmTrack');
  cmSel.innerHTML = TRACKS.map((t) => `<option value="${t.id}">${esc(t.fa)} — ${esc(t.en)}</option>`).join('');

  $('#cmForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#cmName').value.trim();
    const text = $('#cmText').value.trim();
    if (name.length < 2) { toast('یک نام کوتاه بنویس', 'i-comment'); $('#cmName').focus(); return; }
    if (text.length < 4) { toast('نظرت کمی کوتاه است — بیشتر بنویس', 'i-comment'); $('#cmText').focus(); return; }
    addComment(cmSel.value, name, state.rate, text);
    $('#cmText').value = '';
    mainStars.set(5); state.rate = 5;
  });
  $('#drCmForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.drTrack) return;
    const name = $('#drCmName').value.trim();
    const text = $('#drCmText').value.trim();
    if (name.length < 2) { toast('یک نام کوتاه بنویس', 'i-comment'); $('#drCmName').focus(); return; }
    if (text.length < 4) { toast('نظرت کمی کوتاه است — بیشتر بنویس', 'i-comment'); $('#drCmText').focus(); return; }
    addComment(state.drTrack.id, name, drStars.get(), text);
    $('#drCmText').value = '';
    drStars.set(5);
  });

  /* ---------- pack list & stats ---------- */
  function renderPack() {
    $('#packList').innerHTML = TRACKS.map((t) => `
      <div class="pl-row">
        <img src="assets/img/${t.id}-sm.jpg" alt="" width="30" height="30" loading="lazy">
        <div class="pn"><b>${esc(t.fa)}</b><small>${t.en}</small></div>
        <span class="pd">${t.size} MB</span>
        <button class="mini dl" data-dl="${t.id}" aria-label="دانلود ${esc(t.fa)}">${ic('i-download')}</button>
      </div>`).join('') + `<div class="pack-foot"><span><b>۵ فایل</b> · MP3 192</span><span>${TRACKS.reduce((a, t) => a + t.size, 0).toFixed(1)} MB</span></div>`;
  }

  /* ---------- share ---------- */
  async function shareSite() {
    const data = { title: (settings.name || '4F') + ' — ' + (settings.tag || 'چهار فرکانس، یک امضا'), text: 'پنج ترک مستقل؛ بشنو، دانلود کن، نظر بده.', url: location.href };
    try {
      if (navigator.share) { await navigator.share(data); return; }
      await navigator.clipboard.writeText(location.href);
      toast('لینک سایت کپی شد', 'i-check');
    } catch (e) {
      toast('لینک: ' + location.href, 'i-share');
    }
  }
  $('#shareBtn').addEventListener('click', shareSite);
  $('#dlAll').addEventListener('click', downloadAll);

  /* ---------- settings / admin ---------- */
  const DEF = { name: '4F', tag: 'چهار فرکانس، یک امضا', accent: '#c8ff3d' };
  let settings = Object.assign({}, DEF, store.get('settings', {}));
  function applySettings() {
    document.documentElement.style.setProperty('--acc', settings.accent);
    document.querySelector('.brand .b1').textContent = settings.name;
    document.title = settings.name + ' — ' + settings.tag;
    $('#setName').value = settings.name;
    $('#setTag').value = settings.tag;
    const dark = ['#ff8a50'].includes(settings.accent);
    document.querySelector('.brand svg rect').setAttribute('fill', settings.accent);
    document.querySelector('.brand svg text').setAttribute('fill', dark ? '#120b06' : '#090b07');
    $$('.sw').forEach((s) => s.classList.toggle('on', s.dataset.c.toLowerCase() === settings.accent.toLowerCase()));
  }
  const swatches = $('#swatches');
  const SW = ['#c8ff3d', '#b49bff', '#7bf7c8', '#ff8a50', '#ff5fd2'];
  swatches.innerHTML = SW.map((c) => `<button class="sw" data-c="${c}" style="background:${c}" aria-label="رنگ ${c}"></button>`).join('');
  swatches.addEventListener('click', (e) => {
    const s = e.target.closest('.sw'); if (!s) return;
    settings.accent = s.dataset.c; store.set('settings', settings); applySettings();
    document.querySelector('meta[name=theme-color]').setAttribute('content', '#070708');
    toast('رنگ سایت تغییر کرد', 'i-wand');
  });
  $('#setName').addEventListener('change', () => { settings.name = $('#setName').value.trim() || '4F'; store.set('settings', settings); applySettings(); });
  $('#setTag').addEventListener('change', () => { settings.tag = $('#setTag').value.trim() || DEF.tag; store.set('settings', settings); applySettings(); });

  const admin = $('#admin');
  function openAdmin() { admin.classList.add('open'); document.body.classList.add('lock'); }
  function closeAdmin() { admin.classList.remove('open'); if (!drawer.classList.contains('open')) document.body.classList.remove('lock'); }
  $('#adminLink').addEventListener('click', (e) => { e.preventDefault(); openAdmin(); });
  $('#adminClose').addEventListener('click', closeAdmin);
  admin.addEventListener('click', (e) => { if (e.target === admin) closeAdmin(); });
  $('#exportCm').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(comments, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '4F-comments.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast('خروجی نظرها آماده شد', 'i-download');
  });
  $('#resetCm').addEventListener('click', () => {
    if (!confirm('همه‌ی نظرها پاک شوند؟')) return;
    comments = []; saveComments(); renderCommentSection(); renderDrawerComments(); toast('نظرها پاک شدند', 'i-trash');
  });
  $('#resetAll').addEventListener('click', () => {
    if (!confirm('تنظیمات و علاقه‌مندی‌ها به حالت اولیه برگردند؟')) return;
    settings = Object.assign({}, DEF); store.set('settings', settings); applySettings();
    Object.keys(likes).forEach((k) => delete likes[k]); store.set('likes', likes);
    renderTracks(); toast('بازنشانی شد', 'i-wand');
  });

  /* ---------- PWA ---------- */
  let installEvt = null;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); installEvt = e;
    $('#installBtn').hidden = false;
  });
  $('#installBtn').addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt();
    const r = await installEvt.userChoice;
    if (r.outcome === 'accepted') { toast('۴F روی دستگاهت نصب شد', 'i-install'); $('#installBtn').hidden = true; }
    installEvt = null;
  });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  /* ---------- keyboard ---------- */
  addEventListener('keydown', (e) => {
    if (e.target.matches('input,textarea,select')) return;
    if (e.key === 'Escape') {
      if (admin.classList.contains('open')) closeAdmin();
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

  /* ---------- boot ---------- */
  function boot() {
    renderTracks();
    renderCommentSection();
    renderPack();
    applySettings();
    updateStats();
    registerWave(dkWave, TRACKS[0]);
    onScroll();
    pinSetup();
    revealAll();
    setTimeout(pinSetup, 400);
  }
  boot();
  addEventListener('resize', () => redrawWaves());
  window.addEventListener('orientationchange', () => setTimeout(pinSetup, 300));
})();
