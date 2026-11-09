// Webhook rejimi uchun kichik HTTP server: Telegram yangilanishlarini qabul qiladi va botga uzatadi.
// Hosting (Render va h.k.) shu serverga "sogʻlom" tekshiruvi (GET /healthz) yuboradi.
// Mini App (src/web.js) berilsa, qolgan hamma soʻrovlar (sahifa, /api/*) unga uzatiladi.
const http = require('http');
const crypto = require('crypto');

const MAX_BODY = 2 * 1024 * 1024;

/** Bot tokenidan olinadigan, taxmin qilib boʻlmaydigan yoʻl va maxfiy soʻz (qoʻshimcha sozlash shart emas). */
function hooks(token) {
  const h = crypto.createHash('sha256').update('slayd-bot:' + token).digest('hex');
  return { path: '/tg/' + h.slice(0, 24), secret: h.slice(24, 56) };
}

function createServer(bot, { path, secret }, web) {
  return http.createServer((req, res) => {
    const url = String(req.url || '').split('?')[0];
    const reply = (code, text) => {
      res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(text);
    };

    const isRead = req.method === 'GET' || req.method === 'HEAD';
    if (isRead && url === '/healthz') return reply(200, 'ok');
    if (web && !(req.method === 'POST' && url === path)) return web(req, res);
    if (isRead && url === '/') return reply(200, 'ok');
    if (req.method !== 'POST' || url !== path) return reply(404, 'not found');
    if (req.headers['x-telegram-bot-api-secret-token'] !== secret) return reply(403, 'forbidden');

    let size = 0;
    const chunks = [];
    let aborted = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        aborted = true;
        reply(413, 'too large');
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      let update;
      try {
        update = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch (_) {
        return reply(400, 'bad json');
      }
      // Telegramga darrov 200 qaytaramiz (u kutib, soʻrovni takrorlamasin), ishni orqada bajaramiz
      reply(200, 'ok');
      Promise.resolve()
        .then(() => bot.handleUpdate(update))
        .catch((e) => console.error('Yangilanishni qayta ishlashda xato:', e && e.message ? e.message : e));
    });
    req.on('error', () => {});
  });
}

module.exports = { createServer, hooks };
