// Admin uchun hisob-kitob: daromad (davrlar boʻyicha), foydalanuvchilar roʻyxati va tafsilot, balansni qoʻshish/ayirish.
// Faqat store maʼlumotlari ustida ishlaydi; kimga ruxsat borligini chaqiruvchi (bot yoki web) tekshiradi.

const TZ_MS = 5 * 3600 * 1000; // Oʻzbekiston vaqti (UTC+5)
const DAY = 86400000;
const MAX_ADJUST = 10000000;

/** Davr boshlanishi (ms). today = bugun 00:00 (Toshkent), week = oxirgi 7 kun, month = oxirgi 30 kun, all = hammasi. */
function periodStart(kind, now = Date.now()) {
  const midnight = Math.floor((now + TZ_MS) / DAY) * DAY - TZ_MS;
  if (kind === 'today') return midnight;
  if (kind === 'week') return midnight - 6 * DAY;
  if (kind === 'month') return midnight - 29 * DAY;
  return 0;
}

const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const money = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' soʻm';

/**
 * Daromad hisobi.
 *  spent   — mijozlar xizmatlarga sarflagan pul (yechilgan − qaytarilgan) = daromad
 *  topups  — kartaga tushgan, admin tasdiqlagan toʻldirishlar (haqiqiy pul kirimi)
 *  bonus   — admin qoʻlda qoʻshgan (pul kirimi emas), debit — admin ayirgan
 */
function summary(store, now = Date.now()) {
  const d = store.db;
  const out = { periods: {}, totals: {} };
  for (const kind of ['today', 'week', 'month', 'all']) {
    const from = periodStart(kind, now);
    const led = d.ledger.filter((l) => l.ts >= from);
    const by = (type) => sum(led.filter((l) => l.type === type).map((l) => l.amount));
    const inRange = (o) => o.createdAt >= from;
    out.periods[kind] = {
      spent: by('charge') - by('refund'),
      charged: by('charge'),
      refunded: by('refund'),
      topups: by('topup'),
      topupCount: led.filter((l) => l.type === 'topup').length,
      bonus: by('credit'),
      referral: by('referral'),
      debit: by('debit'),
      decks: d.orders.filter((o) => o.type === 'deck' && o.status === 'done' && inRange(o)).length,
      edits: d.orders.filter((o) => o.type === 'edit' && o.status === 'done' && inRange(o)).length,
      defenses: d.orders.filter((o) => o.defenseStatus === 'done' && (o.defenseStartedAt || o.createdAt) >= from).length,
      newUsers: Object.values(d.users).filter((u) => u.createdAt >= from).length,
    };
  }
  const pending = d.payments.filter((p) => p.status === 'pending');
  out.totals = {
    users: Object.keys(d.users).length,
    balances: sum(Object.values(d.users).map((u) => u.balance)),
    pending: pending.length,
    pendingAmount: sum(pending.map((p) => p.amount)),
  };
  return out;
}

/** Har bir foydalanuvchi boʻyicha yigʻma: ishlar soni, sarflagan pul, toʻldirgan pul, oxirgi faollik. */
function aggregate(store) {
  const agg = {};
  const get = (id) => agg[id] || (agg[id] = { orders: 0, spent: 0, topups: 0, lastAt: 0 });
  for (const o of store.db.orders) {
    const a = get(o.userId);
    if (o.status === 'done') a.orders++;
    a.lastAt = Math.max(a.lastAt, o.createdAt || 0);
  }
  for (const l of store.db.ledger) {
    const a = get(l.userId);
    if (l.type === 'charge') a.spent += l.amount;
    else if (l.type === 'refund') a.spent -= l.amount;
    else if (l.type === 'topup') a.topups += l.amount;
    a.lastAt = Math.max(a.lastAt, l.ts || 0);
  }
  return agg;
}

const SORTS = {
  recent: (a, b) => b.lastAt - a.lastAt,
  spent: (a, b) => b.spent - a.spent || b.lastAt - a.lastAt,
  balance: (a, b) => b.balance - a.balance || b.lastAt - a.lastAt,
};

