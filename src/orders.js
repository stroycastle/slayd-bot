// Mini App uchun buyurtma mantiqi. Pul va buyurtma qoidalari botdagi bilan bir xil (store va service umumiy).
const { Markup } = require('telegraf');
const config = require('./config');
const service = require('./service');
const { PALETTES, STYLE_KEYS, DEFAULT_STYLE, randomStyle } = require('./deck');
const rating = require('./rating');
const { KINDS } = require('./docgen');

// API shartnomasidagi til kodlari (mini ilova `qq` yuboradi); botda ichki kod `kaa` (qoraqalpoq, lotin)
const LANGS = ['uz', 'uzc', 'ru', 'qq'];
const toInternalLang = (l) => (l === 'qq' ? 'kaa' : l);
const toPublicLang = (l) => (l === 'kaa' ? 'qq' : l);
const fmt = (n) => new Intl.NumberFormat('ru-RU').format(n).replace(/ /g, ' ') + ' soʻm';

function profileMissing(p) {
  return ['fullName', 'group', 'university', 'faculty'].find((k) => !p || !p[k]);
}

function clean(s, max) {
  return String(s == null ? '' : s).replace(/\r/g, '').trim().slice(0, max);
}

/** Kiruvchi maʼlumotni tekshiradi. Qaytaradi: { ok, value | error } */
function validate(b) {
  b = b || {};
  const topic = clean(b.topic, 300);
  if (topic.length < 3) return { ok: false, error: 'Mavzuni yozing (kamida 3 belgi).' };
  const slides = Number(b.slides);
  if (!Number.isInteger(slides) || slides < config.MIN_SLIDES || slides > config.MAX_SLIDES) {
    return { ok: false, error: `Slayd soni ${config.MIN_SLIDES} dan ${config.MAX_SLIDES} gacha boʻlishi kerak.` };
  }
  if (!LANGS.includes(b.lang) && b.lang !== 'kaa') return { ok: false, error: 'Til notoʻgʻri.' };
  if (!PALETTES[b.color]) return { ok: false, error: 'Rang notoʻgʻri.' };
  // koʻrinish: kalit, "random" (tasodifiy) yoki boʻsh (Klassik)
  let style = b.style == null || b.style === '' ? DEFAULT_STYLE : String(b.style);
  if (style === 'random') style = randomStyle();
  if (!STYLE_KEYS.includes(style)) return { ok: false, error: 'Koʻrinish notoʻgʻri.' };
  const lecture = clean(b.lecture, config.MAX_LECTURE_CHARS);
  const references = clean(b.references, 6000);
  return { ok: true, value: { topic, slides, lang: toInternalLang(b.lang), color: b.color, style, lecture: lecture || '', references: references || '' } };
}

const docPrice = (kind) => (kind === 'kurs' ? config.PRICE_KURS : config.PRICE_REFERAT);
const kindLabel = (kind) => (kind === 'kurs' ? 'Kurs ishi' : 'Referat');

/** Referat / kurs ishi buyurtmasini tekshiradi. Qaytaradi: { ok, value | error } */
function validateDoc(b) {
  b = b || {};
  const kind = b.kind === 'kurs' ? 'kurs' : b.kind === 'referat' ? 'referat' : null;
  if (!kind) return { ok: false, error: 'Hujjat turini tanlang (referat yoki kurs ishi).' };
  const topic = clean(b.topic, 300);
  if (topic.length < 3) return { ok: false, error: 'Mavzuni yozing (kamida 3 belgi).' };
  const k = KINDS[kind];
  const pages = Number(b.pages);
  if (!Number.isInteger(pages) || pages < k.min || pages > k.max) {
    return { ok: false, error: `Bet soni ${k.min} dan ${k.max} gacha boʻlishi kerak.` };
  }
  if (!LANGS.includes(b.lang) && b.lang !== 'kaa') return { ok: false, error: 'Til notoʻgʻri.' };
  const subject = clean(b.subject, 100).replace(/\s+/g, ' ');
  const lecture = clean(b.lecture, config.MAX_LECTURE_CHARS);
  const references = clean(b.references, 6000);
  return { ok: true, value: { kind, topic, pages, lang: toInternalLang(b.lang), subject, lecture: lecture || '', references: references || '' } };
}

