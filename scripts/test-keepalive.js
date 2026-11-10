// Uyquga qarshi soʻrov (src/keepalive.js): kichik server bilan tekshiriladi, internet kerak emas.
const assert = require('assert');
const http = require('http');
const { startKeepAlive } = require('../src/keepalive');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const ok = (m) => console.log(`  ✓ ${++n}. ${m}`);

(async () => {
  let status = 200;
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ url: req.url, ua: req.headers['user-agent'] });
    res.writeHead(status);
    res.end('ok');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const logs = { log: [], warn: [] };
  const log = { log: (m) => logs.log.push(m), warn: (m) => logs.warn.push(m) };

  // 1. muntazam /healthz ga soʻrov yuboradi
  const ka = startKeepAlive({ url, everyMs: 40, log });
  await sleep(220);
  assert.ok(seen.length >= 3, `kamida 3 ta soʻrov kutilgan, ${seen.length} ta keldi`);
  assert.ok(seen.every((r) => r.url === '/healthz' && r.ua === 'slayd-bot-keepalive'));
  assert.strictEqual(logs.warn.length, 0);
  ok('har interval /healthz ga soʻrov yuboradi (oʻzini tanishtiradi)');

  // 2. xato boʻlsa jim davom etadi va faqat bir marta yozadi, tiklansa bir marta xabar beradi
  status = 500;
  await sleep(220);
  assert.strictEqual(logs.warn.length, 1, 'xato faqat bir marta yozilishi kerak');
  status = 200;
  await sleep(150);
  assert.strictEqual(logs.log.length, 1, 'tiklanganda bir marta xabar');
  ok('xatoda log toʻlib ketmaydi, tiklanganda xabar beradi');

  // 3. toʻxtatilgach soʻrov ketmaydi
  ka.stop();
  const count = seen.length;
  await sleep(150);
  assert.strictEqual(seen.length, count);
  ok('stop() dan keyin soʻrov yuborilmaydi');

  // 4. manzilga ulanib boʻlmasa ham xato otmaydi
  const bad = startKeepAlive({ url: 'http://127.0.0.1:1', everyMs: 1000, log, timeoutMs: 500 });
  await bad.ping();
  assert.ok(logs.warn.length >= 2);
  bad.stop();
  ok('ulanib boʻlmasa ham jarayon yiqilmaydi');

  server.close();
  console.log(`\nHamma tekshiruvlar yaxshi (${n} ta).`);
  process.exit(0);
})().catch((e) => {
  console.error('\n❌', e && e.stack ? e.stack : e);
  process.exit(1);
});