/** Foydalanuvchilar roʻyxati. opts: { q, sort: recent|spent|balance, limit, offset } */
function listUsers(store, opts = {}) {
  const q = String(opts.q || '').trim().toLowerCase().replace(/^@/, '');
  const limit = Math.min(50, Math.max(1, Number(opts.limit) || 20));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const agg = aggregate(store);
  let rows = Object.values(store.db.users).map((u) => {
    const a = agg[u.id] || { orders: 0, spent: 0, topups: 0, lastAt: 0 };
    return {
      id: u.id, name: u.name || '', username: u.username || '', balance: u.balance, createdAt: u.createdAt,
      orders: a.orders, spent: a.spent, topups: a.topups, lastAt: Math.max(a.lastAt, u.createdAt || 0),
    };
  });
  if (q) {
    const hay = (u) => {
      const p = (store.getUser(u.id) || {}).profile || {};
      return [String(u.id), u.username, u.name, p.fullName, p.university, p.group].filter(Boolean).join(' ').toLowerCase();
    };
    rows = rows.filter((u) => hay(u).includes(q));
  }
  rows.sort(SORTS[opts.sort] || SORTS.recent);
  return { total: rows.length, users: rows.slice(offset, offset + limit) };
}

/** Bitta foydalanuvchi: maʼlumot, yigʻma, soʻnggi ishlar, harakatlar va toʻlovlar. */
function userDetail(store, id) {
  const u = store.getUser(id);
  if (!u) return null;
  const agg = aggregate(store)[u.id] || { orders: 0, spent: 0, topups: 0, lastAt: 0 };
  const led = store.db.ledger.filter((l) => l.userId === u.id);
  const by = (type) => sum(led.filter((l) => l.type === type).map((l) => l.amount));
  const ref = u.referredBy ? store.getUser(u.referredBy) : null;
  return {
    user: { id: u.id, name: u.name || '', username: u.username || '', balance: u.balance, createdAt: u.createdAt, profile: u.profile || {} },
    referral: {
      by: ref ? { id: ref.id, name: ref.name || '', username: ref.username || '' } : null,
      ...store.referralStats(u.id),
    },
    totals: { orders: agg.orders, spent: agg.spent, topups: agg.topups, bonus: by('credit'), referral: by('referral'), debit: by('debit'), refunded: by('refund') },
    orders: store.db.orders.filter((o) => o.userId === u.id).slice(-8).reverse()
      .map((o) => ({ id: o.id, type: o.type, topic: o.topic || '', status: o.status, price: o.price || 0, createdAt: o.createdAt, defense: o.defenseStatus || 'none' })),
    ledger: led.slice(-20).reverse().map((l) => ({ id: l.id, type: l.type, amount: l.amount, note: l.note, ts: l.ts })),
    payments: store.db.payments.filter((p) => p.userId === u.id).slice(-8).reverse().map((p) => ({ id: p.id, amount: p.amount, status: p.status, createdAt: p.createdAt })),
  };
}

/**
 * Balansni qoʻlda oʻzgartiradi. op: 'add' | 'sub'. Qaytaradi: { ok, balance, amount, op } yoki { ok:false, code, error, message }.
 * Ayirishda balans manfiy boʻlib ketmaydi.
 */
function adjust(store, adminId, userId, op, amount, note) {
  const u = store.getUser(userId);
  if (!u) return { ok: false, code: 404, error: 'not_found', message: 'Foydalanuvchi topilmadi.' };
  if (op !== 'add' && op !== 'sub') return { ok: false, code: 400, error: 'invalid', message: 'Amal notoʻgʻri.' };
  const sumv = Number(amount);
  if (!Number.isInteger(sumv) || sumv < 1 || sumv > MAX_ADJUST) {
    return { ok: false, code: 400, error: 'invalid', message: `Summa 1 dan ${money(MAX_ADJUST)} gacha boʻlishi kerak.` };
  }
  const memo = String(note == null ? '' : note).replace(/\s+/g, ' ').trim().slice(0, 80);
  if (op === 'add') {
    store.credit(u.id, sumv, `Admin ${adminId}: ${memo || 'qoʻshildi'}`, 'credit');
  } else if (!store.debit(u.id, sumv, `Admin ${adminId}: ${memo || 'ayirildi'}`)) {
    return { ok: false, code: 409, error: 'balance', message: `Balansda atigi ${money(u.balance)} bor, undan koʻp ayirib boʻlmaydi.` };
  }
  return { ok: true, op, amount: sumv, note: memo, balance: store.getUser(u.id).balance };
}

/** Foydalanuvchiga yuboriladigan xabar (adjust natijasi bo'yicha). Admin izohi bo'lsa, qo'shiladi. */
function notice(res) {
  const head = res.op === 'add' ? `✅ Balansingizga ${money(res.amount)} qoʻshildi.` : `➖ Balansingizdan ${money(res.amount)} ayirildi.`;
  return `${head}${res.note ? `\nIzoh: ${res.note}` : ''}\nHozirgi balans: ${money(res.balance)}.`;
}

module.exports = { periodStart, summary, listUsers, userDetail, adjust, notice, money, MAX_ADJUST };