function createOrders({ store, bot }) {
  const notifyAdmins = (text) => {
    for (const id of config.ADMIN_IDS) bot.telegram.sendMessage(id, text).catch(() => {});
  };

  async function sendFiles(userId, base, res) {
    await bot.telegram.sendDocument(userId, { source: res.pptx, filename: `${base}.pptx` });
    if (res.pdf) await bot.telegram.sendDocument(userId, { source: res.pdf, filename: `${base}.pdf` });
  }

  async function run(userId, order, d) {
    try {
      const profile = (store.getUser(userId) || {}).profile || {};
      const res = await service.createDeck({ ...d, profile });
      // kamroq slayd chiqsa, farqi qaytariladi (botdagi qoida bilan bir xil)
      let refund = 0;
      if (res.finalSlides < order.slides) {
        refund = service.shortfallRefund(order, res.finalSlides);
        if (refund > 0) store.refund(userId, refund, `Slayd kam chiqdi: buyurtma #${order.id}`);
      }
      store.updateOrder(order.id, { status: 'done', deck: res.deck, finalSlides: res.finalSlides, price: order.price - refund });
      try {
        await sendFiles(userId, service.fileBase(d.topic), res);
        let msg = `✅ Tayyor! ${res.finalSlides} ta slayd.`;
        if (refund) msg += ` Slayd soni kamroq chiqqani uchun ${fmt(refund)} balansingizga qaytarildi.`;
        msg += `\n\nTopshirishdan oldin matn va adabiyotlar roʻyxatini oʻqib, tekshirib chiqing.\nOʻzgartirish kerak boʻlsa botdagi «✏️ Tahrirlash» tugmasi (${fmt(config.PRICE_EDIT)}).`;
        msg += `\n\n🎓 Himoyaga tayyorlanish: Ilovadagi «Tarix» boʻlimida oʻqituvchi beradigan savollar va javoblarni olishingiz mumkin (${config.PRICE_DEFENSE > 0 ? fmt(config.PRICE_DEFENSE) : 'bepul'}).`;
        await bot.telegram.sendMessage(userId, msg);
        rating.prompt(bot, userId, order.id);
      } catch (e) {
        // fayl yuborilmadi (masalan, bot bloklangan): buyurtma tayyor, ilovadan qayta yuborish mumkin
        store.updateOrder(order.id, { deliveryError: String(e.message || e).slice(0, 200) });
      }
    } catch (e) {
      console.error('Mini App buyurtma xatosi:', e);
      store.updateOrder(order.id, { status: 'failed', error: String(e.message || e).slice(0, 300) });
      store.refund(userId, order.price, `Xatolik: buyurtma #${order.id}`);
      bot.telegram.sendMessage(userId, `Kechirasiz, taqdimotni tayyorlashda xatolik chiqdi. ${fmt(order.price)} balansingizga qaytarildi. Birozdan keyin qayta urinib koʻring.`).catch(() => {});
      notifyAdmins(`❗ Buyurtma #${order.id} (Mini App) xatolik: ${String(e.message || e).slice(0, 300)}`);
    }
  }

  /** Buyurtma yaratadi. Qaytaradi: { code, body } */
  function placeDeck(userId, input) {
    const v = validate(input);
    if (!v.ok) return { code: 400, body: { error: 'invalid', message: v.error } };
    const user = store.getUser(userId);
    if (!user) return { code: 401, body: { error: 'auth' } };
    const miss = profileMissing(user.profile);
    if (miss) return { code: 400, body: { error: 'profile', field: miss, message: 'Avval profilni toʻldiring (titul varagʻi uchun).' } };
    if (store.hasProcessing(userId)) {
      return { code: 409, body: { error: 'busy', message: 'Avvalgi taqdimotingiz hali tayyorlanmoqda.' } };
    }
    const d = v.value;
    const price = config.deckPrice(d.slides);
    if (!store.charge(userId, price, `Taqdimot: ${d.topic.slice(0, 40)}`)) {
      return { code: 402, body: { error: 'balance', need: price - user.balance, message: 'Balansda mablagʻ yetarli emas.' } };
    }
    const order = store.addOrder({ userId, type: 'deck', source: 'miniapp', topic: d.topic, slides: d.slides, lang: d.lang, color: d.color, style: d.style, price, hasLecture: !!d.lecture });
    run(userId, order, d); // fon rejimida
    return { code: 200, body: { orderId: order.id, price, balance: store.getUser(userId).balance } };
  }

  async function sendDocFiles(userId, base, res) {
    await bot.telegram.sendDocument(userId, { source: res.docx, filename: `${base}.docx` });
    if (res.pdf) await bot.telegram.sendDocument(userId, { source: res.pdf, filename: `${base}.pdf` });
  }

  async function runDoc(userId, order, d) {
    try {
      const profile = (store.getUser(userId) || {}).profile || {};
      const res = await service.createDoc({ ...d, profile });
      // matn rejadagidan ancha kam chiqsa, farqi qaytariladi
      const refund = service.docShortfallRefund(order, res.words, res.targetWords);
      if (refund > 0) store.refund(userId, refund, `${kindLabel(d.kind)} qisqa chiqdi: buyurtma #${order.id}`);
      const pageCount = res.pageCount || d.pages;
      store.updateOrder(order.id, { status: 'done', doc: res.doc, words: res.words, finalPages: pageCount, price: order.price - refund });
      try {
        await sendDocFiles(userId, service.fileBase(d.topic), res);
        let msg = `✅ ${kindLabel(d.kind)} tayyor! Taxminan ${pageCount} bet, ${res.words} soʻz.`;
        if (refund) msg += ` Matn rejadagidan qisqaroq chiqqani uchun ${fmt(refund)} balansingizga qaytarildi.`;
        msg += `\n\n.docx faylini Wordda oching: shrift, oraliq va betlar tayyor, siz faqat tahrir qilasiz.\nTopshirishdan oldin matnni oʻqib chiqing va adabiyotlar roʻyxatidagi manbalar haqiqatan mavjudligini tekshiring: sunʼiy intellekt manbani adashtirishi mumkin. Matnda havola raqamlari ([1], [2]) qoʻyilmagan.`;
        await bot.telegram.sendMessage(userId, msg);
        rating.prompt(bot, userId, order.id);
      } catch (e) {
        store.updateOrder(order.id, { deliveryError: String(e.message || e).slice(0, 200) });
      }
    } catch (e) {
      console.error('Hujjat buyurtmasi xatosi:', e);
      store.updateOrder(order.id, { status: 'failed', error: String(e.message || e).slice(0, 300) });
      store.refund(userId, order.price, `Xatolik: buyurtma #${order.id}`);
      bot.telegram.sendMessage(userId, `Kechirasiz, ${kindLabel(d.kind).toLowerCase()}ni tayyorlashda xatolik chiqdi. ${fmt(order.price)} balansingizga qaytarildi. Birozdan keyin qayta urinib koʻring.`).catch(() => {});
      notifyAdmins(`❗ Buyurtma #${order.id} (${kindLabel(d.kind)}) xatolik: ${String(e.message || e).slice(0, 300)}`);
    }
  }

  /** Referat / kurs ishi buyurtma qiladi. Qaytaradi: { code, body } */
  function placeDoc(userId, input) {
    const v = validateDoc(input);
    if (!v.ok) return { code: 400, body: { error: 'invalid', message: v.error } };
    const user = store.getUser(userId);
    if (!user) return { code: 401, body: { error: 'auth' } };
    const miss = profileMissing(user.profile);
    if (miss) return { code: 400, body: { error: 'profile', field: miss, message: 'Avval profilni toʻldiring (titul varagʻi uchun).' } };
    if (store.hasProcessing(userId)) {
      return { code: 409, body: { error: 'busy', message: 'Avvalgi buyurtmangiz hali tayyorlanmoqda.' } };
    }
    const d = v.value;
    const price = docPrice(d.kind);
    if (!(price > 0)) return { code: 400, body: { error: 'invalid', message: 'Bu xizmat hozircha yoqilmagan.' } };
    if (!store.charge(userId, price, `${kindLabel(d.kind)}: ${d.topic.slice(0, 40)}`)) {
      return { code: 402, body: { error: 'balance', need: price - user.balance, message: 'Balansda mablagʻ yetarli emas.' } };
    }
    const order = store.addOrder({ userId, type: 'doc', docKind: d.kind, source: 'miniapp', topic: d.topic, subject: d.subject, slides: d.pages, pages: d.pages, lang: d.lang, price, hasLecture: !!d.lecture });
    runDoc(userId, order, d); // fon rejimida
    return { code: 200, body: { orderId: order.id, price, balance: store.getUser(userId).balance } };
  }

  /** Tayyor taqdimotni qayta chatga yuboradi. */
  async function resend(userId, orderId) {
    const o = store.getOrder(orderId);
    const isDoc = o && o.type === 'doc';
    if (!o || o.userId !== userId || o.status !== 'done' || !(isDoc ? o.doc : o.type === 'deck' && o.deck)) return { code: 404, body: { error: 'not_found' } };
    if (o.lastSentAt && Date.now() - o.lastSentAt < 20000) return { code: 429, body: { error: 'wait', message: 'Biroz kuting va qayta urinib koʻring.' } };
    store.updateOrder(o.id, { lastSentAt: Date.now() });
    const profile = (store.getUser(userId) || {}).profile || {};
    if (isDoc) {
      const res = await service.renderDoc(o.doc, { lang: o.lang, profile });
      await sendDocFiles(userId, service.fileBase(o.topic), res);
    } else {
      const res = await service.render(o.deck, { color: o.color, style: o.style, lang: o.lang, profile });
      await sendFiles(userId, service.fileBase(o.topic), res);
    }
    return { code: 200, body: { ok: true } };
  }

  // ---------- himoyaga tayyorgarlik: tayyor taqdimot boʻyicha oʻqituvchi savollari va javoblari ----------
  async function runDefense(userId, order) {
    const price = order.defensePrice || 0;
    try {
      const items = await service.createDefense({ deck: order.deck, topic: order.topic, lang: order.lang });
      store.updateOrder(order.id, { defenseStatus: 'done', defense: { items, createdAt: Date.now() }, defenseError: '' });
      const text = `🎓 Himoya savollari tayyor: «${order.topic.slice(0, 80)}»\n${items.length} ta savol va javob. Ilovada oching va mashq qiling.`;
      const url = config.WEBAPP_URL;
      const extra = /^https:\/\//.test(url) ? Markup.inlineKeyboard([[Markup.button.webApp('🎓 Ochish', `${url}/?d=${order.id}`)]]) : undefined;
      bot.telegram.sendMessage(userId, text, extra).catch(() => {});
    } catch (e) {
      console.error('Himoya savollari xatosi:', e);
      store.updateOrder(order.id, { defenseStatus: 'failed', defenseError: String(e.message || e).slice(0, 300) });
      if (price > 0) store.refund(userId, price, `Xatolik: himoya savollari #${order.id}`);
      bot.telegram.sendMessage(userId, `Kechirasiz, himoya savollarini tayyorlashda xatolik chiqdi.${price > 0 ? ` ${fmt(price)} balansingizga qaytarildi.` : ''} Birozdan keyin qayta urinib koʻring.`).catch(() => {});
      notifyAdmins(`❗ Himoya savollari (buyurtma #${order.id}) xatolik: ${String(e.message || e).slice(0, 300)}`);
    }
  }

  function ownDoneDeck(userId, orderId) {
    const o = store.getOrder(orderId);
    return o && o.userId === userId && o.type === 'deck' && o.status === 'done' && o.deck ? o : null;
  }

  /** Himoya savol-javoblarini buyurtma qiladi. Qaytaradi: { code, body } */
  function placeDefense(userId, orderId) {
    const o = ownDoneDeck(userId, orderId);
    if (!o) return { code: 404, body: { error: 'not_found', message: 'Taqdimot topilmadi.' } };
    if (o.defenseStatus === 'processing') return { code: 409, body: { error: 'busy', message: 'Savollar hali tayyorlanmoqda.' } };
    if (o.defenseStatus === 'done' && o.defense) return { code: 409, body: { error: 'exists', message: 'Bu taqdimot uchun savollar allaqachon tayyor.' } };
    const price = config.PRICE_DEFENSE;
    if (price > 0 && !store.charge(userId, price, `Himoya savollari: ${o.topic.slice(0, 40)}`)) {
      return { code: 402, body: { error: 'balance', need: price - store.getUser(userId).balance, message: 'Balansda mablagʻ yetarli emas.' } };
    }
    const upd = store.updateOrder(o.id, { defenseStatus: 'processing', defensePrice: price, defenseStartedAt: Date.now(), defenseError: '' });
    runDefense(userId, upd); // fon rejimida
    return { code: 200, body: { ok: true, price, balance: store.getUser(userId).balance } };
  }

  /** Himoya holati va (tayyor boʻlsa) savol-javoblar. */
  function defenseView(userId, orderId) {
    const o = ownDoneDeck(userId, orderId);
    if (!o) return { code: 404, body: { error: 'not_found', message: 'Taqdimot topilmadi.' } };
    const status = o.defenseStatus || 'none';
    const body = { status, price: config.PRICE_DEFENSE, topic: o.topic };
    if (status === 'done' && o.defense) { body.items = o.defense.items; body.createdAt = o.defense.createdAt; }
    if (status === 'processing') body.startedAt = o.defenseStartedAt || null;
    if (status === 'failed') body.error = 'Xatolik chiqdi, pul qaytarildi.';
    return { code: 200, body };
  }

  return { placeDeck, placeDoc, resend, placeDefense, defenseView, validate, validateDoc };
}

module.exports = { createOrders, validate, validateDoc, profileMissing, LANGS, toPublicLang, fmt, docPrice };
