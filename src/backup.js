// Bazaning nusxasi: butun maʼlumot (foydalanuvchilar, buyurtmalar, toʻlovlar, balans tarixi, promo-kodlar) siqilgan JSON fayl sifatida adminga yuboriladi.
// Maʼlumotlar asosiy ombor (Supabase) buzilsa yoki tasodifan oʻchib ketsa, shu fayldan tiklanadi.

const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const MAX_BYTES = 40 * 1024 * 1024; // Telegram botlar uchun fayl chegarasi 50 MB; zaxira bilan

/** TZ_OFFSET_H vaqt mintaqasidagi sana (YYYY-MM-DD) va soat. */
function localParts(offsetH = 5, ms = Date.now()) {
  const d = new Date(ms + offsetH * 3600e3);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

/** Nusxani yasaydi. Siqilgani juda katta boʻlsa, ogʻir maydonlar (tayyor taqdimot/hujjat matni) tashlab yuboriladi. */
async function buildBackup(store, { date } = {}) {
  let snap = store.snapshot();
  let buf = await gzip(Buffer.from(JSON.stringify(snap)));
  if (buf.length > MAX_BYTES) {
    snap = store.snapshot({ light: true });
    buf = await gzip(Buffer.from(JSON.stringify(snap)));
  }
  const day = date || localParts().date;
  return { buf, snap, name: `slayd-bot-backup-${day}${snap.light ? '-light' : ''}.json.gz` };
}

/** Nusxani adminlarga yuboradi. Nechta adminga yetganini qaytaradi. */
async function sendBackup(telegram, store, adminIds, { date } = {}) {
  const ids = (adminIds || []).filter(Boolean);
  if (!ids.length) return 0;
  const { buf, snap, name } = await buildBackup(store, { date });
  const c = snap.counts;
  const kb = (buf.length / 1024).toFixed(buf.length > 1024 * 100 ? 0 : 1);
  const caption =
    `🗄 Baza nusxasi · ${date || localParts().date}\n` +
    `Foydalanuvchilar: ${c.users} · buyurtmalar: ${c.orders} · toʻlovlar: ${c.payments} · promo-kodlar: ${c.promos}\n` +
    `Hajmi: ${kb} KB${snap.light ? ' (tayyor ish matnlarisiz — fayl juda katta boʻlgani uchun)' : ''}\n` +
    `Faylni xavfsiz joyda saqlang: unda foydalanuvchilar maʼlumoti bor.`;
  let delivered = 0;
  for (const id of ids) {
    try {
      await telegram.sendDocument(id, { source: buf, filename: name }, { caption });
      delivered++;
    } catch (e) {
      console.error('Nusxani adminga yuborib boʻlmadi:', id, e.message);
    }
  }
  return delivered;
}

module.exports = { buildBackup, sendBackup, localParts, MAX_BYTES };
