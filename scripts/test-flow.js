// Botni Telegramsiz sinash: soxta Telegram bilan butun oqimni (balans, buyurtma, tahrir, xato) bajaradi.
// Ishga tushirish: npm test
const os = require('os');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'botflow-'));
process.env.MOCK_AI = '1';
process.env.ADMIN_IDS = '1';
process.env.BOT_TOKEN = '1:test';
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.TMP_DIR = path.join(tmp, 'tmp');
if (process.env.TEST_SOFFICE) process.env.SOFFICE_PATH = process.env.TEST_SOFFICE;

const config = require('../src/config');
const { Store } = require('../src/store');
const { createBot } = require('../src/bot');
const service = require('../src/service');

const ADMIN = 1;
const USER = 100;
const calls = [];
let mid = 1000;
let uid = 1;

const store = new Store(config.DATA_DIR);
const bot = createBot({ store, download: async () => Buffer.from('Maruza matni: til tizimi haqida qisqa matn. '.repeat(20), 'utf8') });
bot.botInfo = { id: 1, is_bot: true, first_name: 'Test', username: 'test_bot' };
// Telegraf har yangilanish uchun yangi Telegram mijozi yaratadi, shuning uchun umumiy prototipni almashtiramiz
require('telegraf').Telegram.prototype.callApi = async function (method, data) {
  calls.push({ method, data });
  if (['sendMessage', 'sendPhoto', 'sendDocument'].includes(method)) return { message_id: ++mid, chat: { id: data.chat_id }, date: 0 };
  return true;
};

const from = (id) => ({ id, is_bot: false, first_name: 'Foydalanuvchi' + id, username: 'user' + id });
const msg = (id, text, extra = {}) => ({ update_id: ++uid, message: Object.assign({ message_id: ++uid, from: from(id), chat: { id, type: 'private' }, date: 0, text }, extra) });
const cmd = (id, text) => msg(id, text, { entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] });
const cb = (id, data) => ({ update_id: ++uid, callback_query: { id: 'cb' + uid, from: from(id), chat_instance: 'x', data, message: { message_id: 5, chat: { id, type: 'private' }, date: 0, text: 'x', caption: 'x' } } });
const photo = (id) => msg(id, undefined, { text: undefined, photo: [{ file_id: 'small', file_unique_id: 'a', width: 1, height: 1 }, { file_id: 'bigphoto', file_unique_id: 'b', width: 9, height: 9 }] });
const doc = (id, name) => msg(id, undefined, { text: undefined, document: { file_id: 'doc1', file_unique_id: 'd', file_name: name, file_size: 500 } });

const send = (u) => bot.handleUpdate(u);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 90000, what = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return;
    await sleep(100);
  }
  throw new Error('Kutilgan holat boʻlmadi: ' + what);
}
const texts = (chat) => calls.filter((c) => c.method === 'sendMessage' && c.data.chat_id === chat).map((c) => c.data.text);
const lastText = (chat) => texts(chat).slice(-1)[0] || '';
const docsTo = (chat) => calls.filter((c) => c.method === 'sendDocument' && c.data.chat_id === chat);
let step = 0;
const ok = (name) => console.log(`  ✓ ${++step}. ${name}`);

