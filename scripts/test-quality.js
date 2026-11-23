// Matn sifati va toʻliqlik: oʻzbekcha apostrof (oʻ gʻ ʼ), kam chiqqan/kesilgan taqdimotni toʻldirish, rasmli slaydlar soni.
// Internet va haqiqiy AI kerak emas (AI soxta funksiya bilan almashtiriladi). Ishga tushirish: npm run test:quality
process.env.WEB_RESEARCH = '0';
delete process.env.MOCK_AI;
process.env.AI_PROVIDER = 'anthropic';
process.env.ANTHROPIC_API_KEY = 'test';
const assert = require('assert');

// llm.callTool ni ai.js yuklanishidan oldin almashtiramiz (ai.js uni import paytida oladi)
const llm = require('../src/llm');
const calls = [];
let script = [];
llm.callTool = async (system, user, tool, opts) => {
  calls.push({ system, user, tool, opts });
  const next = script.shift();
  if (next instanceof Error) throw next;
  if (!next) throw new Error('soxta AI: javob qolmadi');
  return next;
};
const ai = require('../src/ai');
const { normalizeDeck } = require('../src/deck');
const uzfix = require('../src/uzfix');

let n = 0;
const ok = (m) => console.log(`✓ ${++n}. ${m}`);

const item = (i, apos = true) => ({ head: apos ? `Ma'no ${i}` : `Maʼno ${i}`, text: apos ? `Bu o'zbek g'oyasi ${i}: ta'rif va san'at haqida gap ketadi.` : `Bu oddiy matn ${i}.` });
const sl = (layout, title, extra = {}) => {
  const base = { layout, title, notes: 'Bu slaydni ovoz chiqarib aytish mumkin. Ikkinchi gap.' };
  if (layout === 'agenda') base.items = [1, 2, 3].map((i) => ({ head: `Reja ${i}` }));
  else if (layout === 'definition') Object.assign(base, { lead: "Ta'rif: o'zbek tilida g'oya nima degani.", items: [item(1), item(2)] });
  else if (layout === 'conclusion') base.items = [1, 2, 3].map((i) => ({ text: `Xulosa ${i}: bu muhim, san'at bor.` }));
  else if (layout === 'references') base.references = ['Muallif A. Kitob. Toshkent, 2015.', 'Muallif B. Maqola. Samarqand, 2018.', 'Muallif C. Darslik. Toshkent, 2020.'];
  else base.items = [item(1), item(2), item(3)];
  return Object.assign(base, extra);
};
const tool = (...slides) => ({ title: "O'zbek tili va g'oya", slides });
const titles = (d) => d.slides.map((s) => s.title);
const layouts = (d) => d.slides.map((s) => s.layout);

