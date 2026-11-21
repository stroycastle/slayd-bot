// Fon nazorati (admin uchun):
//  1) chek yuborilgan, lekin admin hali tasdiqlamagan/rad etmagan toʻlov: har PAY_REMIND_MIN daqiqada eslatma (PAY_REMIND_UNTIL_MIN daqiqadan keyin toʻxtaydi);
//  2) OpenRouter hisobida qoldiq LOW_CREDIT_USD dan tushsa ogohlantirish (12 soatda koʻpi bilan 1 marta);
//  3) har kuni baza nusxasi adminlarga (kuniga 1 marta, BACKUP_HOUR dan keyin).
// Hamma narsa "best effort": xato boʻlsa botning asosiy ishiga taʼsir qilmaydi.

const config = require('./config');
const backup = require('./backup');

const MIN = 60 * 1000;
const swallow = () => {};

function createWatchdog({ store, bot, llm, fmt, cfg = config, now = Date.now }) {
  const tg = bot.telegram;
  const admins = () => cfg.ADMIN_IDS || [];
  const reminders = new Map(); // toʻlov ID -> { at, msgs: [{ chat, id }] }
  const call = (fn) => Promise.resolve().then(fn).catch(swallow);

  // ---------------------------------------------------------------- 1) tasdiqlanmagan cheklar
  async function closeReminder(st) {
    // toʻlov hal boʻldi: eslatma xabarlaridagi tugmalarni olib tashlaymiz (eskirgan tugmalar chalkashtirmasin)
    for (const m of st.msgs) await call(() => tg.editMessageReplyMarkup(m.chat, m.id, undefined, { inline_keyboard: [] }));
  }

  async function remind(p, st, minutes) {
    const u = store.getUser(p.userId) || {};
    const caption =
      `⏰ Chek ${minutes} daqiqadan beri tasdiqlanmayapti\n\n💳 Toʻlov #${p.id}\n` +
      `Foydalanuvchi: ${u.name || ''} ${u.username ? '@' + u.username : ''} (ID ${p.userId})\nSumma: ${fmt(p.amount)}`;
    const kb = { reply_markup: { inline_keyboard: [[{ text: '✅ Tasdiqlash', callback_data: `pay:ok:${p.id}` }, { text: '❌ Rad etish', callback_data: `pay:no:${p.id}` }]] } };
    const msgs = [];
    for (const adminId of admins()) {
      const prev = st && st.msgs.find((m) => m.chat === adminId);
      if (prev) await call(() => tg.deleteMessage(prev.chat, prev.id)); // oldingi eslatma oʻchadi: chat toʻlib ketmasin
      try {
        let m;
        if (p.fileId && p.kind === 'document') m = await tg.sendDocument(adminId, p.fileId, { caption, ...kb });
        else if (p.fileId) m = await tg.sendPhoto(adminId, p.fileId, { caption, ...kb });
        else m = await tg.sendMessage(adminId, `${caption}\n\nChekni oldingi xabardan koʻring.`, kb);
        if (m && m.message_id) msgs.push({ chat: adminId, id: m.message_id });
      } catch (e) {
        console.error('Eslatmani adminga yuborib boʻlmadi:', adminId, e.message);
      }
    }
    reminders.set(p.id, { at: now(), msgs });
  }

  /** Eslatma yuborilgan toʻlovlar sonini qaytaradi. */
  async function paymentTick() {
    const every = cfg.PAY_REMIND_MIN * MIN;
    const until = cfg.PAY_REMIND_UNTIL_MIN * MIN;
    if (!(every > 0) || !admins().length) return 0;
    for (const [id, st] of [...reminders]) {
      const p = store.getPayment(id);
      if (!p || p.status !== 'pending') {
        await closeReminder(st);
        reminders.delete(id);
      }
    }
    let sent = 0;
    const t = now();
    for (const p of store.db.payments) {
      if (p.status !== 'pending') continue;
      const since = p.pendingAt || p.createdAt;
      if (until > 0 && t - since > until) continue; // juda uzoq kutilgan: tunda cheksiz xabar yubormaslik uchun toʻxtaymiz
      const st = reminders.get(p.id);
      if (t < (st ? st.at : since) + every) continue;
      await remind(p, st, Math.max(1, Math.round((t - since) / MIN)));
      sent++;
    }
    return sent;
  }

  // ---------------------------------------------------------------- 2) OpenRouter hisobi
  /** Qoldiqni (USD) qaytaradi; aniqlab boʻlmasa null. */
  async function creditTick() {
    if (!(cfg.LOW_CREDIT_USD > 0) || !admins().length || !llm || typeof llm.creditRemaining !== 'function') return null;
    const left = await llm.creditRemaining();
    if (left == null) return null;
    if (left >= cfg.LOW_CREDIT_USD) {
      if (store.getFlag('creditAlertAt')) store.setFlag('creditAlertAt', 0); // qoldiq tiklandi: keyingi pasayishda yana ogohlantiramiz
      return left;
    }
    if (now() - (store.getFlag('creditAlertAt') || 0) < 12 * 60 * MIN) return left;
    store.setFlag('creditAlertAt', now());
    const text =
      `⚠️ OpenRouter hisobida taxminan $${Math.max(0, left).toFixed(2)} qoldi (chegara: $${cfg.LOW_CREDIT_USD}).\n` +
      `Pul tugasa, bot bepul modellarga oʻtadi: tezlik va sifat pasayishi mumkin.\nToʻldirish: openrouter.ai/settings/credits`;
    for (const id of admins()) await call(() => tg.sendMessage(id, text));
    return left;
  }

  // ---------------------------------------------------------------- 3) kunlik baza nusxasi
  /** Nusxa yuborilgan boʻlsa true. force=true boʻlsa, vaqt va "bugun yuborilgan" tekshirilmaydi. */
  async function backupTick(force = false) {
    if (!cfg.BACKUP || !admins().length) return false;
    const { date, hour } = backup.localParts(cfg.TZ_OFFSET_H, now());
    if (!force && (hour < cfg.BACKUP_HOUR || store.getFlag('lastBackup') === date)) return false;
    const n = await backup.sendBackup(tg, store, admins(), { date });
    if (n > 0 && !force) store.setFlag('lastBackup', date);
    return n > 0;
  }

  // ---------------------------------------------------------------- ishga tushirish
  let timers = [];
  function start() {
    if (timers.length) return;
    const every = (fn, ms) => {
      const t = setInterval(() => fn().catch((e) => console.warn('Nazorat xatosi:', e.message)), ms);
      t.unref();
      timers.push(t);
    };
    const later = (fn, ms) => {
      const t = setTimeout(() => fn().catch((e) => console.warn('Nazorat xatosi:', e.message)), ms);
      t.unref();
      timers.push(t);
    };
    every(paymentTick, 20 * 1000);
    every(creditTick, cfg.CREDIT_CHECK_MIN * MIN);
    every(() => backupTick(false), 30 * MIN);
    later(creditTick, 2 * MIN); // ishga tushgach tez tekshiramiz (har deployda 12 soatlik cheklov saqlanadi)
    later(() => backupTick(false), 3 * MIN);
  }
  function stop() {
    timers.forEach((t) => {
      clearInterval(t);
      clearTimeout(t);
    });
    timers = [];
  }

  return { start, stop, paymentTick, creditTick, backupTick, reminders };
}

module.exports = { createWatchdog };
