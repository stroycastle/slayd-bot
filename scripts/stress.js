// Chegaradagi eng uzun matn bilan sinov: matn qutilarga sig'ishini tekshirish uchun.
// Ishga tushirish: node scripts/stress.js uz|uzc|ru
const fs = require('fs');
const path = require('path');
const { buildDeck, normalizeDeck } = require('../src/deck');
const { toCyr } = require('../src/ai');

const lang = process.argv[2] || 'uz';
const BASE = {
  uz: 'Til tizimi tovush, soʻz va qoidalardan iborat boʻlib, ular bir-biri bilan chambarchas bogʻliq holda ishlaydi va nutqda namoyon boʻladi. ',
  uzc: toCyr('Til tizimi tovush, soʻz va qoidalardan iborat boʻlib, ular bir-biri bilan chambarchas bogʻliq holda ishlaydi va nutqda namoyon boʻladi. '),
  ru: 'Языковая система состоит из звуков, слов и правил, которые тесно связаны между собой и проявляются в живой речи говорящих людей. ',
}[lang];

// berilgan chegaragacha, so'z chegarasida kesilgan matn
const T = (max, off = 0) => {
  const src = (BASE.repeat(6)).slice(off);
  let t = src.slice(0, max);
  const cut = t.lastIndexOf(' ');
  return (cut > max * 0.6 ? t.slice(0, cut) : t).trim();
};
const items = (n, h, t) => Array.from({ length: n }, (_, i) => ({ head: T(h, i * 7), text: T(t, i * 11) }));

const raw = {
  title: T(90),
  subtitle: T(100),
  slides: [
    { layout: 'agenda', title: T(60), items: Array.from({ length: 7 }, (_, i) => ({ head: T(60, i * 5) })), notes: T(200) },
    { layout: 'definition', title: T(60), lead: T(220), items: items(4, 28, 110), note: T(130), notes: T(200) },
    { layout: 'definition', title: T(60), lead: T(220), note: T(130), notes: T(200) },
    { layout: 'cards', title: T(60), items: items(6, 28, 120), notes: T(200) },
    { layout: 'cards', title: T(60), items: items(3, 28, 120), notes: T(200) },
    { layout: 'cards', title: T(60), items: items(5, 28, 120), notes: T(200) },
    { layout: 'two_columns', title: T(60), columns: [0, 1].map((k) => ({ head: T(28, k * 3), bullets: Array.from({ length: 5 }, (_, i) => T(80, i * 9)) })), note: T(130), notes: T(200) },
    { layout: 'table', title: T(60), table: { header: [T(22), T(22, 4), T(22, 8), T(22, 12)], rows: Array.from({ length: 6 }, (_, r) => [T(70, r), T(70, r + 5), T(70, r + 9), T(70, r + 13)]) }, notes: T(200) },
    { layout: 'table', title: T(60), table: { header: [T(22), T(22, 4)], rows: Array.from({ length: 6 }, (_, r) => [T(70, r), T(70, r + 5)]) }, notes: T(200) },
    { layout: 'process', title: T(60), items: items(5, 26, 100), notes: T(200) },
    { layout: 'keypoint', title: T(60), lead: T(190), items: Array.from({ length: 3 }, (_, i) => ({ text: T(90, i * 6) })), notes: T(200) },
    { layout: 'rows', title: T(60), items: items(5, 28, 120), notes: T(200) },
    { layout: 'conclusion', title: T(60), items: Array.from({ length: 5 }, (_, i) => ({ text: T(130, i * 8) })), notes: T(200) },
    { layout: 'references', title: T(60), references: Array.from({ length: 8 }, (_, i) => T(170, i * 4)) },
  ],
};

(async () => {
  const deck = normalizeDeck(raw);
  const buf = await buildDeck(deck, {
    color: 'blue',
    lang,
    profile: { fullName: 'Nuriddinova Farangiz', group: '2606', university: 'OʻzDJTU', faculty: 'Xitoy filologiyasi' },
  });
  const out = path.join(__dirname, '..', 'out', `stress_${lang}.pptx`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buf);
  console.log('yozildi:', out, deck.slides.length + 1, 'slayd');
})();