(async () => {
  // ---------------------------------------------------------------- 1. oʻzbekcha apostrof
  const u = uzfix.normalizeUz;
  assert.strictEqual(u("o'zbek g'oya to'y tog' bo'lib"), 'oʻzbek gʻoya toʻy togʻ boʻlib');
  assert.strictEqual(u("ma'no san'at e'tibor a'lo mas'ul ta'rif"), 'maʼno sanʼat eʼtibor aʼlo masʼul taʼrif');
  assert.strictEqual(u('O‘zbekiston G’ulom ma`no'), 'Oʻzbekiston Gʻulom maʼno', 'boshqa shakldagi belgilar ham tuzatiladi');
  assert.strictEqual(u('oʻzbek maʼno toʻgʻri'), 'oʻzbek maʼno toʻgʻri', 'toʻgʻri yozilgan matn oʻzgarmaydi');
  assert.strictEqual(u("«Tasavvuf» 'sirli' so'z"), "«Tasavvuf» 'sirli' soʻz", 'tirnoq vazifasidagi apostrofga tegilmaydi');
  assert.strictEqual(u('Maʻno'), 'Maʼno', 'tutuq oʻrnida yozilgan ʻ ham tuzatiladi');
  const mapped = uzfix.mapUz({ title: "Ta'rif", slides: [{ layout: 'photo', imageQuery: "Sufi's heart", lead: "g'oya", references: ["Smith's O'Neill"], items: [{ head: "ma'no", text: "o'qish" }] }] });
  assert.deepStrictEqual(mapped, { title: 'Taʼrif', slides: [{ layout: 'photo', imageQuery: "Sufi's heart", lead: 'gʻoya', references: ["Smith's O'Neill"], items: [{ head: 'maʼno', text: 'oʻqish' }] }] });
  ok('uzfix: oʻ gʻ ʼ tuzatiladi; imageQuery, adabiyotlar va tirnoqlar tegilmaydi');

  // ---------------------------------------------------------------- 2. kam chiqqan taqdimot toʻldiriladi (xulosa va adabiyotlar oxirida)
  script = [
    tool(sl('agenda', 'Reja'), sl('definition', 'Tushuncha'), sl('cards', 'Turlari')), // 8 slayd soʻralgan (7 yoziladi), 3 ta chiqdi
    tool(sl('process', 'Bosqichlar'), sl('timeline', 'Tarix'), sl('agenda', 'Reja 2'), sl('conclusion', 'Xulosa'), sl('references', 'Adabiyotlar')),
  ];
  calls.length = 0;
  const d1 = await ai.generateDeck({ topic: "O'zbek tili", slides: 8, lang: 'uz', color: 'blue', images: false });
  assert.strictEqual(calls.length, 2, 'bitta qoʻshimcha soʻrov');
  assert.strictEqual(d1.slides.length, 7, '8 slayd (titul bilan) = 7 ta yozilgan slayd');
  assert.deepStrictEqual(layouts(d1).slice(-2), ['conclusion', 'references'], 'xulosa va adabiyotlar oxirida');
  assert.ok(!titles(d1).includes('Reja 2'), 'takroriy agenda olinmaydi');
  assert.ok(/Write exactly 4 more slides/.test(calls[1].user) && /Tushuncha/.test(calls[1].user) && !/Write exactly 7 slides/.test(calls[1].user), 'qoʻshimcha soʻrov: nechta kerakligi va mavjud sarlavhalar aytiladi');
  assert.strictEqual(calls[1].tool.name, 'submit_deck');
  assert.ok(calls[1].opts.maxTokens >= 3000, 'toʻldirish uchun token yetarli');
  const allText = JSON.stringify(d1);
  assert.ok(!/[a-z]'[a-z]/i.test(allText.replace(/"imageQuery":"[^"]*"/g, '')), 'hamma matnda (toʻldirilgani ham) rasmiy imlo: ' + allText.match(/\w+'\w+/g));
  assert.ok(/oʻzbek/i.test(allText) && /taʼrif/.test(allText) && /gʻoya/.test(allText), 'oʻ gʻ ʼ qoʻyilgan');
  ok('kam chiqqan taqdimot toʻldiriladi: mazmunli slaydlar, soʻng xulosa va adabiyotlar; apostrof tuzatilgan');

  // ---------------------------------------------------------------- 3. 23 slayd soʻralgan, javob kesilgan (xulosa/adabiyotsiz)
  const body15 = [sl('agenda', 'Reja'), sl('definition', 'Tushuncha')];
  for (let i = 0; i < 13; i++) body15.push(sl(['cards', 'process', 'rows', 'two_columns'][i % 4] === 'two_columns' ? 'cards' : ['cards', 'process', 'rows'][i % 3], `Mavzu ${i + 1}`));
  script = [tool(...body15), tool(...[1, 2, 3, 4, 5].map((i) => sl('rows', `Qoʻshimcha ${i}`)), sl('conclusion', 'Xulosa'), sl('references', 'Adabiyotlar'))];
  calls.length = 0;
  const d2 = await ai.generateDeck({ topic: 'Katta mavzu', slides: 23, lang: 'uz', color: 'blue', images: false });
  assert.strictEqual(d2.slides.length, 22, '23 slayd = 22 ta yozilgan');
  assert.deepStrictEqual(layouts(d2).slice(-2), ['conclusion', 'references']);
  assert.strictEqual(d2.slides.filter((s) => s.layout === 'agenda').length, 1);
  assert.ok(/Write exactly 7 more slides/.test(calls[1].user), 'kerak: 5 mazmunli + xulosa + adabiyotlar');
  ok('23 slayd: kesilgan javob 22 taga yetkaziladi (5 mazmunli + xulosa + adabiyotlar)');

  // ---------------------------------------------------------------- 4. toʻliq taqdimotga qoʻshimcha soʻrov yuborilmaydi
  script = [tool(sl('agenda', 'Reja'), sl('definition', 'Tushuncha'), sl('cards', 'A'), sl('process', 'B'), sl('rows', 'C'), sl('conclusion', 'Xulosa'), sl('references', 'Adabiyotlar'))];
  calls.length = 0;
  const d3 = await ai.generateDeck({ topic: 'Mavzu', slides: 8, lang: 'uz', color: 'blue', images: false });
  assert.strictEqual(calls.length, 1, 'toʻliq javobga qoʻshimcha soʻrov yoʻq');
  assert.strictEqual(d3.slides.length, 7);
  ok('toʻliq taqdimotga ortiqcha soʻrov yuborilmaydi');

  // ---------------------------------------------------------------- 5. toʻldirish xato bersa, mavjud taqdimot buzilmaydi
  script = [tool(sl('agenda', 'Reja'), sl('definition', 'Tushuncha'), sl('cards', 'A'), sl('process', 'B')), new Error('429 band')];
  calls.length = 0;
  const d4 = await ai.generateDeck({ topic: 'Mavzu', slides: 12, lang: 'uz', color: 'blue', images: false });
  assert.strictEqual(d4.slides.length, 4, 'xatoda boshlangʻich taqdimot qaytadi');
  ok('toʻldirish soʻrovi yiqilsa, mavjud slaydlar saqlanadi');

  // ---------------------------------------------------------------- 6. yangi narsa chiqmasa, cheksiz urinmaydi
  script = [tool(sl('agenda', 'Reja'), sl('definition', 'Tushuncha'), sl('cards', 'A'), sl('process', 'B')), tool(sl('agenda', 'Reja'), sl('cards', 'A')), tool(sl('rows', 'Yangi'))];
  calls.length = 0;
  const d5 = await ai.generateDeck({ topic: 'Mavzu', slides: 12, lang: 'uz', color: 'blue', images: false });
  assert.ok(calls.length <= 2, `urinishlar cheklangan (${calls.length})`);
  assert.strictEqual(d5.slides.length, 4, 'takroriy slaydlar qoʻshilmaydi');
  ok('takroriy/agenda slaydlar qoʻshilmaydi, urinishlar cheklangan');

  // ---------------------------------------------------------------- 7. boshqa tillarda (ru) apostrof tuzatilmaydi, toʻldirish ishlaydi
  script = [tool(sl('agenda', 'План'), sl('definition', "О'Хара"), sl('cards', 'Виды')), tool(sl('process', 'Этапы'), sl('timeline', 'История'), sl('conclusion', 'Вывод'), sl('references', 'Литература'))];
  calls.length = 0;
  const d6 = await ai.generateDeck({ topic: 'Тема', slides: 8, lang: 'ru', color: 'blue', images: false });
  assert.ok(JSON.stringify(d6).includes("О'Хара") || JSON.stringify(d6).includes('Хара'), 'ruscha matn tegilmaydi');
  assert.ok(!/ʻ/.test(JSON.stringify(d6.slides[1])), 'ruscha matnga oʻzbekcha belgi qoʻyilmaydi');
  ok('ruscha matn oʻzbekcha imlo qoidalaridan chetda');

  // ---------------------------------------------------------------- 8. tahrirdan keyingi matn ham tuzatiladi (oʻzbekcha)
  const deck = normalizeDeck({ title: 'T', slides: [sl('agenda', 'Reja'), sl('cards', 'A'), sl('rows', 'B')] });
  script = [{ reply: "Slayd o'zgartirildi.", changes: [{ slide: 3, content: sl('cards', "O'zgargan slayd", { items: [{ head: "g'oya", text: "ma'no va o'rnak" }, { head: 'Ikkinchi', text: 'matn' }] }) }] }];
  const edited = await ai.editDeck({ deck, instruction: 'Slaydni oʻzgartir', lang: 'uz' });
  assert.strictEqual(edited.deck.slides[1].title, 'Oʻzgargan slayd');
  assert.strictEqual(edited.deck.slides[1].items[0].head, 'gʻoya');
  assert.strictEqual(edited.deck.slides[1].items[0].text, 'maʼno va oʻrnak');
  assert.strictEqual(edited.reply, 'Slayd oʻzgartirildi.');
  ok('tahrirda ham: oʻzbekcha matn rasmiy imloga keltiriladi');

  // ---------------------------------------------------------------- 9. rasmli slaydlar: taxminan har ikkinchisi, ketma-ket emas
  assert.deepStrictEqual([6, 8, 10, 16, 20, 30].map(ai.photoCap), [3, 4, 5, 8, 8, 8]);
  const mkp = (layout, q) => Object.assign(sl(layout, 'S ' + layout + (q ? ' ' + q : '')), { imageQuery: q, image: null, lead: '', note: '', columns: [], table: null, references: [] });
  const long = { title: 'T', subtitle: '', slides: [mkp('agenda', '')] };
  for (let i = 1; i <= 14; i++) long.slides.push(mkp(['cards', 'split', 'rows'][i % 3], `Place number ${i}`));
  long.slides.push(mkp('conclusion', ''), mkp('references', ''));
  long.slides[long.slides.length - 1].references = ['Manba'];
  const planned = ai.planPhotos(long, true);
  const idx = planned.slides.map((s, i) => (s.layout === 'photo' ? i : -1)).filter((i) => i >= 0);
  assert.ok(idx.length <= ai.photoCap(planned.slides.length) && idx.length >= 6, `soni photoCap dan oshmaydi va kamida 6 ta (14 nomzoddan ketma-ket boʻlmaganlar): ${idx}`);
  assert.ok(idx.every((i, k) => k === 0 || i - idx[k - 1] > 1), 'ketma-ket emas: ' + idx);
  assert.ok(idx.length >= 5, 'uzun taqdimotda kamida 5 ta rasmli slayd: ' + idx.length);
  ok(`rasmli slaydlar koʻpaydi: ${planned.slides.length} slaydda ${idx.length} ta, ketma-ket emas`);

  console.log(`\nHammasi yaxshi: ${n} ta tekshiruv oʻtdi.`);
  process.exit(0);
})().catch((e) => {
  console.error('✗', e);
  process.exit(1);
});
