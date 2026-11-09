// Ombor (fayl va Supabase), bir xil narxdagi qaytarish va ikki kanal (bot + mini ilova) uchun band tekshiruvi.
// Haqiqiy Supabase kerak emas: unga oʻxshash kichik soxta server (PostgREST) ishga tushiriladi.
process.env.MOCK_AI = '1';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'store-'));
process.env.DATA_DIR = tmp();
process.env.PRICE_DECK = '5000';
const config = require('../src/config');
const { Store } = require('../src/store');
const { SupabaseBackend, createBackend } = require('../src/supabase');
const service = require('../src/service');

let n = 0;
const ok = (m) => console.log(`  ✓ ${++n}. ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- soxta Supabase (PostgREST): bitta jadval, upsert va sahifalab oʻqish
function fakeSupabase({ key, failNext = { n: 0 } } = {}) {
  const rows = new Map(); // 'kind:id' -> row
  const log = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    log.push({ method: req.method, path: url.pathname + url.search, headers: req.headers });
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
    if (req.headers.apikey !== key) return send(401, { message: 'Invalid API key' });
    if (failNext.n > 0) { failNext.n--; return send(503, { message: 'down' }); }
    if (url.pathname !== '/rest/v1/bot_docs') return send(404, {});
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.method === 'POST') {
        assert.strictEqual(url.searchParams.get('on_conflict'), 'kind,id');
        assert.ok(/resolution=merge-duplicates/.test(req.headers.prefer || ''));
        for (const r of JSON.parse(body)) rows.set(r.kind + ':' + r.id, r);
        return send(201);
      }
      if (req.method === 'GET') {
        const limit = Number(url.searchParams.get('limit'));
        const offset = Number(url.searchParams.get('offset'));
        const all = [...rows.values()].sort((a, b) => (a.kind + '\0' + a.id < b.kind + '\0' + b.id ? -1 : 1));
        return send(200, all.slice(offset, offset + limit).map(({ kind, id, data }) => ({ kind, id, data })));
      }
      send(405, {});
    });
  });
  return { server, rows, log, failNext };
}
const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${s.address().port}`)));

