// Mini App serverini tekshiradi (kalitsiz, sinov rejimida). Ishga tushirish: npm run test:web
process.env.MOCK_AI = '1';
process.env.BOT_TOKEN = '123456:TESTTOKEN';
process.env.ADMIN_IDS = '999';
process.env.PRICE_DECK = '5000';
process.env.MAX_EXTRACT_BYTES = '1000';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'web-'));
process.env.DATA_DIR = tmp;
process.env.TMP_DIR = path.join(tmp, 'tmp');

const config = require('../src/config');
const { Store } = require('../src/store');
const { createWebServer } = require('../src/web');
const { signInitData, verifyInitData } = require('../src/webauth');

const calls = [];
let photoFails = false;
const bot = { telegram: {
  sendDocument: async (...a) => { calls.push(['doc', a[0], a[1].filename]); },
  sendMessage: async (id, text) => { calls.push(['msg', id, text]); },
  sendPhoto: async (id, p, extra) => { if (photoFails) throw new Error('chat not found'); calls.push(['photo', id, extra.caption, JSON.stringify(extra.reply_markup)]); },
} };
const store = new Store(config.DATA_DIR);
const server = createWebServer({ store, bot });

const auth = (id, extra) => 'tma ' + signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAA', user: { id, first_name: 'Ali', username: 'ali' }, ...(extra || {}) }, config.BOT_TOKEN);

let port;
function call(method, url, { headers, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: url, method, headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...(headers || {}) } }, (res) => {
      let s = ''; res.on('data', (c) => (s += c));
      res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch (e) {} resolve({ code: res.statusCode, json: j, text: s, headers: res.headers }); });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
