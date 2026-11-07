// Slayd turlari va 20 xil koʻrinishni tekshiradi (Telegram, AI va LibreOffice kerak emas).
// Ishga tushirish: npm run test:layouts
process.env.MOCK_AI = '1';
const assert = require('assert');
const JSZip = require('jszip');
const { buildDeck, normalizeDeck, PALETTES, LAYOUTS, STYLES, STYLE_KEYS, DEFAULT_STYLE, randomStyle } = require('../src/deck');
const { makeTheme } = require('../src/styles');
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

  // 7. 20 xil koʻrinish: hammasi 3 tilda, 2 rangda, barcha 18 tur bilan yigʻiladi
  assert.strictEqual(STYLES.length, 20);
  assert.strictEqual(new Set(STYLE_KEYS).size, 20);
  const slideXml = async (buf, k) => (await JSZip.loadAsync(buf)).file(`ppt/slides/slide${k}.xml`).async('string');
  const fingerprints = new Map();
  for (const lang of ['uz', 'uzc', 'ru']) {
    const deck = await generateDeck({ topic: 'Sinov', slides: 20, lang });
    for (const style of STYLE_KEYS) {
      for (const color of ['green', 'gray']) {
        const buf = await buildDeck(deck, { color, lang, style, profile: { fullName: 'Test', group: '1', university: 'U', faculty: 'F' } });
        const zip = await JSZip.loadAsync(buf);
        const count = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).length;
        assert.strictEqual(count, deck.slides.length + 1, `${style}/${lang}/${color} slaydlar soni`);
      }
      if (lang === 'uz') fingerprints.set(style, (await slideXml(await buildDeck(deck, { color: 'green', lang, style }), 1)) + (await slideXml(await buildDeck(deck, { color: 'green', lang, style }), 4)));
    }
  }
  ok('20 koʻrinish x 3 til x 2 rang: barcha slaydlar xatosiz yigʻiladi');

  // 8. koʻrinishlar bir-biridan haqiqatan farq qiladi (titul + oddiy slayd)
  assert.strictEqual(new Set(fingerprints.values()).size, 20, 'ikkita koʻrinish bir xil chiqdi');
  const kinds = (k) => new Set(STYLES.map((s) => s[k])).size;
  assert.ok(kinds('cover') >= 10 && kinds('card') >= 8 && kinds('badge') >= 7 && kinds('title') >= 6 && kinds('deco') >= 6 && kinds('footer') >= 5 && kinds('mode') === 4, 'xilma-xillik yetarli');
  assert.ok(new Set(STYLES.map((s) => `${s.fh}/${s.fb}`)).size >= 8, 'shriftlar xilma-xil');
  ok('20 koʻrinishning titul va slaydlari bir-biridan farq qiladi');

  // 9. nomaʼlum/boʻsh koʻrinish "Klassik" ga tushadi, tasodifiy koʻrinish haqiqiy kalit qaytaradi
  const d9 = await generateDeck({ topic: 'Sinov', slides: 8, lang: 'uz' });
  const a = await slideXml(await buildDeck(d9, { color: 'blue', lang: 'uz' }), 3);
  const b = await slideXml(await buildDeck(d9, { color: 'blue', lang: 'uz', style: 'yoq-uslub' }), 3);
  const c = await slideXml(await buildDeck(d9, { color: 'blue', lang: 'uz', style: DEFAULT_STYLE }), 3);
  assert.ok(a === b && b === c, 'nomaʼlum koʻrinish klassikka tushmadi');
  for (let i = 0; i < 50; i++) {
    const r = randomStyle('klassik');
    assert.ok(STYLE_KEYS.includes(r) && r !== 'klassik');
  }
  ok('nomaʼlum koʻrinish Klassik boʻladi, tasodifiy tanlov haqiqiy kalit qaytaradi');

  // 10. oʻqilishi: barcha koʻrinish x 6 rang uchun matn va fon orasidagi kontrast yetarli
  const lum = (h) => {
    const v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const contrast = (x, y) => (Math.max(lum(x), lum(y)) + 0.05) / (Math.min(lum(x), lum(y)) + 0.05);
  for (const st of STYLES) {
    for (const [ck, base] of Object.entries(PALETTES)) {
      const P = makeTheme(base, st);
      const need = (name, x, y, min) => assert.ok(contrast(x, y) >= min, `${st.key}/${ck}: ${name} kontrasti past (${contrast(x, y).toFixed(2)})`);
      need('asosiy matn / fon', P.ink, P.bg, 7);
      need('asosiy matn / karta', P.ink, P.card, 7);
      need('sarlavha / fon', P.title, P.bg, 7);
      need('kichik sarlavha / karta', P.head, P.card, 4.5);
      need('izoh / fon', P.text2, P.bg, 4.5);
      need('oq matn / asosiy rang', 'FFFFFF', P.accent, 3);
      need('oq matn / jadval sarlavhasi', 'FFFFFF', P.tblHead, 3.5);
      need('oq matn / toʻq slayd foni', 'FFFFFF', P.dkBg, 6);
      need('ochiq rang / toʻq slayd foni', P.soft, P.dkBg, 4.5);
      need('raqam / toʻq slayd belgisi', P.dkOn, P.dkAcc, 3.5);
    }
  }
  ok('barcha koʻrinish va ranglarda matn fonda yaxshi koʻrinadi (kontrast)');

  console.log(`\nHamma tekshiruvlar yaxshi (${n} ta).`);
})().catch((e) => {
  console.error('\n❌', e.message);
  process.exit(1);
});
