// Render bepul rejasida xizmat 15 daqiqa tashqaridan HTTP soʻrov kelmasa "uxlab qoladi" va keyingi foydalanuvchi
// 30-60 soniya kutadi. Bot Telegramga yuborgan xabar bunga yordam bermaydi (u chiqish trafigi), shuning uchun
// xizmat oʻzining ochiq manziliga (Render routeri orqali) har bir necha daqiqada yengil soʻrov yuboradi.
// Eslatma: uxlab yotgan xizmatni bu uygʻota olmaydi, faqat uygʻoq xizmatni uygʻoq saqlaydi (uygʻotishni Telegram xabari qiladi).

function startKeepAlive({ url, everyMs, fetchImpl, log = console, timeoutMs = 25000 }) {
  const doFetch = fetchImpl || fetch;
  const target = String(url).replace(/\/$/, '') + '/healthz';
  let failing = false;
  let stopped = false;

  async function ping() {
    try {
      const res = await doFetch(target, { headers: { 'User-Agent': 'slayd-bot-keepalive' }, signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      if (failing) log.log('🏓 Uyquga qarshi soʻrov yana ishlayapti.');
      failing = false;
    } catch (e) {
      // har safar emas, faqat birinchi xatoda yozamiz (log toʻlib ketmasin)
      if (!failing) log.warn('⚠️  Uyquga qarshi soʻrov yetib bormadi: ' + e.message);
      failing = true;
    }
  }

  const timer = setInterval(() => {
    if (!stopped) ping();
  }, everyMs);
  timer.unref();
  return {
    ping,
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}

module.exports = { startKeepAlive };
