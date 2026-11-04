// Webhook serverini Telegramsiz sinaydi. Ishga tushirish: npm run test:webhook
const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-'));
process.env.MOCK_AI = '1';
process.env.BOT_TOKEN = '1:test';
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.TMP_DIR = path.join(tmp, 'tmp');

const config = require('../src/config');
const { Store } = require('../src/store');
const { createBot } = require('../src/bot');
const { createServer, hooks } = require('../src/server');

const calls = [];
require('telegraf').Telegram.prototype.callApi = async function (method, data) {
  calls.push({ method, data });
  return method === 'sendMessage' ? { message_id: 1, chat: { id: data.chat_id }, date: 0 } : true;
};

const bot = createBot({ store: new Store(config.DATA_DIR) });
bot.botInfo = { id: 1, is_bot: true, first_name: 'Test', username: 'test_bot' };
const h = hooks('1:test');

function req(port, method, url, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: url, headers }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const ok = (s) => console.log(`  ✓ ${++n}. ${s}`);

const server = createServer(bot, h);
server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const update = JSON.stringify({
    update_id: 1,
    message: { message_id: 1, from: { id: 100, is_bot: false, first_name: 'A' }, chat: { id: 100, type: 'private' }, date: 0, text: '/start', entities: [{ type: 'bot_command', offset: 0, length: 6 }] },
  });
  const good = { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': h.secret };
  try {
    console.log('Webhook serveri:');

    assert.ok(/^\/tg\/[0-9a-f]{24}$/.test(h.path));
    assert.ok(/^[A-Za-z0-9_-]{1,256}$/.test(h.secret), 'Telegram qabul qiladigan maxfiy soʻz');
    assert.notStrictEqual(hooks('2:other').path, h.path);
    ok('yoʻl va maxfiy soʻz tokenga bogʻliq, Telegram talabiga mos');

    let r = await req(port, 'GET', '/healthz');
    assert.strictEqual(r.status, 200);
    r = await req(port, 'GET', '/');
    assert.strictEqual(r.status, 200);
    ok('GET / va /healthz 200 qaytaradi (hosting tekshiruvi uchun)');

    r = await req(port, 'POST', h.path, { headers: { 'Content-Type': 'application/json' }, body: update });
    assert.strictEqual(r.status, 403);
    r = await req(port, 'POST', h.path, { headers: { ...good, 'x-telegram-bot-api-secret-token': 'x' }, body: update });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(calls.length, 0);
    ok('maxfiy soʻzsiz yoki notoʻgʻri soʻz bilan yuborilgan soʻrov rad etiladi, bot ishlamaydi');

    r = await req(port, 'POST', '/tg/boshqa', { headers: good, body: update });
    assert.strictEqual(r.status, 404);
    ok('notoʻgʻri yoʻl 404');

    r = await req(port, 'POST', h.path, { headers: good, body: '{bu json emas' });
    assert.strictEqual(r.status, 400);
    ok('buzuq JSON 400, server yiqilmaydi');

    r = await req(port, 'POST', h.path, { headers: good, body: update });
    assert.strictEqual(r.status, 200);
    for (let i = 0; i < 50 && !calls.some((c) => c.method === 'sendMessage'); i++) await sleep(50);
    const sent = calls.find((c) => c.method === 'sendMessage');
    assert.ok(sent && sent.data.chat_id === 100 && /Salom/.test(sent.data.text), 'bot /start ga javob berishi kerak');
    ok('toʻgʻri soʻrov botga yetadi va /start ga javob qaytadi');

    r = await req(port, 'POST', h.path, { headers: good, body: 'x'.repeat(3 * 1024 * 1024) }).catch((e) => ({ status: 'closed:' + e.code }));
    assert.ok(r.status === 413 || String(r.status).startsWith('closed'), 'juda katta soʻrov rad etiladi: ' + r.status);
    ok('juda katta soʻrov rad etiladi');

    // handler xato bersa ham server ishlashda davom etadi
    const orig = bot.handleUpdate;
    bot.handleUpdate = async () => {
      throw new Error('sinov xatosi');
    };
    const before = console.error;
    let logged = '';
    console.error = (...a) => (logged += a.join(' '));
    r = await req(port, 'POST', h.path, { headers: good, body: update });
    await sleep(100);
    console.error = before;
    bot.handleUpdate = orig;
    assert.strictEqual(r.status, 200);
    assert.ok(/sinov xatosi/.test(logged));
    r = await req(port, 'GET', '/healthz');
    assert.strictEqual(r.status, 200);
    ok('qayta ishlashdagi xato jarayonni oʻldirmaydi');

    console.log('\nHAMMASI TOʻGʻRI ✅');
  } catch (e) {
    console.error('\n✗ XATO:', e && e.stack ? e.stack : e);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