async function t(name, fn) { try { await fn(); ok++; console.log('✓', name); } catch (e) { console.error('✗', name, '\n  ', e.message); process.exitCode = 1; } }

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  const A = { authorization: auth(1001) };

  await t('imzo tekshiruvi: toʻgʻri, notoʻgʻri, eskirgan', async () => {
    const good = auth(5).slice(4);
    assert.strictEqual(verifyInitData(good, config.BOT_TOKEN).id, 5);
    assert.strictEqual(verifyInitData(good, 'boshqa:token'), null);
    assert.strictEqual(verifyInitData(good.replace('Ali', 'Vali'), config.BOT_TOKEN), null);
    const old = signInitData({ auth_date: String(Math.floor(Date.now() / 1000) - 3 * 86400), user: { id: 5 } }, config.BOT_TOKEN);
    assert.strictEqual(verifyInitData(old, config.BOT_TOKEN), null);
  });
  await t('kirishsiz va soxta kirish rad etiladi', async () => {
    assert.strictEqual((await call('GET', '/api/me')).code, 401);
    assert.strictEqual((await call('GET', '/api/me', { headers: { authorization: 'tma hash=00&user=%7B%22id%22%3A1%7D' } })).code, 401);
    assert.strictEqual((await call('GET', '/api/me', { headers: { 'x-dev-user': '7' } })).code, 401, 'DEV_AUTH oʻchiq boʻlsa ishlamasligi kerak');
  });
  await t('/api/me: foydalanuvchi, narxlar, tillar, ranglar', async () => {
    const r = await call('GET', '/api/me', { headers: A });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(r.json.user.balance, 0);
    assert.strictEqual(r.json.user.profileMissing, 'fullName');
    assert.deepStrictEqual(r.json.config.langs, ['uz', 'uzc', 'ru', 'qq'], 'API shartnomasi: til kodi qq');
    assert.ok(r.json.config.colors.every((x) => x.dark && x.soft && x.tint && x.hex));
    assert.ok(r.json.config.colors.length >= 6 && r.json.config.flat === true && r.json.config.priceDeck === 5000);
    assert.strictEqual(r.json.config.styles.length, 20);
    assert.ok(r.json.config.styles.every((x) => x.key && x.name));
  });
  await t('profilsiz buyurtma 400, balanssiz 402', async () => {
    const body = { topic: 'Til va nutq', slides: 8, lang: 'uz', color: 'blue' };
    assert.strictEqual((await call('POST', '/api/orders', { headers: A, body })).json.error, 'profile');
    const p = await call('PUT', '/api/profile', { headers: A, body: { fullName: 'Ali Valiyev', group: '101', university: 'OʻzDJTU', faculty: 'Filologiya' } });
    assert.strictEqual(p.json.user.profileMissing, null);
    const r = await call('POST', '/api/orders', { headers: A, body });
    assert.strictEqual(r.code, 402);
    assert.strictEqual(r.json.need, 5000, 'bir xil narx: slayd soniga bogʻliq emas');
  });
  await t('notoʻgʻri maʼlumotlar rad etiladi', async () => {
    store.credit(1001, 500000, 'sinov', 'topup');
    for (const body of [{ topic: 'a', slides: 8, lang: 'uz', color: 'blue' }, { topic: 'Mavzu', slides: 3, lang: 'uz', color: 'blue' }, { topic: 'Mavzu', slides: 8, lang: 'xx', color: 'blue' }, { topic: 'Mavzu', slides: 8, lang: 'uz', color: 'pink' }, { topic: 'Mavzu', slides: 8.5, lang: 'uz', color: 'blue' }, { topic: 'Mavzu', slides: 8, lang: 'xx', color: 'blue' }, { topic: 'Mavzu', slides: 8, lang: 'uz', color: 'blue', style: 'yoq-uslub' }]) {
      assert.strictEqual((await call('POST', '/api/orders', { headers: A, body })).code, 400, JSON.stringify(body));
    }
    assert.strictEqual(store.getUser(1001).balance, 500000, 'pul yechilmasligi kerak');
  });
  let orderId;
  await t('buyurtma: pul yechiladi, tayyor boʻladi, fayllar chatga ketadi', async () => {
    const r = await call('POST', '/api/orders', { headers: A, body: { topic: 'Qoraqalpoq tili', slides: 8, lang: 'qq', color: 'green', style: 'akademik' } });
    assert.strictEqual(r.code, 200, JSON.stringify(r.json));
    orderId = r.json.orderId;
    assert.strictEqual(r.json.price, 5000);
    assert.strictEqual(r.json.balance, 500000 - 5000);
    const again = await call('POST', '/api/orders', { headers: A, body: { topic: 'Boshqa', slides: 8, lang: 'uz', color: 'blue' } });
    assert.strictEqual(again.code, 409, 'ikkinchisi kutishi kerak');
    for (let i = 0; i < 60; i++) { const l = await call('GET', '/api/orders', { headers: A }); if (l.json.orders[0].status !== 'processing') break; await sleep(500); }
    const l = await call('GET', '/api/orders', { headers: A });
    assert.strictEqual(l.json.orders[0].status, 'done', JSON.stringify(l.json.orders[0]));
    assert.ok(calls.some((c) => c[0] === 'doc' && c[1] === 1001 && c[2].endsWith('.pptx')), 'pptx yuborilishi kerak');
    assert.ok(l.json.orders[0].slides >= 5);
    assert.strictEqual(l.json.orders[0].style, 'akademik');
    assert.strictEqual(store.getOrder(orderId).style, 'akademik');
    assert.strictEqual(store.getOrder(orderId).lang, 'kaa', 'ichkarida qoraqalpoq kodi kaa');
    assert.strictEqual(l.json.orders[0].lang, 'qq', 'tashqarida shartnoma kodi qq');
    const done = store.getOrder(orderId);
    assert.ok(done.price > 0 && done.price <= 5000 && store.getUser(1001).balance === 500000 - done.price, 'toʻlangandan ortiq qaytarilmagan boʻlishi kerak');
  });
  await t('qayta yuborish: faqat oʻziniki, tez-tez emas', async () => {
    const n0 = calls.length;
    const r = await call('POST', `/api/orders/${orderId}/send`, { headers: A });
    assert.strictEqual(r.code, 200, JSON.stringify(r.json));
    assert.ok(calls.length > n0);
    assert.strictEqual((await call('POST', `/api/orders/${orderId}/send`, { headers: A })).code, 429);
    assert.strictEqual((await call('POST', `/api/orders/${orderId}/send`, { headers: { authorization: auth(2002) } })).code, 404);
  });
  await t('boshqa foydalanuvchi buyurtmalarini koʻrmaydi', async () => {
    const r = await call('GET', '/api/orders', { headers: { authorization: auth(2002) } });
    assert.strictEqual(r.json.orders.length, 0);
  });
  await t('balans toʻldirish: summa tekshiriladi, chek adminga ketadi', async () => {
    const B = { authorization: auth(3003) };
    assert.strictEqual((await call('POST', '/api/topup', { headers: B, body: { amount: 5 } })).code, 400);
    const r = await call('POST', '/api/topup', { headers: B, body: { amount: 50000 } });
    assert.strictEqual(r.code, 200);
    assert.ok(r.json.card);
    const bad = await call('POST', `/api/payments/${r.json.paymentId}/receipt`, { headers: B, body: { data: 'data:text/html;base64,AAAA' } });
    assert.strictEqual(bad.code, 400);
    const png = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2000, 1)]).toString('base64');
    const fake = 'data:image/png;base64,' + Buffer.alloc(2000, 1).toString('base64');
    assert.strictEqual((await call('POST', `/api/payments/${r.json.paymentId}/receipt`, { headers: B, body: { data: fake } })).code, 400, 'rasm sarlavhasi tekshirilishi kerak');
    assert.strictEqual((await call('POST', `/api/payments/${r.json.paymentId}/receipt`, { headers: { authorization: auth(1001) }, body: { data: png } })).code, 404, 'boshqaning toʻlovi');
    // adminga yetib bormasa: toʻlov qotib qolmaydi, qayta yuborish mumkin
    photoFails = true;
    const fail1 = await call('POST', `/api/payments/${r.json.paymentId}/receipt`, { headers: B, body: { data: png } });
    assert.strictEqual(fail1.code, 502);
    assert.strictEqual(store.getPayment(r.json.paymentId).status, 'waiting_receipt');
    photoFails = false;
    const ok1 = await call('POST', `/api/payments/${r.json.paymentId}/receipt`, { headers: B, body: { data: png } });
    assert.strictEqual(ok1.code, 200);
    assert.strictEqual(store.getPayment(r.json.paymentId).status, 'pending');
    const ph = calls.find((c) => c[0] === 'photo' && c[1] === 999);
    assert.ok(ph && ph[3].includes(`pay:ok:${r.json.paymentId}`), 'tasdiqlash tugmasi admin uchun');
    assert.strictEqual((await call('POST', `/api/payments/${r.json.paymentId}/receipt`, { headers: B, body: { data: png } })).code, 409, 'ikkinchi marta yuborib boʻlmaydi');
    assert.strictEqual(store.approvePayment(r.json.paymentId, 999).status, 'approved');
    assert.strictEqual((await call('GET', '/api/me', { headers: B })).json.user.balance, 50000);
  });
  await t('matn fayldan ajratiladi', async () => {
    const text = 'Til — fikr almashish quroli. '.repeat(10);
    const r = await call('POST', '/api/extract', { headers: A, body: { name: 'maruza.txt', data: Buffer.from(text).toString('base64') } });
    assert.strictEqual(r.code, 200);
    assert.ok(r.json.text.startsWith('Til'));
    assert.strictEqual((await call('POST', '/api/extract', { headers: A, body: { name: 'a.exe', data: 'AAAA' } })).code, 400);
    const big = await call('POST', '/api/extract', { headers: A, body: { name: 'katta.txt', data: Buffer.alloc(2000, 97).toString('base64') } });
    assert.strictEqual(big.code, 400, 'MAX_EXTRACT_BYTES dan katta fayl rad etilishi kerak');
  });
  await t('statik fayllar va xavfsizlik', async () => {
    const idx = await call('GET', '/');
    assert.strictEqual(idx.code, 200);
    assert.ok(/telegram-web-app/.test(idx.text));
    assert.ok(idx.headers['content-security-policy']);
    assert.strictEqual((await call('GET', '/..%2f.env')).code, 404);
    assert.strictEqual((await call('GET', '/../.env')).code, 404);
    assert.strictEqual((await call('GET', '/%E0%A4%A')).code, 404, 'buzuq % manzil 500 emas, 404 boʻlishi kerak');
    const pv = await call('GET', '/previews/green.jpg');
    assert.strictEqual(pv.code, 200);
    assert.strictEqual(pv.headers['content-type'], 'image/jpeg');
    assert.strictEqual((await call('GET', '/previews/..%2fsrc%2fconfig.js')).code, 404);
    assert.strictEqual((await call('GET', '/previews/yoq.jpg')).code, 404);
    const huge = await call('PUT', '/api/profile', { headers: A, body: { fullName: 'x'.repeat(400 * 1024) } });
    assert.strictEqual(huge.code, 413);
  });
  await t('tarix va balans yozuvlari (ledger)', async () => {
    const r = await call('GET', '/api/payments', { headers: A });
    assert.ok(r.json.ledger.some((x) => x.type === 'charge'));
  });
  await t('bitta server: webhook, healthz va mini ilova birga ishlaydi', async () => {
    const { createServer, hooks } = require('../src/server');
    const { createWebHandler } = require('../src/web');
    const updates = [];
    const hk = hooks(config.BOT_TOKEN);
    const one = createServer({ handleUpdate: async (u) => updates.push(u) }, hk, createWebHandler({ store, bot }));
    await new Promise((r) => one.listen(0, '127.0.0.1', r));
    const saved = port;
    port = one.address().port;
    try {
      assert.strictEqual((await call('GET', '/healthz')).text, 'ok');
      assert.ok(/telegram-web-app/.test((await call('GET', '/')).text), 'bosh sahifa mini ilova boʻlishi kerak');
      assert.strictEqual((await call('GET', '/api/me')).code, 401);
      assert.strictEqual((await call('POST', hk.path, { body: { update_id: 1 } })).code, 403, 'maxfiy soʻzsiz webhook rad etiladi');
      assert.strictEqual((await call('POST', hk.path, { headers: { 'x-telegram-bot-api-secret-token': hk.secret }, body: { update_id: 7 } })).code, 200);
      await sleep(50);
      assert.deepStrictEqual(updates, [{ update_id: 7 }], 'Telegram yangilanishi botga yetdi');
      assert.strictEqual((await call('POST', '/api/orders', { body: {} })).code, 401);
    } finally {
      port = saved;
      one.close();
    }
  });
  server.close();
  console.log(process.exitCode ? '\nXato bor' : `\nHammasi joyida (${ok} ta tekshiruv)`);
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('✗', e); process.exit(1); });
