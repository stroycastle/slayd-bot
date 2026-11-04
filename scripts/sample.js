// Namunalar yasaydi (API kalitsiz): har xil rang va tilda. Natija: out/ papkasi.
// Ishga tushirish: npm run sample
process.env.MOCK_AI = '1';
const fs = require('fs');
const path = require('path');
const { generateDeck } = require('../src/ai');
const { buildDeck } = require('../src/deck');

const OUT = path.join(__dirname, '..', 'out');
fs.mkdirSync(OUT, { recursive: true });

const jobs = [
  { lang: 'uz', color: 'green', topic: 'Til va nutq' },
  { lang: 'uz', color: 'blue', topic: 'Til va nutq: asosiy tushunchalar va ularning oʻzaro bogʻliqligi' },
  { lang: 'uzc', color: 'red', topic: 'Тил ва нутқ' },
  { lang: 'ru', color: 'purple', topic: 'Язык и речь' },
  { lang: 'uz', color: 'orange', topic: 'Til va nutq' },
  { lang: 'uz', color: 'gray', topic: 'Til va nutq' },
];
const profile = { fullName: 'Nuriddinova Farangiz', group: '2606', university: 'OʻzDJTU', faculty: 'Xitoy filologiyasi' };

(async () => {
  for (const j of jobs) {
    const deck = await generateDeck({ topic: j.topic, slides: 12, lang: j.lang });
    const buf = await buildDeck(deck, { color: j.color, lang: j.lang, profile });
    const file = path.join(OUT, `namuna_${j.lang}_${j.color}.pptx`);
    fs.writeFileSync(file, buf);
    console.log('yozildi:', file, deck.slides.length + 1, 'slayd');
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