(async () => {
  console.log('Soxta Telegram bilan sinov boshlandi\n');

  // 1. start
  await send(cmd(USER, '/start'));
  assert(lastText(USER).includes('Salom'), 'start xabari');
  ok('/start salomlashadi, narxlar koʻrsatiladi');

  // 2. buyurtma oqimi (balans 0)
  await send(msg(USER, '📊 Yangi taqdimot'));
  await send(msg(USER, 'Grammatik kategoriya'));
  await send(msg(USER, '5')); // juda kam
  assert(lastText(USER).includes('8 dan 30'), 'kam slayd rad etiladi');
  await send(cb(USER, 'slides:8'));
  await send(cb(USER, 'lang:uzc'));
  await send(cb(USER, 'color:purple'));
  await send(msg(USER, 'Maruza matnining birinchi qismi. '.repeat(10)));
  await send(doc(USER, 'lecture.txt'));
  await sleep(1500);
  assert(texts(USER).some((t) => t.includes('Qabul qilindi')), 'matn qabul qilindi xabari');
  await send(cb(USER, 'lec:done'));
  await send(msg(USER, 'Mahmudov N. Oʻzbek tilining nazariy grammatikasi. Toshkent, 1995.'));
  await send(cb(USER, 'ref:done'));
  for (const t of ['Nuriddinova Farangiz', '2606', 'OʻzDJTU', 'Xitoy filologiyasi']) await send(msg(USER, t));
  const confirm = lastText(USER);
  assert(confirm.includes('Buyurtmani tekshiring') && confirm.includes('40 000'), 'tasdiqlash oynasi va narx (8 x 5000)');
  assert(confirm.includes('Ўзбекча') && confirm.includes('Binafsha') && confirm.includes('bor ('), 'tanlovlar');
  assert(store.getUser(USER).profile.fullName === 'Nuriddinova Farangiz', 'titul saqlandi');
  ok('Mavzu, slayd soni, til, rang, matn+fayl, adabiyot, titul oqimi ishladi (40 000 soʻm)');

  // 3. pul yetmaydi
  await send(cb(USER, 'order:go'));
  assert(lastText(USER).includes('yetarli emas'), 'balans yetmasligi');
  assert.strictEqual(store.getUser(USER).balance, 0);
  ok('Balans 0 boʻlsa buyurtma qabul qilinmaydi, pul yechilmaydi');

  // 4. to'lov: chek -> admin tasdiqlaydi
  await send(cb(USER, 'topup:start'));
  await send(cb(USER, 'topup:amt:100000'));
  assert(lastText(USER).includes('0000 0000 0000 0000') || lastText(USER).includes(config.CARD_NUMBER), 'karta raqami koʻrsatildi');
  await send(photo(USER));
  const adminPhoto = calls.find((c) => c.method === 'sendPhoto' && c.data.chat_id === ADMIN);
  assert(adminPhoto && adminPhoto.data.photo === 'bigphoto', 'chek adminga yuborildi');
  assert(JSON.stringify(adminPhoto.data.reply_markup).includes('pay:ok:1'), 'tasdiqlash tugmasi');
  // begona odam tasdiqlay olmaydi
  await send(cb(USER, 'pay:ok:1'));
  assert.strictEqual(store.getUser(USER).balance, 0, 'oddiy foydalanuvchi tasdiqlay olmaydi');
  await send(cb(ADMIN, 'pay:ok:1'));
  assert.strictEqual(store.getUser(USER).balance, 100000);
  await send(cb(ADMIN, 'pay:ok:1')); // ikkinchi marta
  assert.strictEqual(store.getUser(USER).balance, 100000, 'ikki marta qoʻshilmaydi');
  ok('Chek adminga boradi, faqat admin tasdiqlaydi, balans bir marta toʻldiriladi (100 000)');

  // 5. buyurtmani davom ettirish va tayyorlash
  await send(cb(USER, 'order:retry'));
  await send(cb(USER, 'order:go'));
  assert.strictEqual(store.getUser(USER).balance, 60000, 'pul yechildi');
  await waitFor(() => texts(USER).some((t) => t.includes('Tayyor!')), 120000, 'taqdimot tayyor');
  const files = docsTo(USER);
  assert(files.length >= 1 && files[0].data.document.filename.endsWith('.pptx'), '.pptx yuborildi');
  assert(files[0].data.document.source.length > 20000, '.pptx hajmi');
  if (process.env.TEST_SOFFICE) assert(files.length === 2 && files[1].data.document.filename.endsWith('.pdf'), 'PDF ham yuborildi');
  ok(`Taqdimot tayyorlandi va yuborildi (${files.map((f) => f.data.document.filename).join(', ')})`);
  const order1 = store.userOrders(USER, 1)[0];
  assert(order1 && order1.status === 'done' && order1.deck.slides.length === 7, 'buyurtma saqlandi (8 slayd = titul + 7)');
  fs.writeFileSync(path.join(__dirname, '..', 'out', 'test_flow_natija.pptx'), files[0].data.document.source);

  // 6. tahrir: pul yetarli, 3000
  await send(msg(USER, '✏️ Tahrirlash'));
  await send(cb(USER, 'edit:pick:' + order1.id));
  await send(msg(USER, '3-slaydga ikkita gap qoʻshing'));
  assert.strictEqual(store.getUser(USER).balance, 57000, 'tahrir 3000 soʻm');
  await waitFor(() => texts(USER).some((t) => t.startsWith('✅ Sinov rejimi')), 60000, 'tahrir tayyor');
  assert(docsTo(USER).length >= 2, 'tahrirdan keyin yangi fayl yuborildi');
  assert(JSON.stringify(store.getOrder(order1.id).deck.slides[1]).includes('tahrir qoʻshildi'), 'tahrir buyurtmada saqlandi');
  ok('Tahrir 3 000 soʻm, yangi fayl keldi, oʻzgarish saqlandi');

  // 7. tahrir hech narsa oʻzgartirmasa pul qaytadi
  await send(msg(USER, '✏️ Tahrirlash'));
  await send(cb(USER, 'edit:pick:' + order1.id));
  const before = store.getUser(USER).balance;
  await send(msg(USER, '99-slaydni oʻzgartiring'));
  await waitFor(() => texts(USER).some((t) => t.includes('qaytarildi')), 60000, 'tahrir qaytarildi');
  assert.strictEqual(store.getUser(USER).balance, before, 'oʻzgarish boʻlmasa pul qaytadi');
  ok('Oʻzgarish boʻlmagan tahrirda pul avtomatik qaytadi');

  // 8. AI xatosi: pul qaytadi
  const real = service.createDeck;
  service.createDeck = async () => {
    throw new Error('AI vaqtincha ishlamadi');
  };
  await send(msg(USER, '📊 Yangi taqdimot'));
  await send(msg(USER, 'Xato sinovi'));
  await send(cb(USER, 'slides:8'));
  await send(cb(USER, 'lang:uz'));
  await send(cb(USER, 'color:green'));
  await send(cb(USER, 'lec:skip'));
  await send(cb(USER, 'ref:skip'));
  const b2 = store.getUser(USER).balance;
  await send(cb(USER, 'order:go'));
  await waitFor(() => texts(USER).some((t) => t.includes('xatolik chiqdi')), 20000, 'xato xabari');
  assert.strictEqual(store.getUser(USER).balance, b2, 'xatoda pul toʻliq qaytadi');
  assert(texts(ADMIN).some((t) => t.includes('xatolik')), 'admin xabardor qilindi');
  service.createDeck = real;
  ok('AI xato qilsa pul toʻliq qaytadi va admin xabar oladi');

  // 9. admin: /stat va /qosh
  await send(cmd(USER, '/stat'));
  assert(!texts(USER).some((t) => t.includes('Foydalanuvchilar:')), 'oddiy foydalanuvchiga statistika koʻrsatilmaydi');
  await send(cmd(ADMIN, '/stat'));
  assert(lastText(ADMIN).includes('Taqdimotlar: 1'), 'statistika');
  await send(cmd(ADMIN, `/qosh ${USER} 5000`));
  assert.strictEqual(store.getUser(USER).balance, b2 + 5000);
  ok('/stat va /qosh faqat adminga ishlaydi');

  // 10. daftar (ledger) balansga mos
  const u = store.getUser(USER);
  const net = store.db.ledger.filter((l) => l.userId === USER).reduce((s, l) => s + (l.type === 'charge' ? -l.amount : l.amount), 0);
  assert.strictEqual(net, u.balance, 'daftar bilan balans mos');
  ok(`Pul daftari balansga mos (${u.balance} soʻm)`);

  // 11. qayta ishga tushganda yarim qolgan buyurtma
  const stuck = store.addOrder({ userId: USER, type: 'deck', topic: 'x', slides: 8, price: 40000 });
  assert(store.charge(USER, 40000, 'test'));
  const bb = store.getUser(USER).balance;
  assert.strictEqual(store.recoverStuck().length, 1);
  assert.strictEqual(store.getUser(USER).balance, bb + 40000);
  ok('Bot oʻchib qolsa, yarim qolgan buyurtma puli qaytariladi');

  console.log('\nHAMMASI TOʻGʻRI ✅');
  process.exit(0);
})().catch((e) => {
  console.error('\n❌ SINOV XATOSI:', e.message);
  console.error(e.stack);
  process.exit(1);
});
