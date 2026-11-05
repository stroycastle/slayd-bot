// Slayd turlarini tekshiradi (Telegram, AI va LibreOffice kerak emas).
// Ishga tushirish: npm run test:layouts
process.env.MOCK_AI = '1';
const assert = require('assert');
const JSZip = require('jszip');
const { buildDeck, normalizeDeck, PALETTES, LAYOUTS } = require('../src/deck');
const { generateDeck } = require('../src/ai');
const { trimToTarget } = require('../src/service');

let n = 0;
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`);
const items = (k, withHead = true) => Array.from({ length: k }, (_, i) => ({ head: withHead ? `Sarlavha ${i + 1}` : '', text: `Matn ${i + 1}` }));
const norm = (slide) => normalizeDeck({ title: 'T', slides: [Object.assign({ title: 'S', notes: 'n' }, slide)] }).slides[0];
const layoutOf = (slide) => (norm(slide) || {}).layout;

(async () => {
  // 1. yangi turlar oʻz holicha qoladi
  const good = {
    stats: { items: items(3) },
    timeline: { items: items(4) },
    hub: { lead: 'Markaz', items: items(5) },
    split: { lead: 'Asosiy fikr', items: items(3) },
    pyramid: { items: items(4) },
    cycle: { items: items(4), lead: 'Aylana' },
    versus: { columns: [{ head: 'A', bullets: ['a1', 'a2'] }, { head: 'B', bullets: ['b1', 'b2'] }] },
    section: { title: 'Ikkinchi qism', lead: 'Davom etamiz' },
  };
  for (const [layout, body] of Object.entries(good)) assert.strictEqual(layoutOf(Object.assign({ layout }, body)), layout, layout);
  ok(`${Object.keys(good).length} ta yangi tur toʻgʻri tuzilgan boʻlsa oʻz holicha qoladi`);

  // 2. maʼlumot yetmasa, mos turga oʻtadi (slayd yoʻqolmaydi)
  assert.strictEqual(layoutOf({ layout: 'stats', items: items(3, false) }), 'cards');
  assert.strictEqual(layoutOf({ layout: 'stats', items: items(1), lead: 'x' }), 'definition');
  assert.strictEqual(layoutOf({ layout: 'timeline', items: items(2) }), 'cards');
  assert.strictEqual(layoutOf({ layout: 'timeline', items: items(4, false) }), 'process');
  assert.strictEqual(layoutOf({ layout: 'hub', items: items(4) }), 'cards');
  assert.strictEqual(layoutOf({ layout: 'hub', lead: 'M', items: items(2) }), 'cards');
  assert.strictEqual(layoutOf({ layout: 'split', items: items(3) }), 'rows');
  assert.strictEqual(layoutOf({ layout: 'split', lead: 'M', items: items(1) }), 'definition');
  assert.strictEqual(layoutOf({ layout: 'pyramid', items: items(2) }), 'cards');
  assert.strictEqual(layoutOf({ layout: 'cycle', items: items(1), lead: 'x' }), 'definition');
  assert.strictEqual(layoutOf({ layout: 'versus', columns: [{ head: 'A', bullets: ['a'] }], items: items(3) }), 'rows');
  ok('maʼlumot yetmasa, slayd mos turga oʻtadi');

  // 3. boʻlim sarlavhasi
  assert.strictEqual(norm({ layout: 'section', title: '', lead: 'Faqat izoh' }).title, 'Faqat izoh');
  assert.strictEqual(normalizeDeck({ title: 'T', slides: [{ layout: 'section', title: '', lead: '' }] }).slides.length, 0);
  ok('boʻlim sarlavhasi: sarlavha boʻlmasa izohdan olinadi, hech narsa boʻlmasa tashlanadi');

  // 4. barcha turlar 3 til x 6 rangda yigʻiladi va slaydlar soni toʻgʻri
  for (const lang of ['uz', 'uzc', 'ru']) {
    const deck = await generateDeck({ topic: 'Sinov', slides: 20, lang });
    const used = new Set(deck.slides.map((s) => s.layout));
    for (const l of LAYOUTS) assert.ok(used.has(l), `${lang}: ${l} namunada yoʻq`);
    for (const color of Object.keys(PALETTES)) {
      const buf = await buildDeck(deck, { color, lang, profile: { fullName: 'Test' } });
      const zip = await JSZip.loadAsync(buf);
      const count = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).length;
      assert.strictEqual(count, deck.slides.length + 1, `${lang}/${color} slaydlar soni`);
    }
  }
  ok('barcha 18 tur 3 til x 6 rangda xatosiz yigʻiladi');

  // 5. yuqori chegaradagi uzun matn ham yigʻiladi
  const long = 'Til tizimi tovush, soʻz va qoidalardan iborat boʻlib, ular bir-biri bilan bogʻliq. '.repeat(8);
  const stress = normalizeDeck({
    title: 'T',
    slides: [
      { layout: 'stats', title: long, items: Array.from({ length: 6 }, () => ({ head: long, text: long })), note: long },
      { layout: 'timeline', title: long, items: Array.from({ length: 9 }, () => ({ head: long, text: long })) },
      { layout: 'hub', title: long, lead: long, items: Array.from({ length: 9 }, () => ({ head: long, text: long })) },
      { layout: 'cycle', title: long, lead: long, items: Array.from({ length: 7 }, () => ({ head: long, text: long })) },
      { layout: 'pyramid', title: long, items: Array.from({ length: 9 }, () => ({ head: long, text: long })) },
    ],
  });
  assert.strictEqual(stress.slides.length, 5);
  assert.ok((await buildDeck(stress, { color: 'red', lang: 'ru' })).length > 10000);
  ok('juda uzun matn va ortiqcha elementlar bilan ham slayd yigʻiladi');

  // 6. slaydlar soni kamaytirilganda avval boʻlim sarlavhalari olib tashlanadi
  const mk = (layout) => ({ layout, title: layout });
  const deck = { slides: [mk('agenda'), mk('cards'), mk('section'), mk('rows'), mk('conclusion'), mk('references')] };
  trimToTarget(deck, 5);
  assert.deepStrictEqual(deck.slides.map((s) => s.layout), ['agenda', 'cards', 'rows', 'conclusion', 'references']);
  trimToTarget(deck, 4);
  assert.deepStrictEqual(deck.slides.map((s) => s.layout), ['agenda', 'cards', 'conclusion', 'references']);
  ok('ortiqcha slaydlar kesilganda boʻlim sarlavhasi birinchi olib tashlanadi');

  console.log(`\nHamma tekshiruvlar yaxshi (${n} ta).`);
})().catch((e) => {
  console.error('\n❌', e.message);
  process.exit(1);
});