(async () => {
  // 1. bir xil narx: kam slayd chiqqanda ortiqcha qaytarilmaydi
  const R = (slides, price, final) => service.shortfallRefund({ slides, price }, final);
  assert.strictEqual(R(12, 5000, 12), 0);
  assert.strictEqual(R(12, 5000, 11), 0, '1-2 ta kam: qaytarilmaydi');
  assert.strictEqual(R(12, 5000, 9), 1300);
  assert.ok(R(12, 5000, 1) <= 5000, 'toʻlangandan koʻp qaytarilmaydi');
  assert.ok(R(30, 5000, 3) <= 5000);
  config.PRICE_DECK = 0;
  assert.strictEqual(R(12, 60000, 10), 10000, 'slayd boshiga narxda har bir kam slayd qaytariladi');
  assert.ok(R(12, 5000, 1) <= 5000, 'bu holatda ham toʻlangandan koʻp emas');
  config.PRICE_DECK = 5000;
  ok('kam slayd chiqqanda qaytariladigan pul: toʻlangandan hech qachon koʻp emas');

  // 2. hasProcessing: bot buyurtmasi ham, mini ilova buyurtmasi ham bir xil koʻrinadi
  const s0 = new Store(tmp());
  s0.ensureUser({ id: 1, first_name: 'A' });
  assert.strictEqual(s0.hasProcessing(1), false);
  const o = s0.addOrder({ userId: 1, type: 'deck', slides: 8, price: 5000 });
  assert.strictEqual(s0.hasProcessing(1), true);
  s0.updateOrder(o.id, { status: 'done' });
  assert.strictEqual(s0.hasProcessing(1), false);
  ok('hasProcessing: tayyorlanayotgan buyurtma bor-yoʻqligi');

  // 3. backend: yozish, oʻqish, tartib va hisoblagichlar
  const KEY = 'sb_secret_testkey';
  const fake = fakeSupabase({ key: KEY });
  const base = await listen(fake.server);
  const mk = () => new Store(tmp(), { backend: new SupabaseBackend({ url: base + '/', key: KEY }) });
  const a = mk();
  await a.init();
  a.ensureUser({ id: 7, first_name: 'Ali', username: 'ali' });
  a.setProfile(7, { fullName: 'Ali Valiyev', group: '101' });
  a.credit(7, 50000, 'sinov', 'topup');
  const order = a.addOrder({ userId: 7, type: 'deck', topic: 'Mavzu', slides: 8, price: 5000 });
  assert.ok(a.charge(7, 5000, 'Taqdimot'));
  a.updateOrder(order.id, { status: 'done', deck: { title: 'T', slides: [{ layout: 'cards', title: 'x' }] } });
  const pay = a.addPayment({ userId: 7, amount: 20000 });
  a.updatePayment(pay.id, { status: 'pending' });
  assert.ok(a.approvePayment(pay.id, 99));
  assert.ok(await a.flush(), 'hammasi yozilgan boʻlishi kerak');
  ok('oʻzgarishlar Supabasega yoziladi (foydalanuvchi, buyurtma, toʻlov, daftar)');

  const b = mk();
  await b.init();
  assert.strictEqual(b.getUser(7).balance, 50000 - 5000 + 20000);
  assert.strictEqual(b.getUser(7).profile.fullName, 'Ali Valiyev');
  assert.strictEqual(b.getOrder(order.id).status, 'done');
  assert.strictEqual(b.getOrder(order.id).deck.slides[0].layout, 'cards');
  assert.strictEqual(b.getPayment(pay.id).status, 'approved');
  assert.strictEqual(b.db.ledger.length, a.db.ledger.length);
  assert.ok(b.db.seq.ledger >= a.db.seq.ledger && b.db.seq.order === a.db.seq.order && b.db.seq.payment === a.db.seq.payment);
  const next = b.addOrder({ userId: 7, type: 'deck' });
  assert.ok(next.id > order.id, 'yangi id eskisidan katta (restartdan keyin ham)');
  ok('qayta ishga tushganda hammasi tiklanadi: balans, profil, buyurtma, toʻlov, hisoblagichlar');

  // 4. kalit: yangi (sb_secret_) — faqat apikey; eski (JWT) — Authorization ham
  assert.ok(fake.log.every((r) => r.headers.apikey === KEY && !r.headers.authorization), 'sb_secret_ kalit Authorization ga qoʻyilmaydi');
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abc';
  const fake2 = fakeSupabase({ key: jwt });
  const base2 = await listen(fake2.server);
  const c = new Store(tmp(), { backend: new SupabaseBackend({ url: base2 + '/rest/v1', key: jwt }) });
  await c.init();
  c.ensureUser({ id: 1, first_name: 'X' });
  assert.ok(await c.flush());
  assert.ok(fake2.log.some((r) => r.method === 'POST' && r.headers.authorization === 'Bearer ' + jwt), 'JWT kalit Authorization bilan ketadi');
  ok('kalit turi: sb_secret_ va eski JWT service_role ikkalasi ishlaydi, URL oxiridagi /rest/v1 ham boʻladi');

  // 5. xato kalit: oʻqib boʻlmasa, bot boʻsh ombor bilan ishga tushmaydi
  const bad = new Store(tmp(), { backend: new SupabaseBackend({ url: base, key: 'notogri' }) });
  await assert.rejects(() => bad.init(), /Supabase/);
  ok('notoʻgʻri kalit: init xato beradi (boʻsh ombor bilan davom etmaydi)');

  // 6. vaqtinchalik uzilish: yozuv yoʻqolmaydi, qayta uriniladi
  const d = mk();
  await d.init();
  fake.failNext.n = 2;
  d.ensureUser({ id: 55, first_name: 'Vali' });
  d.credit(55, 1000, 'sinov', 'topup');
  assert.ok(await d.flush(), 'uzilishdan keyin ham yoziladi');
  assert.ok(fake.rows.has('user:55') && fake.rows.get('user:55').data.balance === 1000);
  ok('Supabase vaqtincha ishlamasa, oʻzgarish yoʻqolmaydi va keyin yoziladi');

  // 7. ketma-ket tez oʻzgarishlar (yozish paytida yana oʻzgarish) yoʻqolmaydi
  const e = mk();
  await e.init();
  e.ensureUser({ id: 90, first_name: 'Z' });
  for (let i = 0; i < 30; i++) e.credit(90, 100, 'x', 'topup');
  const p1 = e.flush();
  for (let i = 0; i < 20; i++) e.credit(90, 100, 'y', 'topup');
  await p1;
  assert.ok(await e.flush());
  assert.strictEqual(fake.rows.get('user:90').data.balance, 5000);
  assert.strictEqual([...fake.rows.keys()].filter((k) => k.startsWith('ledger:')).length >= 50, true);
  ok('yozish paytida kelgan oʻzgarishlar ham saqlanadi (50 ta pul harakati)');

  // 8. katta maʼlumot sahifalab oʻqiladi (1000 tadan)
  const big = mk();
  await big.init();
  for (let i = 1; i <= 1250; i++) big.ensureUser({ id: 10000 + i, first_name: 'U' + i });
  assert.ok(await big.flush());
  const back = mk();
  await back.init();
  assert.ok(Object.keys(back.db.users).length >= 1250);
  ok('1250+ yozuv sahifalab oʻqiladi');

  // 9. backend boʻsh, mahalliy maʼlumot bor: koʻchiriladi
  const dir = tmp();
  const local = new Store(dir);
  local.ensureUser({ id: 321, first_name: 'Eski' });
  local.credit(321, 7000, 'eski', 'topup');
  const fake3 = fakeSupabase({ key: KEY });
  const base3 = await listen(fake3.server);
  const mig = new Store(dir, { backend: new SupabaseBackend({ url: base3, key: KEY }) });
  await mig.init();
  assert.strictEqual(fake3.rows.get('user:321').data.balance, 7000);
  ok('Supabase boʻsh boʻlsa, mavjud fayl maʼlumoti unga koʻchiriladi');

  // 10. sozlama: URL/kalit boʻlmasa fayl ombori; notoʻgʻri URL rad etiladi
  assert.strictEqual(createBackend({ SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '' }), null);
  assert.strictEqual(createBackend({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: '' }), null);
  assert.ok(createBackend({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'k' }));
  assert.throws(() => createBackend({ SUPABASE_URL: 'x.supabase.co', SUPABASE_SERVICE_KEY: 'k' }), /https/);
  ok('sozlama: kalit yoʻq boʻlsa fayl ombori, URL notoʻgʻri boʻlsa xato');

  // 11. fayl ombori avvalgidek ishlaydi
  const fdir = tmp();
  const f1 = new Store(fdir);
  f1.ensureUser({ id: 5, first_name: 'F' });
  f1.credit(5, 3000, 'x', 'topup');
  const f2 = new Store(fdir);
  assert.strictEqual(f2.getUser(5).balance, 3000);
  ok('backend boʻlmasa, fayl ombori avvalgidek saqlaydi');

  for (const f of [fake, fake2, fake3]) f.server.close();
  console.log(`\nHamma tekshiruvlar yaxshi (${n} ta).`);
  process.exit(0);
})().catch((e) => {
  console.error('\n❌', e && e.stack ? e.stack : e);
  process.exit(1);
});
