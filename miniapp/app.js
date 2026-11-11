// Taqdimot boti — Mini App. Qoʻshimcha kutubxonasiz, oddiy JavaScript.
(() => {
  'use strict';
  const tg = window.Telegram && window.Telegram.WebApp;
  const root = document.documentElement;
  const q = new URLSearchParams(location.search);
  const DEV = q.get('dev'); // faqat mahalliy sinash (serverda DEV_AUTH=1)

  if (tg) {
    try { tg.ready(); tg.expand(); tg.setHeaderColor('secondary_bg_color'); tg.setBackgroundColor('secondary_bg_color'); } catch (e) {}
    root.setAttribute('data-tg', '1');
    const sync = () => root.setAttribute('data-scheme', tg.colorScheme === 'dark' ? 'dark' : 'light');
    sync(); try { tg.onEvent('themeChanged', sync); } catch (e) {}
  }
  if (DEV && q.get('theme') === 'dark') { // dizaynni qora rejimda koʻrish
    root.setAttribute('data-tg', '1'); root.setAttribute('data-scheme', 'dark');
    const v = { bg: '#17212b', secondary: '#0e1621', text: '#f5f5f5', hint: '#708499' };
    root.style.setProperty('--tg-theme-bg-color', v.bg); root.style.setProperty('--tg-theme-secondary-bg-color', v.secondary);
    root.style.setProperty('--tg-theme-text-color', v.text); root.style.setProperty('--tg-theme-hint-color', v.hint);
  }

  const LANGS = {
    uz: { name: 'Oʻzbekcha', sub: 'Lotin yozuvi' },
    uzc: { name: 'Ўзбекча', sub: 'Kirill yozuvi' },
    ru: { name: 'Русский', sub: 'Rus tili' },
    qq: { name: 'Qaraqalpaqsha', sub: 'Lotin yozuvi · sinov bosqichida' },
  };
  const STATUS = { processing: 'Tayyorlanmoqda', done: 'Tayyor', failed: 'Xato', waiting_receipt: 'Chek kutilmoqda', pending: 'Tekshirilmoqda', approved: 'Tasdiqlandi', rejected: 'Rad etildi' };
  const LEDGER = { topup: 'Balans toʻldirildi', charge: 'Taqdimot uchun', refund: 'Pul qaytarildi', credit: 'Balansga qoʻshildi' };
  const SUGGEST = ['Sotsiolingvistika asoslari', 'Islomning vujudga kelishi va tarqalishi', 'Grammatik kategoriya va grammatik shakl', 'Oʻzbek tili leksikologiyasi'];
  const MAIN = ['home', 'history', 'balance', 'profile'];

  const state = {
    me: null, cfg: null, screen: 'home', orders: [], ordersLoaded: false, payments: [], ledger: [], pay: null, topupAmount: 0, poll: null, tick: null,
    wiz: { step: 1, topic: '', slides: 12, lang: 'uz', color: 'green', style: 'random', lecture: '', references: '', fileName: '', manual: false },
    lastOrder: null,
    // himoyaga tayyorgarlik: orderId, data (server javobi), mode: 'list' | 'practice', practice (mashq holati)
    defense: { orderId: null, data: null, mode: 'list', practice: null },
  };
  const LEVEL = { easy: 'Oson', medium: 'Oʻrta', hard: 'Qiyin' };

  // ---------- yordamchilar ----------
  const view = document.getElementById('view');
  const tabs = document.getElementById('tabs');
  const NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    wallet: '<path d="M3 7a2 2 0 0 1 2-2h12v4"/><path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2"/><circle cx="16.5" cy="13.5" r="1"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 5-5 8-5s6.5 1 8 5"/>',
    check: '<path d="M5 12.5 10 17.5 19 7.5"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    upload: '<path d="M12 16V5"/><path d="M7.5 9.5 12 5l4.5 4.5"/><path d="M5 19h14"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
    send: '<path d="M21 3 10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
    spark: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    file: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/>',
    shield: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    camera: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    inbox: '<path d="M4 13l2-8h12l2 8"/><path d="M4 13v6h16v-6h-5l-1 2h-4l-1-2z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8"/><path d="M12 17h.01"/>',
    refresh: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
  };
  function icon(name, size = 22, sw = 1.9) {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', sw);
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name] || '';
    return s;
  }
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style') el.style.cssText = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const money = (n) => new Intl.NumberFormat('ru-RU').format(n || 0).replace(/\u00a0/g, ' ') + ' soʻm';
  const when = (ts) => { const d = new Date(ts); return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); };
  const initials = (n) => (String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('') || '?').toUpperCase();
  const colorOf = (key) => (state.cfg.colors.find((c) => c.key === key) || state.cfg.colors[0]);
  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }
  function haptic(kind) { try { if (!tg || !tg.HapticFeedback) return; if (kind === 'select') tg.HapticFeedback.selectionChanged(); else tg.HapticFeedback.notificationOccurred(kind); } catch (e) {} }

  async function api(method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (tg && tg.initData) headers.Authorization = 'tma ' + tg.initData;
    else if (DEV) headers['x-dev-user'] = DEV;
    const r = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    let j = {};
    try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw Object.assign(new Error(j.message || 'Xatolik yuz berdi'), { code: r.status, data: j });
    return j;
  }

  // slayd miniatyurasi (rang uchun)
  function thumb(key, big) {
    const c = colorOf(key);
    return h('div', { class: 'thumb' + (big ? ' big' : ''), style: `background:#${c.dark}` },
      h('i', { class: 't1' }), h('i', { class: 't2' }), h('i', { class: 'bar', style: `background:#${c.hex}` }));
  }

  // ---------- navigatsiya ----------
  function go(screen) {
    clearInterval(state.poll); clearInterval(state.tick); state.poll = state.tick = null;
    state.screen = screen;
    render();
    window.scrollTo(0, 0);
  }
  function renderTabs() {
    tabs.replaceChildren();
    tabs.classList.toggle('hide', !MAIN.includes(state.screen));
    const t = (id, label, ic) => h('button', { class: 't' + (state.screen === id ? ' on' : ''), 'aria-label': label, onclick: () => go(id) }, icon(ic, 23), h('span', {}, label));
    tabs.append(t('home', 'Bosh', 'home'), t('history', 'Tarix', 'clock'),
      h('button', { class: 'fab', 'aria-label': 'Yangi taqdimot', onclick: () => { state.wiz.step = 1; go('wizard'); } }, icon('plus', 28, 2.4)),
      t('balance', 'Balans', 'wallet'), t('profile', 'Profil', 'user'));
  }
  function render() {
    view.replaceChildren();
    view.className = ['wizard', 'success', 'defense'].includes(state.screen) ? 'flow' : '';
    view.style.animation = 'none'; void view.offsetWidth; view.style.animation = '';
    document.querySelectorAll('.foot').forEach((n) => n.remove());
    renderTabs();
    if (!state.me) return;
    ({ home: screenHome, history: screenHistory, balance: screenBalance, profile: screenProfile, wizard: screenWizard, success: screenSuccess, defense: screenDefense })[state.screen]();
    if ((state.screen === 'home' || state.screen === 'history') && state.orders.some((o) => o.status === 'processing')) startPolling();
  }

  async function refreshMe() {
    const j = await api('GET', '/api/me');
    state.me = j.user; state.cfg = j.config;
    const w = state.wiz;
    w.slides = Math.min(Math.max(w.slides, j.config.minSlides), j.config.maxSlides);
  }
  async function loadOrders() {
    const j = await api('GET', '/api/orders');
    state.orders = j.orders; state.ordersLoaded = true;
    if (state.me) state.me.balance = j.balance;
  }

  // ---------- jarayon (taraqqiyot) ----------
  function phases() {
    return ['Reja tuzilmoqda', 'Matn yozilmoqda', 'Slaydlar yigʻilmoqda'];
  }
  function progressCard(o) {
    const el = h('div', { class: 'progress', 'data-prog': o.id, 'data-created': o.createdAt, 'data-lang': o.lang });
    el.append(h('div', { class: 'row' }, thumb(o.color), h('div', { class: 'grow' }, h('div', { class: 'ttl', style: 'font-weight:650;font-size:15px' }, o.topic), h('div', { class: 'hint' }, `${o.slides} slayd · Odatda 1–3 daqiqa`))),
      h('div', { class: 'bar' }, h('b', { style: 'width:8%' })), h('div', { class: 'steps' }));
    paintProgress(el);
    return el;
  }
  function paintProgress(el) {
    const created = Number(el.dataset.created), ph = phases();
    const sec = Math.max(0, (Date.now() - created) / 1000);
    const per = 28;
    const idx = Math.min(ph.length - 1, Math.floor(sec / per));
    const pct = Math.min(94, Math.round(100 * (1 - Math.exp(-sec / (per * ph.length * 0.7)))) + 6);
    el.querySelector('.bar b').style.width = pct + '%';
    const box = el.querySelector('.steps'); box.replaceChildren();
    ph.forEach((p, i) => box.append(h('div', { class: 'step ' + (i < idx ? 'ok' : i === idx ? 'on' : '') },
      h('span', { class: 'mk' }, i < idx ? icon('check', 13, 3.2) : i === idx ? h('span', { class: 'dot-spin', style: 'color:var(--brand)' }) : null), p)));
  }
  function startPolling() {
    clearInterval(state.poll); clearInterval(state.tick);
    state.tick = setInterval(() => document.querySelectorAll('[data-prog]').forEach(paintProgress), 1000);
    state.poll = setInterval(async () => {
      const before = new Set(state.orders.filter((o) => o.status === 'processing').map((o) => o.id));
      try { await loadOrders(); } catch (e) { return; }
      if (state.screen !== 'home' && state.screen !== 'history') return;
      let changed = false;
      for (const o of state.orders) {
        if (!before.has(o.id)) continue;
        if (o.status === 'done') { haptic('success'); toast('Taqdimot tayyor! Fayllar chatga yuborildi.'); changed = true; }
        if (o.status === 'failed') { haptic('error'); toast('Xatolik chiqdi, pul qaytarildi.'); changed = true; }
      }
      if (changed || !state.orders.some((o) => o.status === 'processing')) { clearInterval(state.poll); clearInterval(state.tick); state.poll = state.tick = null; render(); }
    }, 4000);
  }

  // ---------- buyurtma qatori ----------
  function orderRow(o, withResend) {
    const badge = h('span', { class: 'badge ' + o.status }, o.status === 'processing' ? h('span', { class: 'dot-spin' }) : null, STATUS[o.status] || o.status);
    return h('div', { class: 'order' }, thumb(o.color),
      h('div', { class: 'grow' },
        h('div', { class: 'row', style: 'align-items:flex-start;gap:8px' }, h('div', { class: 'ttl grow' }, o.topic), badge),
        h('div', { class: 'meta' }, h('span', {}, `${o.slides} slayd`), h('span', {}, LANGS[o.lang] ? LANGS[o.lang].name : o.lang), styleName(o.style) ? h('span', {}, styleName(o.style)) : null, h('span', {}, money(o.price)), h('span', {}, when(o.createdAt))),
        o.error ? h('div', { class: 'hint minus', style: 'margin-top:4px' }, o.error) : null,
        withResend && o.status === 'done' ? h('div', { class: 'acts' },
          h('button', { class: 'btn ghost sm', onclick: (e) => resend(o.id, e.currentTarget) }, icon('send', 16), 'Chatga qayta yuborish'),
          h('button', { class: 'btn ghost sm', 'data-defense': o.id, onclick: () => openDefense(o.id) }, icon('shield', 16), defenseLabel(o))) : null));
  }
  function defenseLabel(o) {
    const p = state.cfg.priceDefense;
    if (o.defense === 'done') return 'Himoya savollari';
    if (o.defense === 'processing') return 'Savollar tayyorlanmoqda…';
    if (o.defense === 'failed') return 'Himoya: qayta urinish';
    return 'Himoya savollari' + (p > 0 ? ` · ${money(p)}` : '');
  }
  function styleName(key) {
    const st = state.cfg && state.cfg.styles && state.cfg.styles.find((x) => x.key === key);
    return st ? st.name : '';
  }
  async function resend(id, btn) {
    btn.disabled = true;
    try { await api('POST', `/api/orders/${id}/send`); toast('Fayllar chatga yuborildi.'); haptic('success'); }
    catch (e) { toast(e.message); haptic('error'); }
    setTimeout(() => { btn.disabled = false; }, 4000);
  }
  const emptyState = (title, text, action) => h('div', { class: 'empty' }, icon('inbox', 56, 1.4), h('b', {}, title), h('div', {}, text), action ? h('div', { style: 'margin-top:16px' }, action) : null);
  const skeletons = () => [h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' })];

  // ---------- 1. Bosh sahifa ----------
  function screenHome() {
    const me = state.me, first = (me.name || '').split(' ')[0] || 'doʻst';
    view.append(h('div', { class: 'hello' },
      h('div', {}, h('div', { class: 'hint' }, 'Salom 👋'), h('div', { class: 'name' }, first)),
      h('button', { class: 'pill pressable', 'aria-label': 'Balans', onclick: () => go('balance') }, icon('wallet', 18), money(me.balance))));
    view.append(h('div', { class: 'hero' },
      h('h2', {}, 'Yangi taqdimot'),
      h('p', {}, 'Mavzuni yozing. 1–3 daqiqada tayyor .pptx va PDF faylni chatda oling.'),
      h('button', { class: 'btn white', onclick: () => { state.wiz.step = 1; go('wizard'); } }, icon('spark', 20), 'Boshlash'),
      h('div', { class: 'chips-in' }, h('span', {}, 'Maʼruza asosida'), h('span', {}, '4 ta til'), h('span', {}, 'Titul varagʻi'))));

    const box = h('div', {});
    view.append(box);
    const draw = () => {
      box.replaceChildren();
      if (!state.ordersLoaded) { box.append(...skeletons()); return; }
      const active = state.orders.filter((o) => o.status === 'processing');
      if (active.length) box.append(h('div', { class: 'sec' }, h('h2', {}, 'Jarayonda')), ...active.map(progressCard));
      const recent = state.orders.filter((o) => o.status !== 'processing').slice(0, 3);
      box.append(h('div', { class: 'sec' }, h('h2', {}, 'Soʻnggi ishlar'), state.orders.length > 3 ? h('button', { class: 'link', onclick: () => go('history') }, 'Barchasi') : null));
      if (!recent.length && !active.length) box.append(emptyState('Hali taqdimot yoʻq', 'Birinchi taqdimotingizni yasab koʻring.'));
      else if (recent.length) box.append(h('div', { class: 'group' }, recent.map((o) => orderRow(o, false))));
      const hasDone = state.orders.some((o) => o.status === 'done');
      box.append(h('div', { class: 'sec' }, h('h2', {}, 'Qoʻshimcha')),
        h('button', { class: 'card flat teaser live pressable', id: 'defense-card', onclick: () => (hasDone ? go('history') : toast('Avval taqdimot yasang: savollar tayyor taqdimot asosida tuziladi.')) }, h('div', { class: 'ico' }, icon('shield', 22)),
          h('div', { class: 'grow' }, h('div', { style: 'font-weight:650' }, 'Himoyaga tayyorgarlik'),
            h('div', { class: 'hint' }, `Oʻqituvchi beradigan savollar, javoblar va mashq rejimi${state.cfg.priceDefense > 0 ? ` · ${money(state.cfg.priceDefense)}` : ''}`)),
          icon('chev', 20)));
    };
    draw();
    if (!state.ordersLoaded) loadOrders().then(() => { if (state.screen === 'home') { draw(); if (state.orders.some((o) => o.status === 'processing')) startPolling(); } }).catch(() => { state.ordersLoaded = true; draw(); });
  }

  // ---------- 2. Tarix ----------
  function screenHistory() {
    view.append(h('div', { class: 'title' }, 'Buyurtmalarim'), h('p', { class: 'sub' }, 'Tayyor taqdimotlarni chatga qayta yuborishingiz mumkin.'));
    const box = h('div', {});
    view.append(box);
    const draw = () => {
      box.replaceChildren();
      if (!state.ordersLoaded) { box.append(...skeletons()); return; }
      const active = state.orders.filter((o) => o.status === 'processing');
      if (active.length) box.append(...active.map(progressCard));
      const rest = state.orders.filter((o) => o.status !== 'processing');
      if (!rest.length && !active.length) box.append(emptyState('Hozircha buyurtma yoʻq', 'Birinchi taqdimotingizni yasang.', h('button', { class: 'btn sm', onclick: () => { state.wiz.step = 1; go('wizard'); } }, 'Yasash')));
      else if (rest.length) box.append(h('div', { class: 'group' }, rest.map((o) => orderRow(o, true))));
    };
    draw();
    loadOrders().then(() => { if (state.screen === 'history') { draw(); if (state.orders.some((o) => o.status === 'processing')) startPolling(); } }).catch(() => {});
  }

  // ---------- 3. Yangi taqdimot (bosqichli) ----------
  function screenWizard() {
    const w = state.wiz, c = state.cfg, me = state.me;
    const price = () => (c.flat ? c.priceDeck : w.slides * c.priceSlide);
    const close = () => go('home');
    const head = h('div', { class: 'flow-head' },
      h('button', { class: 'icon-btn', 'aria-label': w.step === 1 ? 'Yopish' : 'Orqaga', onclick: () => (w.step === 1 ? close() : (w.step--, render())) }, icon(w.step === 1 ? 'close' : 'back', 24)),
      h('div', { class: 'prog' }, [1, 2, 3].map((i) => h('i', { class: i <= w.step ? 'on' : '' }))),
      h('div', { class: 'stepno' }, `${w.step}/3`));
    view.append(head);

    const foot = h('div', { class: 'foot' }, h('div', { class: 'in' }));
    const fin = foot.firstChild;
    let nextBtn;

    if (w.step === 1) {
      view.append(h('div', { class: 'title' }, 'Mavzu va hajm'), h('p', { class: 'sub' }, 'Taqdimot nima haqida boʻlsin?'));
      const ta = h('textarea', { id: 'topic', maxlength: 300, placeholder: 'Masalan: Grammatik kategoriya va grammatik shakl', 'aria-label': 'Mavzu' }, w.topic);
      const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.max(112, ta.scrollHeight) + 'px'; };
      const sug = h('div', { class: 'chips', style: 'margin-top:10px' });
      const drawSug = () => { sug.replaceChildren(); if (w.topic.trim().length < 3) SUGGEST.forEach((s) => sug.append(h('button', { class: 'chip sug', onclick: () => { w.topic = s; ta.value = s; fit(); upd(); drawSug(); haptic('select'); } }, s))); };
      ta.addEventListener('input', () => { w.topic = ta.value; fit(); upd(); drawSug(); });
      view.append(ta, sug);
      drawSug();

      const num = h('b', {}, w.slides), cost = h('span', { style: 'font-weight:700' }, money(price()));
      const range = h('input', { type: 'range', class: 'range', min: c.minSlides, max: c.maxSlides, value: w.slides, 'aria-label': 'Slaydlar soni' });
      const presets = [8, 10, 12, 15, 20, 25].filter((n) => n >= c.minSlides && n <= c.maxSlides);
      const chipEls = presets.map((n) => h('button', { class: 'chip' + (w.slides === n ? ' on' : ''), onclick: () => { setSlides(n); haptic('select'); } }, String(n)));
      const setSlides = (n) => { w.slides = n; range.value = n; num.textContent = n; cost.textContent = money(price()); chipEls.forEach((e, i) => e.classList.toggle('on', presets[i] === n)); };
      range.addEventListener('input', () => setSlides(Number(range.value)));
      view.append(h('label', { class: 'field-l' }, 'Slaydlar soni'),
        h('div', { class: 'card flat' },
          h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-end' }, h('div', { class: 'bignum' }, num, h('span', { class: 'hint' }, 'slayd')), h('div', { style: 'text-align:right' }, h('div', { class: 'hint' }, 'Narxi'), cost)),
          range, h('div', { class: 'chips', style: 'margin-top:6px' }, chipEls),
          h('div', { class: 'hint', style: 'margin-top:10px' }, `${c.minSlides}–${c.maxSlides} slayd. Titul varagʻi, reja, xulosa va adabiyotlar ham hisobga kiradi.${c.flat ? ' Narx slayd soniga bogʻliq emas.' : ''}`)));
      nextBtn = h('button', { class: 'btn', onclick: () => { if (w.topic.trim().length < 3) { toast('Mavzuni yozing.'); haptic('error'); return; } w.step = 2; render(); window.scrollTo(0, 0); } }, 'Davom etish', icon('arrow', 20));
      var upd = () => { nextBtn.disabled = w.topic.trim().length < 3; };
      fin.append(nextBtn); upd();
      setTimeout(fit, 0);
    }

    if (w.step === 2) {
      view.append(h('div', { class: 'title' }, 'Koʻrinish'), h('p', { class: 'sub' }, 'Til, rang va koʻrinishni tanlang.'));
      view.append(h('label', { class: 'field-l', style: 'margin-top:4px' }, 'Til'));
      const list = h('div', {});
      Object.keys(LANGS).filter((l) => c.langs.includes(l)).forEach((l) => list.append(h('button', { class: 'opt pressable' + (w.lang === l ? ' on' : ''), 'aria-pressed': w.lang === l, onclick: () => { w.lang = l; haptic('select'); render(); } },
        h('div', { class: 'grow' }, h('div', { class: 'nm' }, LANGS[l].name), h('div', { class: 'hint' }, LANGS[l].sub)), h('span', { class: 'radio' }, icon('check', 14, 3.4)))));
      view.append(list);
      if (w.lang === 'qq') view.append(h('div', { class: 'hint', style: 'margin:-2px 2px 4px' }, 'Qoraqalpoq tili sinov bosqichida: topshirishdan oldin matnni albatta tekshiring.'));
      view.append(h('label', { class: 'field-l' }, 'Rang'));
      view.append(h('div', { class: 'gallery' }, c.colors.map((col) => h('button', { class: 'sw' + (w.color === col.key ? ' on' : ''), 'aria-label': col.label, 'aria-pressed': w.color === col.key, onclick: () => { w.color = col.key; haptic('select'); render(); } }, thumb(col.key, true), h('div', { class: 'lb' }, col.label)))));
      view.append(h('label', { class: 'field-l' }, 'Koʻrinish (20 xil)'));
      const sbox = h('div', { class: 'styles' });
      const pick = (key) => { w.style = key; haptic('select'); sbox.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b.dataset.key === key)); };
      const sbtn = (key, text) => h('button', { class: 'chip' + (w.style === key ? ' on' : ''), 'data-key': key, 'aria-pressed': w.style === key, onclick: () => pick(key) }, text);
      sbox.append(sbtn('random', '🎲 Tasodifiy'), ...(c.styles || []).map((st, i) => sbtn(st.key, `${i + 1}. ${st.name}`)));
      view.append(sbox, h('button', { class: 'btn ghost sm', style: 'margin-top:12px', onclick: showPreview }, icon('file', 16), 'Namunalarni koʻrish'));
      fin.append(h('button', { class: 'btn line', onclick: () => { w.step = 1; render(); } }, 'Orqaga'), h('button', { class: 'btn', onclick: () => { w.step = 3; render(); window.scrollTo(0, 0); } }, 'Davom etish', icon('arrow', 20)));
    }

    if (w.step === 3) {
      view.append(h('div', { class: 'title' }, 'Qoʻshimcha va tasdiq'), h('p', { class: 'sub' }, 'Maʼruza yuklasangiz, taqdimot shu matn asosida tuziladi.'));
      const fileIn = h('input', { type: 'file', accept: '.txt,.md,.docx,.pdf', style: 'display:none', onchange: onLectureFile });
      view.append(h('button', { class: 'upload pressable', onclick: () => fileIn.click() }, h('span', { class: 'ic' }, icon('upload', 22)),
        h('span', {}, h('b', {}, w.fileName ? w.fileName : 'Maʼruza faylini yuklash'), h('span', { class: 'hint' }, w.fileName ? `${w.lecture.length} belgi oʻqildi. Almashtirish uchun bosing` : `.txt, .docx yoki .pdf · ${Math.round(c.maxExtract / 1048576)} MB gacha`))), fileIn);
      if (w.lecture || w.manual) {
        view.append(h('label', { class: 'field-l' }, 'Maʼruza matni'), h('textarea', { id: 'lecture', placeholder: 'Matnni shu yerga qoʻying', oninput: (e) => { w.lecture = e.target.value; } }, w.lecture),
          w.fileName ? h('button', { class: 'link', onclick: () => { w.lecture = ''; w.fileName = ''; w.manual = false; render(); } }, 'Maʼruzani olib tashlash') : null);
      } else view.append(h('button', { class: 'link', style: 'margin-top:8px', onclick: () => { w.manual = true; render(); } }, 'yoki matnni qoʻlda kiritish'));
      view.append(h('label', { class: 'field-l' }, 'Adabiyotlar (ixtiyoriy)'), h('textarea', { id: 'refs', style: 'min-height:84px', placeholder: 'Boʻsh qoldirsangiz, faqat aniq mavjud, mashhur manbalar qoʻshiladi', oninput: (e) => { w.references = e.target.value; } }, w.references));

      const rem = me.balance - price(), enough = rem >= 0;
      const col = colorOf(w.color);
      view.append(h('label', { class: 'field-l' }, 'Buyurtma'),
        h('div', { class: 'card sum' },
          h('div', { class: 'r' }, h('span', {}, 'Mavzu'), h('span', {}, w.topic.length > 70 ? w.topic.slice(0, 70) + '…' : w.topic)),
          h('div', { class: 'r' }, h('span', {}, 'Hajmi'), h('span', {}, `${w.slides} slayd`)),
          h('div', { class: 'r' }, h('span', {}, 'Til'), h('span', {}, LANGS[w.lang].name)),
          h('div', { class: 'r' }, h('span', {}, 'Rang'), h('span', { class: 'row', style: 'gap:6px;justify-content:flex-end' }, h('span', { style: `width:12px;height:12px;border-radius:50%;background:#${col.hex};display:inline-block` }), col.label)),
          h('div', { class: 'r' }, h('span', {}, 'Koʻrinish'), h('span', {}, w.style === 'random' ? 'Tasodifiy' : styleName(w.style) || 'Klassik')),
          h('div', { class: 'r' }, h('span', {}, 'Maʼruza'), h('span', {}, w.lecture ? 'Bor' : 'Yoʻq')),
          h('div', { class: 'r tot' }, h('span', {}, 'Jami'), h('span', {}, money(price()))),
          h('div', { class: 'r' }, h('span', {}, 'Balansingiz'), h('span', { class: enough ? '' : 'minus' }, money(me.balance)))));
      if (!enough) view.append(h('div', { class: 'hint minus', style: 'margin:0 2px' }, `Yana ${money(-rem)} kerak.`));
      const go3 = h('button', { class: 'btn', id: 'go', onclick: () => (enough ? submitOrder(go3) : (state.topupAmount = Math.max(c.minTopup, Math.ceil(-rem / 1000) * 1000), go('balance'))) }, enough ? [icon('spark', 20), `Yasash · ${money(price())}`] : [icon('wallet', 20), 'Balansni toʻldirish']);
      fin.append(h('button', { class: 'btn line', onclick: () => { w.step = 2; render(); } }, 'Orqaga'), go3);
    }
    document.body.append(foot);
  }

  // tanlangan rangdagi 20 koʻrinish namunasi: rasm katta, barmoq bilan surib koʻriladi
  function showPreview() {
    const col = colorOf(state.wiz.color);
    const close = () => ov.remove();
    const ov = h('div', { class: 'lightbox', role: 'dialog', 'aria-label': 'Koʻrinishlar namunasi' },
      h('div', { class: 'lb-bar' }, h('span', {}, `Koʻrinishlar · ${col.label}`), h('button', { class: 'icon-btn', 'aria-label': 'Yopish', onclick: close }, icon('close', 24))),
      h('div', { class: 'lb-scroll' }, h('img', { src: `/previews/${state.wiz.color}.jpg`, alt: 'Koʻrinishlar namunasi' })));
    document.body.append(ov);
  }

  async function onLectureFile(e) {
    const w = state.wiz, file = e.target.files && e.target.files[0];
    if (!file) return;
    const maxMb = Math.round(state.cfg.maxExtract / 1048576);
    if (file.size > state.cfg.maxExtract) return toast(`Fayl ${maxMb} MB dan katta.`);
    toast('Fayl oʻqilmoqda…');
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      const j = await api('POST', '/api/extract', { name: file.name, data: btoa(bin) });
      w.lecture = j.text; w.fileName = file.name; w.manual = true;
      haptic('success'); if (j.clipped) toast('Uzun matn qisqartirildi.');
      render();
    } catch (err) { haptic('error'); toast(err.message); }
    e.target.value = '';
  }

  async function submitOrder(btn) {
    const w = state.wiz, c = state.cfg;
    btn.disabled = true; btn.replaceChildren(h('span', { class: 'dot-spin' }), 'Yuborilmoqda…');
    try {
      const r = await api('POST', '/api/orders', { topic: w.topic, slides: w.slides, lang: w.lang, color: w.color, style: w.style, lecture: w.lecture, references: w.references });
      haptic('success');
      state.lastOrder = { id: r.orderId, topic: w.topic, slides: w.slides, price: r.price };
      Object.assign(w, { step: 1, topic: '', lecture: '', references: '', fileName: '', manual: false });
      await refreshMe(); state.ordersLoaded = false;
      go('success');
    } catch (err) {
      haptic('error');
      if (err.data && err.data.error === 'balance') { state.topupAmount = Math.max(c.minTopup, Math.ceil(err.data.need / 1000) * 1000); toast(`Balans yetmaydi: yana ${money(err.data.need)} kerak.`); return go('balance'); }
      if (err.data && err.data.error === 'profile') { toast(err.message); return go('profile'); }
      toast(err.message); render();
    }
  }

  function screenSuccess() {
    const o = state.lastOrder || {};
    view.append(h('div', { class: 'success' },
      h('div', { class: 'ring' }, icon('check', 46, 3)),
      h('h1', {}, 'Buyurtma qabul qilindi'),
      h('p', { class: 'sub', style: 'max-width:300px;margin:0 auto 24px' }, `“${(o.topic || '').slice(0, 80)}” tayyorlanmoqda. Odatda 1–3 daqiqa. Tayyor boʻlgach fayllar shu bot chatiga keladi.`),
      h('div', { style: 'display:grid;gap:10px;max-width:360px;margin:0 auto' },
        h('button', { class: 'btn', onclick: () => go('history') }, 'Jarayonni koʻrish'),
        h('button', { class: 'btn line', onclick: () => go('home') }, 'Bosh sahifa'))));
  }

  // ---------- Himoyaga tayyorgarlik: oʻqituvchi savollari, javoblar va mashq ----------
  function openDefense(orderId) {
    state.defense = { orderId, data: null, mode: 'list', practice: null, error: null };
    go('defense');
  }
  function newPractice(items, only) {
    const idx = items.map((_, i) => i).filter((i) => !only || only.includes(i));
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    return { order: idx, pos: 0, shown: false, known: [], again: [] };
  }

  function screenDefense() {
    const d = state.defense, c = state.cfg;
    const order = state.orders.find((x) => x.id === d.orderId);
    view.append(h('div', { class: 'flow-head' },
      h('button', { class: 'icon-btn', 'aria-label': 'Orqaga', onclick: () => go('history') }, icon('back', 24)),
      h('div', { class: 'grow hint', style: 'font-weight:600' }, 'Himoyaga tayyorgarlik')));
    const box = h('div', { id: 'defense-box' });
    view.append(box);
    const topic = () => (order && order.topic) || (d.data && d.data.topic) || '';
    const sync = () => { if (order && d.data && d.data.status) order.defense = d.data.status; };
    const heading = () => box.append(h('div', { class: 'title' }, 'Himoyaga tayyorgarlik'), h('p', { class: 'sub' }, topic()));

    const start = async (btn) => {
      btn.disabled = true; btn.replaceChildren(h('span', { class: 'dot-spin' }), 'Yuborilmoqda…');
      try {
        await api('POST', `/api/orders/${d.orderId}/defense`);
        haptic('success');
        d.data = { status: 'processing', topic: topic() }; sync();
        await refreshMe().catch(() => {});
        draw(); poll();
      } catch (err) {
        haptic('error');
        if (err.data && err.data.error === 'balance') { state.topupAmount = Math.max(c.minTopup, Math.ceil(err.data.need / 1000) * 1000); toast(`Balans yetmaydi: yana ${money(err.data.need)} kerak.`); return go('balance'); }
        toast(err.message);
        if (err.data && (err.data.error === 'exists' || err.data.error === 'busy')) { await init(); return; }
        draw();
      }
    };

    const poll = () => {
      clearInterval(state.poll); state.poll = null;
      if (!d.data || d.data.status !== 'processing') return;
      state.poll = setInterval(async () => {
        if (state.screen !== 'defense' || state.defense !== d) return clearInterval(state.poll);
        try { d.data = await api('GET', `/api/orders/${d.orderId}/defense`); } catch (e) { return; }
        if (d.data.status === 'processing') return;
        clearInterval(state.poll); state.poll = null; sync();
        if (d.data.status === 'done') { haptic('success'); toast('Savollar tayyor!'); } else { haptic('error'); toast('Xatolik chiqdi, pul qaytarildi.'); }
        refreshMe().catch(() => {});
        d.mode = 'list'; draw();
      }, 3000);
    };

    const drawIntro = (failed) => {
      const p = c.priceDefense, me = state.me, enough = me.balance >= p;
      const feat = (ic, t, s) => h('div', { class: 'feat' }, h('span', { class: 'fi' }, icon(ic, 20)), h('div', {}, h('b', {}, t), h('div', { class: 'hint' }, s)));
      if (failed) box.append(h('div', { class: 'card flat', style: 'border-color:var(--warn)' }, h('b', {}, 'Oldingi urinish muvaffaqiyatsiz tugadi'), h('div', { class: 'hint' }, 'Pul balansingizga qaytarilgan. Qayta urinib koʻring.')));
      box.append(h('div', { class: 'card' },
        feat('help', `${c.defenseQuestions} ta savol`, 'Oʻqituvchi shu taqdimotdan soʻrashi mumkin boʻlgan savollar: oddiydan qiyiniga.'),
        feat('file', 'Tayyor javoblar', 'Har savolga 2–4 gaplik javob, ovoz chiqarib aytishga qulay.'),
        feat('refresh', 'Mashq rejimi', 'Savol chiqadi, avval oʻzingiz javob berasiz, keyin tekshirasiz.')));
      if (p > 0) box.append(h('div', { class: 'card sum' }, h('div', { class: 'r tot' }, h('span', {}, 'Narxi'), h('span', {}, money(p))), h('div', { class: 'r' }, h('span', {}, 'Balansingiz'), h('span', { class: enough ? '' : 'minus' }, money(me.balance)))));
      if (p > 0 && !enough) box.append(h('div', { class: 'hint minus', style: 'margin:0 2px 10px' }, `Yana ${money(p - me.balance)} kerak.`));
      const btn = h('button', { class: 'btn', id: 'defense-go', onclick: () => (enough ? start(btn) : (state.topupAmount = Math.max(c.minTopup, Math.ceil((p - me.balance) / 1000) * 1000), go('balance'))) },
        enough ? [icon('spark', 20), p > 0 ? `Tayyorlash · ${money(p)}` : 'Tayyorlash'] : [icon('wallet', 20), 'Balansni toʻldirish']);
      box.append(btn);
    };

    const drawWait = () => box.append(h('div', { class: 'progress', id: 'defense-wait' }, h('div', { class: 'row' }, h('span', { class: 'dot-spin', style: 'color:var(--brand);width:22px;height:22px;border-width:3px' }),
      h('div', { class: 'grow' }, h('div', { style: 'font-weight:650' }, 'Savollar tayyorlanmoqda…'), h('div', { class: 'hint' }, 'Odatda 20–60 soniya. Ilovani yopsangiz ham boʻladi: tayyor boʻlgach botdan xabar keladi.')))));

    const drawList = (items) => {
      const list = h('div', { class: 'group', id: 'qa-list' }, items.map((it, i) => {
        const row = h('div', { class: 'qa' },
          h('button', { class: 'qa-q', 'aria-expanded': 'false', onclick: (e) => { const open = row.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', String(open)); haptic('select'); } },
            h('span', { class: 'qa-n' }, String(i + 1)), h('span', { class: 'grow' }, it.q), h('span', { class: 'lvl ' + it.level }, LEVEL[it.level] || ''), icon('chev', 18)),
          h('div', { class: 'qa-a' }, it.a));
        return row;
      }));
      box.append(list, h('div', { class: 'acts' }, h('button', { class: 'btn ghost sm', id: 'qa-copy', onclick: () => copy(items.map((it, i) => `${i + 1}. ${it.q}\n${it.a}`).join('\n\n')) }, icon('copy', 16), 'Hammasini nusxalash')));
    };

    const drawPractice = (items) => {
      const pr = d.practice || (d.practice = newPractice(items));
      if (pr.pos >= pr.order.length) {
        const total = pr.order.length, k = pr.known.length;
        box.append(h('div', { class: 'card result', id: 'practice-result' }, h('div', { class: 'hint' }, 'Natija'), h('div', { class: 'bignum', style: 'justify-content:center;margin:4px 0' }, h('b', {}, `${k} / ${total}`)),
          h('div', { class: 'hint' }, pr.again.length ? `${pr.again.length} ta savolni yana takrorlash kerak.` : 'Hammasini bilasiz. Omad!')));
        if (pr.again.length) box.append(h('button', { class: 'btn', id: 'practice-redo', style: 'margin-bottom:10px', onclick: () => { d.practice = newPractice(items, pr.again); draw(); } }, icon('refresh', 20), `Takrorlanadiganlarni mashq qilish · ${pr.again.length}`));
        box.append(h('button', { class: 'btn line', id: 'practice-restart', onclick: () => { d.practice = newPractice(items); draw(); } }, 'Qaytadan boshlash'));
        return;
      }
      const it = items[pr.order[pr.pos]];
      box.append(h('div', { class: 'row', style: 'justify-content:space-between;margin:2px 2px 8px' }, h('span', { class: 'hint' }, `${pr.pos + 1} / ${pr.order.length}`), h('span', { class: 'lvl ' + it.level }, LEVEL[it.level] || '')),
        h('div', { class: 'bar slim' }, h('b', { style: `width:${Math.round((100 * pr.pos) / pr.order.length)}%;animation:none` })));
      const card = h('div', { class: 'flash card' }, h('div', { class: 'fq', id: 'practice-q' }, it.q));
      if (pr.shown) card.append(h('div', { class: 'fa', id: 'practice-a' }, h('div', { class: 'hint', style: 'margin-bottom:4px;font-weight:700' }, 'Namunaviy javob'), it.a));
      else card.append(h('div', { class: 'hint', style: 'margin-top:14px' }, 'Avval javobni oʻzingiz ovoz chiqarib ayting, keyin tekshiring.'));
      box.append(card);
      const next = (known) => { (known ? pr.known : pr.again).push(pr.order[pr.pos]); pr.pos++; pr.shown = false; haptic('select'); draw(); window.scrollTo(0, 0); };
      if (!pr.shown) box.append(h('button', { class: 'btn', id: 'practice-show', onclick: () => { pr.shown = true; draw(); } }, 'Javobni koʻrsatish'));
      else box.append(h('div', { class: 'two' }, h('button', { class: 'btn line', id: 'practice-again', onclick: () => next(false) }, icon('refresh', 18), 'Takrorlayman'), h('button', { class: 'btn', id: 'practice-known', onclick: () => next(true) }, icon('check', 20), 'Bilaman')));
    };

    const drawDone = () => {
      const items = d.data.items || [];
      heading();
      const segBtn = (m, label) => h('button', { class: d.mode === m ? 'on' : '', role: 'tab', id: 'seg-' + m, 'aria-selected': String(d.mode === m), onclick: () => { if (d.mode === m) return; d.mode = m; haptic('select'); draw(); } }, label);
      box.append(h('div', { class: 'seg', role: 'tablist' }, segBtn('list', `Savol-javoblar · ${items.length}`), segBtn('practice', 'Mashq')));
      if (d.mode === 'practice') drawPractice(items); else drawList(items);
    };

    const draw = () => {
      box.replaceChildren();
      if (d.error) { box.append(emptyState('Ochib boʻlmadi', d.error, h('button', { class: 'btn sm', onclick: () => init() }, 'Qayta urinish'))); return; }
      if (!d.data) { box.append(...skeletons()); return; }
      const s = d.data.status;
      if (s === 'done') return drawDone();
      heading();
      if (s === 'processing') return drawWait();
      drawIntro(s === 'failed');
    };

    const init = async () => {
      d.error = null; d.data = null; draw();
      try { d.data = await api('GET', `/api/orders/${d.orderId}/defense`); sync(); } catch (e) { d.error = e.message; }
      if (state.screen !== 'defense' || state.defense !== d) return;
      draw(); poll();
    };
    draw(); init();
  }

  // ---------- 4. Balans ----------
  async function loadPayments() { const j = await api('GET', '/api/payments'); state.payments = j.payments; state.ledger = j.ledger; state.me.balance = j.balance; }
  function screenBalance() {
    const c = state.cfg;
    const [int] = [new Intl.NumberFormat('ru-RU').format(state.me.balance || 0).replace(/\u00a0/g, ' ')];
    view.append(h('div', { class: 'wallet' }, h('div', { class: 'lab' }, 'Joriy balans'), h('div', { class: 'amt' }, int, h('small', {}, 'soʻm')), h('div', { class: 'lab' }, c.flat ? `Taqdimot — ${money(c.priceDeck)} (slayd soniga bogʻliq emas)` : `1 slayd — ${money(c.priceSlide)}`)));
    const panel = h('div', {});
    view.append(panel);
    const amounts = [c.minTopup, 25000, 50000, 100000].filter((v, i, a) => v >= c.minTopup && a.indexOf(v) === i);
    const drawTopup = () => {
      panel.replaceChildren();
      if (state.pay) return drawPay();
      const inp = h('input', { type: 'number', inputmode: 'numeric', min: c.minTopup, max: c.maxTopup, placeholder: `Boshqa summa (${money(c.minTopup)} dan)`, 'aria-label': 'Summa', value: state.topupAmount && !amounts.includes(state.topupAmount) ? state.topupAmount : '' });
      const els = amounts.map((v) => h('button', { class: 'amount pressable' + (state.topupAmount === v ? ' on' : ''), onclick: () => { state.topupAmount = v; inp.value = ''; els.forEach((e, i) => e.classList.toggle('on', amounts[i] === v)); haptic('select'); } }, money(v)));
      inp.addEventListener('input', () => { state.topupAmount = Number(inp.value) || 0; els.forEach((e, i) => e.classList.toggle('on', amounts[i] === state.topupAmount)); });
      const btn = h('button', { class: 'btn', onclick: async () => {
        if (!Number.isInteger(state.topupAmount) || state.topupAmount < c.minTopup || state.topupAmount > c.maxTopup) { haptic('error'); return toast(`Summa ${money(c.minTopup)} dan ${money(c.maxTopup)} gacha boʻlishi kerak.`); }
        btn.disabled = true;
        try { state.pay = await api('POST', '/api/topup', { amount: state.topupAmount }); drawTopup(); window.scrollTo(0, 0); } catch (e) { toast(e.message); btn.disabled = false; }
      } }, icon('wallet', 20), 'Balansni toʻldirish');
      panel.append(h('div', { class: 'sec' }, h('h2', {}, 'Balansni toʻldirish')), h('div', { class: 'grid2' }, els), h('div', { style: 'margin:10px 0 14px' }, inp), btn);
    };
    const drawPay = () => {
      const p = state.pay;
      const file = h('input', { type: 'file', accept: 'image/*', style: 'display:none', onchange: async (e) => {
        const f = e.target.files && e.target.files[0]; if (!f) return;
        send.disabled = true; send.replaceChildren(h('span', { class: 'dot-spin' }), 'Yuborilmoqda…');
        try {
          const data = await compress(f);
          await api('POST', `/api/payments/${p.paymentId}/receipt`, { data });
          haptic('success'); toast('Chek yuborildi. Tekshirilgach balansingiz toʻldiriladi.');
          state.pay = null; state.topupAmount = 0; await loadPayments(); render();
        } catch (err) { toast(err.message); haptic('error'); send.disabled = false; send.replaceChildren(icon('camera', 20), 'Chek rasmini yuborish'); }
        e.target.value = '';
      } });
      const send = h('button', { class: 'btn', onclick: () => file.click() }, icon('camera', 20), 'Chek rasmini yuborish');
      panel.append(h('div', { class: 'sec' }, h('h2', {}, 'Toʻlov')),
        h('div', { class: 'card' },
          h('div', { class: 'hint' }, 'Oʻtkazilishi kerak'), h('div', { style: 'font-size:26px;font-weight:800;letter-spacing:-.02em;margin-bottom:14px' }, money(p.amount)),
          h('div', { class: 'hint' }, 'Karta raqami'), h('div', { class: 'card-num' }, p.card), h('div', { style: 'margin:2px 0 12px;font-weight:600' }, p.holder),
          h('button', { class: 'btn ghost sm', onclick: () => copy(p.card) }, icon('copy', 16), 'Raqamni nusxalash')),
        h('div', { class: 'card flat' }, h('div', { class: 'how' },
          h('div', { class: 's' }, h('span', { class: 'n' }, '1'), h('span', {}, 'Yuqoridagi kartaga aynan shu summani oʻtkazing.')),
          h('div', { class: 's' }, h('span', { class: 'n' }, '2'), h('span', {}, 'Chek (skrinshot) rasmini yuboring.')),
          h('div', { class: 's' }, h('span', { class: 'n' }, '3'), h('span', {}, 'Admin tekshirgach balansingiz toʻldiriladi, bot xabar beradi.')))),
        send, file, h('div', { style: 'text-align:center;margin-top:6px' }, h('button', { class: 'link', onclick: () => { state.pay = null; drawTopup(); } }, 'Bekor qilish')));
    };
    drawTopup();
    const hist = h('div', {});
    view.append(hist);
    loadPayments().then(() => {
      if (state.screen !== 'balance') return;
      if (state.payments.length) hist.append(h('div', { class: 'sec' }, h('h2', {}, 'Toʻlovlar')), h('div', { class: 'group' }, state.payments.map((x) => h('div', { class: 'li' }, h('div', { class: 'ico' }, icon('down', 20)), h('div', { class: 'grow' }, h('div', { class: 't' }, money(x.amount)), h('div', { class: 'hint' }, when(x.createdAt))), h('span', { class: 'badge ' + x.status }, STATUS[x.status] || x.status)))));
      if (state.ledger.length) hist.append(h('div', { class: 'sec' }, h('h2', {}, 'Harakatlar')), h('div', { class: 'group' }, state.ledger.map((x) => h('div', { class: 'li' }, h('div', { class: 'ico' + (x.type === 'charge' ? ' out' : '') }, icon(x.type === 'charge' ? 'up' : 'down', 20)), h('div', { class: 'grow' }, h('div', { class: 't' }, LEDGER[x.type] || x.type), h('div', { class: 'hint' }, when(x.ts))), h('b', { class: x.type === 'charge' ? 'minus' : 'plus' }, (x.type === 'charge' ? '−' : '+') + money(x.amount))))));
    }).catch(() => {});
  }
  function copy(text) {
    const done = () => { toast('Nusxalandi'); haptic('success'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => toast('Nusxalab boʻlmadi'));
    else { const t = h('textarea', {}, text); document.body.append(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Nusxalab boʻlmadi'); } t.remove(); }
  }
  function compress(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url); resolve(cv.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Rasmni oʻqib boʻlmadi.')); };
      img.src = url;
    });
  }

  // ---------- 5. Profil ----------
  function screenProfile() {
    const me = state.me, p = me.profile || {};
    const vals = { fullName: p.fullName || '', group: p.group || '', university: p.university || '', faculty: p.faculty || '' };
    const fields = [['fullName', 'Ism va familiya', 'Masalan: Ali Valiyev'], ['group', 'Guruh', 'Masalan: 101-guruh'], ['university', 'Universitet', 'Masalan: OʻzDJTU'], ['faculty', 'Fakultet', 'Masalan: Filologiya']];
    view.append(h('div', { class: 'center' }, h('div', { class: 'avatar' }, initials(me.name)), h('div', { style: 'font-size:20px;font-weight:800' }, me.name || 'Foydalanuvchi'), me.username ? h('div', { class: 'hint' }, '@' + me.username) : null));
    if (me.profileMissing) view.append(h('div', { class: 'card flat', style: 'margin-top:16px;border-color:var(--warn)' }, h('b', {}, 'Profilni toʻldiring'), h('div', { class: 'hint' }, 'Bu maʼlumotlar taqdimotning titul varagʻiga yoziladi. Usiz buyurtma bera olmaysiz.')));
    const tc = { u: h('div', { class: 'u' }), nm: h('div', { class: 'nm' }) };
    const draw = () => { tc.u.textContent = vals.university || 'Universitet'; tc.nm.replaceChildren(h('div', {}, vals.fullName || 'Ism familiya'), h('div', { style: 'opacity:.8' }, [vals.faculty, vals.group].filter(Boolean).join(' · ') || 'Fakultet · Guruh')); };
    view.append(h('div', { class: 'sec' }, h('h2', {}, 'Titul varagʻi koʻrinishi')), h('div', { class: 'titlecard' }, tc.u, h('div', { class: 'tt' }, 'Taqdimot mavzusi shu yerda boʻladi'), tc.nm));
    draw();
    const card = h('div', { class: 'card', style: 'margin-top:16px' });
    fields.forEach(([k, label, ph], i) => card.append(h('label', { class: 'field-l', for: 'f_' + k, style: i === 0 ? 'margin-top:0' : '' }, label), h('input', { type: 'text', id: 'f_' + k, maxlength: 80, placeholder: ph, value: vals[k], oninput: (e) => { vals[k] = e.target.value; draw(); } })));
    const btn = h('button', { class: 'btn', style: 'margin-top:18px', onclick: async () => {
      btn.disabled = true;
      try {
        const j = await api('PUT', '/api/profile', vals); state.me = j.user;
        if (state.me.profileMissing) { toast('Hamma maydonlarni toʻldiring.'); haptic('error'); btn.disabled = false; }
        else { toast('Saqlandi'); haptic('success'); go('home'); }
      } catch (e) { toast(e.message); btn.disabled = false; }
    } }, 'Saqlash');
    card.append(btn);
    view.append(card);
  }

  // ---------- boshlash ----------
  async function start() {
    if (!(tg && tg.initData) && !DEV) {
      tabs.classList.add('hide');
      view.append(h('div', { class: 'empty', style: 'padding-top:90px' }, icon('spark', 56, 1.4), h('b', {}, 'Taqdimot'), 'Bu ilovani Telegram ichidan, bot orqali oching.'));
      return;
    }
    view.append(...skeletons());
    try {
      await refreshMe();
      // bot xabaridagi «Ochish» tugmasi: /?d=<buyurtma raqami> — himoya savollarini toʻgʻridan-toʻgʻri ochadi
      const dId = Number(q.get('d'));
      if (dId && !state.me.profileMissing) {
        try { await loadOrders(); } catch (e) { /* roʻyxatsiz ham ochiladi */ }
        if (state.orders.some((o) => o.id === dId && o.status === 'done')) return openDefense(dId);
      }
      go(state.me.profileMissing ? 'profile' : 'home');
    } catch (e) {
      view.replaceChildren(h('div', { class: 'empty', style: 'padding-top:90px' }, icon('inbox', 56, 1.4), h('b', {}, 'Ulanib boʻlmadi'), e.message || '', h('div', { style: 'margin-top:16px' }, h('button', { class: 'btn sm', onclick: () => location.reload() }, 'Qayta urinish'))));
    }
  }
  start();
})();
