// Qoraqalpoq (lotin) imlosi: eski apostrofli yozuvni tuzatish, begona belgilarni topish va AI bilan ishlash (kalitsiz).
// Ishga tushirish: npm run test:qq
process.env.MOCK_AI = '0';
process.env.OPENROUTER_API_KEY = 'sk-or-test';
process.env.WEB_RESEARCH = '0'; // yangi manba qidirilmaydi (internet kerak emas)
const assert = require('assert');

const llm = require('../src/llm');
let calls = [];
let answers = [];
// ai.js callTool ni yuklash paytida oladi, shuning uchun bitta qadoqlovchi qoʻyiladi, ichidagi ishlovchi almashtiriladi
let handler = async (system, user, tool) => {
  calls.push({ system, user, tool: tool.name });
  return answers.shift();
};
llm.callTool = (...a) => handler(...a);
const qq = require('../src/qq');
const ai = require('../src/ai');
const { buildDeck, LABELS } = require('../src/deck');

let n = 0;
const ok = (m) => console.log(`  ✓ ${++n}. ${m}`);
const deck = (extra) => ({ title: 'Til', slides: ['A', 'B', 'C', 'D'].map((t) => Object.assign({ layout: 'definition', title: t, lead: `Anıqlama ${t}`, items: [{ head: 'x', text: 'y' }] }, extra)) });

(async () => {
  // 1. eski imlo yangisiga oʻtadi
  assert.strictEqual(qq.normalizeQq("a'lipbe g'arezsiz n'iyet o'zbek u'lken"), 'álipbe ǵarezsiz ńiyet ózbek úlken');
  assert.strictEqual(qq.normalizeQq('Á'), 'Á');
  assert.strictEqual(qq.normalizeQq('A’lem'), 'Álem');
  ok('eski apostrofli imlo (a\' g\' n\' o\' u\') yangi harflarga (á ǵ ń ó ú) oʻtadi');

  // 2. toʻgʻri matnga tegmaydi
  const good = 'Qaraqalpaq tiliniń álipbesi: ǵ, ń, ó, ú, í, ı, sh, ch';
  assert.strictEqual(qq.normalizeQq(good), good);
  ok('toʻgʻri yozilgan matn oʻzgarmaydi');

  // 3. begona harflar
  assert.deepStrictEqual(qq.foreignChars('Qaraqalpaq tili'), []);
  assert.ok(qq.foreignChars('oʻzbek').includes('ʻ'));
  assert.strictEqual(qq.foreignChars('Тил').length, 3);
  assert.ok(qq.foreignChars('şeker').includes('ş'));
  ok('alifboga kirmaydigan harflar topiladi');

  // 4. adabiyotlar slaydi tegilmaydi (oʻzbekcha kitob nomlari qoladi), qolgani tuzatiladi
  const d = { title: "O'zbek", slides: [{ layout: 'cards', title: "Ka'p", items: [{ head: "Oʻz", text: 'x' }] }, { layout: 'references', items: [{ text: 'Oʻzbek tili, 2020' }] }] };
  const nd = qq.normalizeDeckQq(d);
  assert.strictEqual(nd.title, 'Ózbek');
  assert.strictEqual(nd.slides[0].title, 'Káp');
  assert.strictEqual(nd.slides[1].items[0].text, 'Oʻzbek tili, 2020');
  ok('adabiyotlar slaydidagi oʻzbekcha nomlar buzilmaydi');

  // 5. qolib ketgan oʻzbekcha belgi/kirill sanaladi (ismlardagi ü, é xato emas, adabiyotlar hisobga olinmaydi)
  assert.strictEqual(qq.leftovers(deck()).count, 0);
  assert.strictEqual(qq.leftovers({ title: 'Müller', slides: [{ layout: 'references', items: [{ text: 'Тил' }] }] }).count, 0);
  const lo = qq.leftovers({ title: 'T', slides: [{ layout: 'cards', title: 'Привет', items: [] }] });
  assert.strictEqual(lo.count, 6);
  ok('qolib ketgan kirill va ʻ ʼ sanaladi, ismlar va adabiyotlar xato hisoblanmaydi');

  // 6. AI: eski imlo avtomatik tuzatiladi, qayta soʻrov kerak emas
  calls = []; answers = [deck({ lead: "Ǵa'rezsiz a'debiyat" })];
  let out = await ai.generateDeck({ topic: 'Til', slides: 5, lang: 'kaa' });
  assert.strictEqual(out.slides[0].lead, 'Ǵárezsiz ádebiyat');
  assert.strictEqual(calls.length, 1);
  assert.ok(/Karakalpak/.test(calls[0].system));
  ok('AI eski imlo yozsa, matn tuzatiladi (qayta soʻrovsiz)');

  // 7. AI: kirill qolsa, bir marta qayta yozdiriladi va yaxshisi olinadi
  calls = []; answers = [deck({ lead: 'Привет мир' }), deck({ lead: 'Sálem dúnya' })];
  out = await ai.generateDeck({ topic: 'Til', slides: 5, lang: 'kaa' });
  assert.strictEqual(calls.length, 2);
  assert.ok(/not in the Karakalpak Latin alphabet/.test(calls[1].user));
  assert.strictEqual(out.slides[0].lead, 'Sálem dúnya');
  ok('kirill qolsa, bir marta qayta yozdiriladi va toza variant olinadi');

  // 8. qayta yozdirish ham yomon boʻlsa, kamroq xatoli variant qoladi; xato chiqsa ham taqdimot yoʻqolmaydi
  calls = []; answers = [deck({ lead: 'Привет мир' }), deck({ lead: 'Привет' })];
  out = await ai.generateDeck({ topic: 'Til', slides: 5, lang: 'kaa' });
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(out.slides[0].lead, 'Привет');
  handler = async () => { calls.push(1); if (calls.length === 2) throw new Error('429'); return deck({ lead: 'Привет' }); };
  calls = [];
  out = await ai.generateDeck({ topic: 'Til', slides: 5, lang: 'kaa' });
  assert.ok(out.slides.length >= 3);
  ok('qayta yozdirish yaxshilamasa yoki xato bersa, birinchi taqdimot saqlanadi');

  // 9. boshqa tillarda tekshiruv ishlamaydi (bitta chaqiruv, matn tegilmaydi)
  handler = async (system, user) => { calls.push({ system, user }); return deck({ lead: "a'lipbe Привет" }); };
  calls = [];
  out = await ai.generateDeck({ topic: 'Til', slides: 5, lang: 'uz' });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(out.slides[0].lead, "a'lipbe Привет");
  ok('oʻzbekcha va boshqa tillarga tegmaydi');

  // 10. qoraqalpoq titul yorliqlari va .pptx yigʻiladi
  assert.ok(LABELS.kaa && LABELS.kaa.by);
  const buf = await buildDeck(deck({}), { color: 'green', lang: 'kaa', profile: { fullName: 'Test' } });
  assert.ok(buf.length > 20000);
  ok('qoraqalpoq .pptx yigʻiladi');

  console.log(`\nHamma tekshiruvlar yaxshi (${n} ta).`);
})().catch((e) => {
  console.error('\n❌', e && e.stack ? e.stack : e);
  process.exit(1);
});
