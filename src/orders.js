// Mini App uchun buyurtma mantiqi. Pul va buyurtma qoidalari botdagi bilan bir xil (store va service umumiy).
const config = require('./config');
const service = require('./service');
const { PALETTES, STYLE_KEYS, DEFAULT_STYLE, randomStyle } = require('./deck');

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
        await bot.telegram.sendMessage(userId, msg);
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

  /** Tayyor taqdimotni qayta chatga yuboradi. */
  async function resend(userId, orderId) {
    const o = store.getOrder(orderId);
    if (!o || o.userId !== userId || o.type !== 'deck' || o.status !== 'done' || !o.deck) return { code: 404, body: { error: 'not_found' } };
    if (o.lastSentAt && Date.now() - o.lastSentAt < 20000) return { code: 429, body: { error: 'wait', message: 'Biroz kuting va qayta urinib koʻring.' } };
    store.updateOrder(o.id, { lastSentAt: Date.now() });
    const profile = (store.getUser(userId) || {}).profile || {};
    const res = await service.render(o.deck, { color: o.color, style: o.style, lang: o.lang, profile });
    await sendFiles(userId, service.fileBase(o.topic), res);
    return { code: 200, body: { ok: true } };
  }

  return { placeDeck, resend, validate };
}

module.exports = { createOrders, validate, profileMissing, LANGS, toPublicLang, fmt };
