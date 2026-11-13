// Promo-kodlar: kodni tekshirish, qoʻllash (koʻp xato urinishdan himoya bilan) va admin tomonidan yaratish.
const crypto = require('crypto');
const config = require('./config');

const CODE_RE = /^[A-Z0-9_-]{3,20}$/;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O, 1/I chalkashmasligi uchun
const MAX_AMOUNT = 1000000;
const MAX_USES = 100000;
const MAX_FAILS = 5; // shuncha xato urinishdan keyin
const BLOCK_MS = 15 * 60 * 1000; // shuncha vaqtga bloklanadi

const normalize = (s) => String(s == null ? '' : s).trim().toUpperCase();
const randomCode = (len = 8) => Array.from(crypto.randomBytes(len), (b) => ALPHABET[b % ALPHABET.length]).join('');
const money = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' soʻm';

const MESSAGES = {
  invalid: [400, 'Promo-kod notoʻgʻri yoki amal qilmaydi.'],
  exhausted: [409, 'Bu promo-kodni ishlatish limiti tugagan.'],
  used: [409, 'Siz promo-kodni allaqachon ishlatgansiz: bitta foydalanuvchi bir marta ishlata oladi.'],
  user: [401, 'Foydalanuvchi topilmadi.'],
};

const tries = new Map(); // userId -> { fails, until }

/** Foydalanuvchi promo-kod kiritdi. Qaytaradi: { ok:true, amount, balance } yoki { ok:false, code, error, message }. */
function redeem(store, userId, rawCode, now = Date.now()) {
  const t = tries.get(userId) || { fails: 0, until: 0 };
  if (t.until > now) {
    return { ok: false, code: 429, error: 'blocked', message: `Juda koʻp xato urinish. ${Math.ceil((t.until - now) / 60000)} daqiqadan keyin qayta urinib koʻring.` };
  }
  const code = normalize(rawCode);
  const r = CODE_RE.test(code) ? store.redeemPromo(userId, code) : { ok: false, error: 'invalid' };
  if (r.ok) {
    tries.delete(userId);
    return r;
  }
  if (r.error === 'invalid' || r.error === 'exhausted') {
    t.fails += 1;
    if (t.fails >= MAX_FAILS) { t.until = now + BLOCK_MS; t.fails = 0; }
    tries.set(userId, t);
  }
  const [status, message] = MESSAGES[r.error] || [400, 'Promo-kod qoʻllanmadi.'];
  return { ok: false, code: status, error: r.error, message };
}

/** Admin yangi kod yaratadi. input: { code?, amount?, maxUses? }. Kod boʻsh boʻlsa, tasodifiy beriladi. */
function create(store, adminId, input = {}) {
  const code = input.code ? normalize(input.code) : randomCode();
  if (!CODE_RE.test(code)) return { ok: false, code: 400, error: 'invalid', message: 'Kod 3–20 belgi: harf (A–Z), raqam, “-” yoki “_”.' };
  const amount = input.amount == null || input.amount === '' ? config.PROMO_AMOUNT : Number(input.amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) return { ok: false, code: 400, error: 'invalid', message: `Summa 1 dan ${money(MAX_AMOUNT)} gacha boʻlishi kerak.` };
  const maxUses = input.maxUses == null || input.maxUses === '' ? 0 : Number(input.maxUses);
  if (!Number.isInteger(maxUses) || maxUses < 0 || maxUses > MAX_USES) return { ok: false, code: 400, error: 'invalid', message: `Limit 0 (cheksiz) dan ${MAX_USES} gacha boʻlishi kerak.` };
  const promo = store.addPromo({ code, amount, maxUses, by: adminId });
  if (!promo) return { ok: false, code: 409, error: 'exists', message: 'Bunday kod allaqachon bor.' };
  return { ok: true, promo };
}

/** Roʻyxat uchun koʻrinish. */
const publicPromo = (p) => ({ code: p.code, amount: p.amount, maxUses: p.maxUses, used: p.used, active: p.active, createdAt: p.createdAt });

module.exports = { normalize, randomCode, redeem, create, publicPromo, CODE_RE, MAX_AMOUNT, MAX_USES, MAX_FAILS };
