// Mini App uchun HTTP qismi: statik fayllar (miniapp/, assets/previews/) va /api/*. Qoʻshimcha kutubxona kerak emas.
// Webhook rejimida bot serveri (server.js) shu handlerni chaqiradi; kompyuterda (polling) alohida server ochiladi (createWebServer).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Markup } = require('telegraf');
const config = require('./config');
const { verifyInitData } = require('./webauth');
const { createOrders, profileMissing, LANGS, toPublicLang, fmt } = require('./orders');
const { PALETTES, STYLES } = require('./deck');
const { extractText, clip } = require('./extract');

const STATIC_DIR = path.join(__dirname, '..', 'miniapp');
const PREVIEW_DIR = path.join(__dirname, '..', 'assets', 'previews');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };

const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
};

class HttpError extends Error {
  constructor(code, error, message) { super(message || error); this.code = code; this.error = error; }
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooBig = false;
    const chunks = [];
    req.on('data', (c) => {
      if (tooBig) return;
      size += c.length;
      if (size > limit) { tooBig = true; chunks.length = 0; reject(new HttpError(413, 'too_large', 'Hajm juda katta.')); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!tooBig) resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

async function readJson(req, limit = 200 * 1024) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch (e) { throw new HttpError(400, 'bad_json', 'Notoʻgʻri soʻrov.'); }
}

/** Rasm turini fayl boshidagi baytlardan aniqlaydi (faqat JPEG, PNG, WEBP). */
function imageKind(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

/** Soʻrovlarni qayta ishlovchi funksiya yaratadi: (req, res) => Promise. */
function createWebHandler({ store, bot }) {
  const orders = createOrders({ store, bot });
  const hits = new Map(); // "userId:kalit" -> [vaqtlar]
  let extracting = false; // fayldan matn ajratish bir vaqtda bittadan (xotira va CPU uchun)

  function rateLimit(userId, key, max, windowMs) {
    const k = userId + ':' + key;
    const now = Date.now();
    const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) throw new HttpError(429, 'rate', 'Juda tez-tez soʻrov. Biroz kuting.');
    arr.push(now);
    hits.set(k, arr);
  }
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 120000)) hits.delete(k); }, 60000).unref();

  function authenticate(req) {
    const h = String(req.headers.authorization || '');
    if (h.startsWith('tma ')) {
      const u = verifyInitData(h.slice(4), config.BOT_TOKEN);
      if (u) return store.ensureUser(u);
    } else if (config.DEV_AUTH && req.headers['x-dev-user']) {
      const id = Number(req.headers['x-dev-user']);
      if (Number.isInteger(id) && id > 0) return store.ensureUser({ id, first_name: 'Dev' });
    }
    throw new HttpError(401, 'auth', 'Kirish tasdiqlanmadi. Ilovani Telegram ichidan oching.');
  }

  const publicOrder = (o) => ({
    id: o.id, topic: o.topic, slides: o.finalSlides || o.slides, lang: toPublicLang(o.lang), color: o.color, style: o.style || null,
    status: o.status, price: o.price, createdAt: o.createdAt, error: o.status === 'failed' ? 'Xatolik, pul qaytarildi' : undefined,
    defense: o.defenseStatus || 'none', // himoya savol-javoblari: none | processing | done | failed
  });
  const publicPayment = (p) => ({ id: p.id, amount: p.amount, status: p.status, createdAt: p.createdAt });
  const publicMe = (u) => ({ id: u.id, name: u.name, username: u.username, balance: u.balance, profile: u.profile || {}, profileMissing: profileMissing(u.profile) || null });

  async function route(req, url) {
    const m = req.method;
    const p = url.pathname;
    const user = authenticate(req);
    const uid = user.id;
    rateLimit(uid, 'all', 90, 60000);

    if (m === 'GET' && p === '/api/me') {
      return {
        user: publicMe(store.getUser(uid)),
        config: {
          flat: config.PRICE_DECK > 0, priceDeck: config.PRICE_DECK, priceSlide: config.PRICE_SLIDE, priceEdit: config.PRICE_EDIT,
          priceDefense: config.PRICE_DEFENSE, defenseQuestions: config.DEFENSE_QUESTIONS,
          minTopup: config.MIN_TOPUP, maxTopup: 5000000,
          minSlides: config.MIN_SLIDES, maxSlides: config.MAX_SLIDES, maxLecture: config.MAX_LECTURE_CHARS, maxExtract: config.MAX_EXTRACT_BYTES,
          langs: LANGS, colors: Object.entries(PALETTES).map(([k, v]) => ({ key: k, label: v.label, hex: v.accent, dark: v.dark, soft: v.soft, tint: v.tint })),
          styles: STYLES.map((s) => ({ key: s.key, name: s.name })),
        },
      };
    }

    if (m === 'PUT' && p === '/api/profile') {
      const b = await readJson(req);
      const patch = {};
      for (const k of ['fullName', 'group', 'university', 'faculty']) {
        const v = String(b[k] == null ? '' : b[k]).replace(/\s+/g, ' ').trim().slice(0, 80);
        if (v) patch[k] = v;
      }
      if (!Object.keys(patch).length) throw new HttpError(400, 'invalid', 'Maydonlarni toʻldiring.');
      store.setProfile(uid, patch);
      return { user: publicMe(store.getUser(uid)) };
    }

    if (m === 'POST' && p === '/api/extract') {
      rateLimit(uid, 'extract', 10, 60000);
      if (extracting) throw new HttpError(429, 'busy', 'Boshqa fayl oʻqilmoqda. Biroz kuting.');
      const b = await readJson(req, Math.ceil(config.MAX_EXTRACT_BYTES * 1.4) + 4096);
      const name = String(b.name || '');
      const buf = Buffer.from(String(b.data || ''), 'base64');
      if (!buf.length || buf.length > config.MAX_EXTRACT_BYTES) {
        throw new HttpError(400, 'invalid', `Fayl boʻsh yoki ${Math.round(config.MAX_EXTRACT_BYTES / 1048576)} MB dan katta.`);
      }
      extracting = true;
      let text;
      try { text = await extractText(buf, name); } catch (e) { throw new HttpError(400, 'invalid', e.message); } finally { extracting = false; }
      if (text.length < 20) throw new HttpError(400, 'invalid', 'Fayldan matn topilmadi.');
      const c = clip(text);
      return { text: c.text, clipped: c.clipped, chars: c.text.length };
    }

    if (m === 'POST' && p === '/api/orders') {
      rateLimit(uid, 'order', 12, 60000);
      const b = await readJson(req, 400 * 1024);
      const r = orders.placeDeck(uid, b);
      if (r.code !== 200) throw Object.assign(new HttpError(r.code, r.body.error, r.body.message), { extra: r.body });
      return r.body;
    }

    if (m === 'GET' && p === '/api/orders') {
      const list = store.db.orders.filter((o) => o.userId === uid && o.type === 'deck').slice(-40).reverse().map(publicOrder);
      return { orders: list, balance: store.getUser(uid).balance };
    }

    let mm = p.match(/^\/api\/orders\/(\d+)\/send$/);
    if (m === 'POST' && mm) {
      rateLimit(uid, 'send', 6, 60000);
      let r;
      try { r = await orders.resend(uid, Number(mm[1])); } catch (e) { throw new HttpError(502, 'send_failed', 'Chatga yuborib boʻlmadi. Botni bloklamaganingizni tekshiring.'); }
      if (r.code !== 200) throw Object.assign(new HttpError(r.code, r.body.error, r.body.message), { extra: r.body });
      return r.body;
    }

    mm = p.match(/^\/api\/orders\/(\d+)\/defense$/);
    if (mm && (m === 'POST' || m === 'GET')) {
      let r;
      if (m === 'POST') { rateLimit(uid, 'defense', 10, 60000); r = orders.placeDefense(uid, Number(mm[1])); } else r = orders.defenseView(uid, Number(mm[1]));
      if (r.code !== 200) throw Object.assign(new HttpError(r.code, r.body.error, r.body.message), { extra: r.body });
      return r.body;
    }

    if (m === 'GET' && p === '/api/payments') {
      const list = store.db.payments.filter((x) => x.userId === uid).slice(-20).reverse().map(publicPayment);
      const ledger = store.db.ledger.filter((x) => x.userId === uid).slice(-30).reverse().map((x) => ({ id: x.id, type: x.type, amount: x.amount, note: x.note, ts: x.ts }));
      return { payments: list, ledger, balance: store.getUser(uid).balance };
    }

    if (m === 'POST' && p === '/api/topup') {
      rateLimit(uid, 'topup', 8, 60000);
      const b = await readJson(req);
      const amount = Number(b.amount);
      if (!Number.isInteger(amount) || amount < config.MIN_TOPUP || amount > 5000000) {
        throw new HttpError(400, 'invalid', `Summa ${fmt(config.MIN_TOPUP)} dan 5 000 000 soʻmgacha boʻlishi kerak.`);
      }
      const waiting = store.db.payments.filter((x) => x.userId === uid && x.status === 'waiting_receipt');
      if (waiting.length >= 5) throw new HttpError(429, 'too_many', 'Chek yuborilmagan toʻlovlar koʻp. Avval ularni yakunlang.');
      const pay = store.addPayment({ userId: uid, amount, source: 'miniapp' });
      return { paymentId: pay.id, amount, card: config.CARD_NUMBER, holder: config.CARD_HOLDER };
    }

    mm = p.match(/^\/api\/payments\/(\d+)\/receipt$/);
    if (m === 'POST' && mm) {
      rateLimit(uid, 'receipt', 6, 60000);
      const pay = store.getPayment(mm[1]);
      if (!pay || pay.userId !== uid) throw new HttpError(404, 'not_found', 'Toʻlov topilmadi.');
      if (pay.status !== 'waiting_receipt') throw new HttpError(409, 'state', 'Bu toʻlov uchun chek allaqachon yuborilgan.');
      const b = await readJson(req, 8 * 1024 * 1024);
      const mt = String(b.data || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!mt) throw new HttpError(400, 'invalid', 'Chek rasm (JPG, PNG yoki WEBP) boʻlishi kerak.');
      const buf = Buffer.from(mt[2], 'base64');
      if (buf.length < 500 || buf.length > 5 * 1024 * 1024 || !imageKind(buf)) throw new HttpError(400, 'invalid', 'Rasm hajmi yoki turi notoʻgʻri (JPG, PNG, WEBP, 5 MB gacha).');
      if (!config.ADMIN_IDS.length) {
        console.warn('ADMIN_IDS sozlanmagan: toʻlovni tasdiqlovchi yoʻq!');
        throw new HttpError(503, 'no_admin', 'Hozircha toʻlovni qabul qilib boʻlmaydi. Birozdan keyin urinib koʻring.');
      }
      // admin tugmani bosishidan oldin holat "pending" boʻlishi kerak; hech bir adminga yetmasa, qaytaramiz
      store.updatePayment(pay.id, { status: 'pending', kind: 'photo' });
      const u = store.getUser(uid);
      const caption = `💳 To'lov #${pay.id} (Mini App)\nFoydalanuvchi: ${u.name} ${u.username ? '@' + u.username : ''} (ID ${u.id})\nSumma: ${fmt(pay.amount)}`;
      const kb = Markup.inlineKeyboard([[Markup.button.callback('✅ Tasdiqlash', `pay:ok:${pay.id}`), Markup.button.callback('❌ Rad etish', `pay:no:${pay.id}`)]]);
      let delivered = 0;
      for (const adminId of config.ADMIN_IDS) {
        try { await bot.telegram.sendPhoto(adminId, { source: buf }, { caption, ...kb }); delivered++; } catch (e) { console.error('Adminga yuborib boʻlmadi:', adminId, e.message); }
      }
      if (!delivered) {
        store.updatePayment(pay.id, { status: 'waiting_receipt' });
        throw new HttpError(502, 'send_failed', 'Chekni adminga yuborib boʻlmadi. Birozdan keyin qayta urinib koʻring.');
      }
      return { ok: true };
    }

    throw new HttpError(404, 'not_found', 'Topilmadi.');
  }

  function sendJson(res, code, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC_HEADERS });
    res.end(body);
  }

  function notFound(res) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SEC_HEADERS });
    res.end('Topilmadi');
  }

  function serveStatic(res, pathname) {
    let rel = pathname === '/' || pathname === '/app' ? '/index.html' : pathname;
    try { rel = decodeURIComponent(rel); } catch (e) { return notFound(res); }
    let root = STATIC_DIR;
    if (rel.startsWith('/previews/')) { root = PREVIEW_DIR; rel = rel.slice('/previews'.length); }
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return notFound(res);
    const type = MIME[path.extname(file)];
    if (!type) return notFound(res);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': root === PREVIEW_DIR ? 'public, max-age=3600' : 'no-cache', ...SEC_HEADERS });
    fs.createReadStream(file).pipe(res);
  }

  return async function handle(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return sendJson(res, 200, await route(req, url));
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method' });
      return serveStatic(res, url.pathname);
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.code === 413) res.once('finish', () => req.destroy()); // katta soʻrovning qolgan qismini kutmaymiz
        return sendJson(res, e.code, { error: e.error, message: e.message, ...(e.extra || {}) });
      }
      console.error('Veb-server xatosi:', e);
      return sendJson(res, 500, { error: 'server', message: 'Ichki xatolik.' });
    }
  };
}

/** Kompyuterda (polling rejimida) alohida server. */
function createWebServer(deps) {
  const handler = createWebHandler(deps);
  const server = http.createServer(handler);
  server.handler = handler; // boshqa serverga ulash uchun: handler(req, res)
  return server;
}

module.exports = { createWebHandler, createWebServer, imageKind };
