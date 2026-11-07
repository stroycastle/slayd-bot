// Uslub tanlash uchun rasmlarni tayyorlaydi: har bir rang uchun 20 uslubning titul va oddiy slaydi bitta rasmda.
// Natija: assets/previews/<rang>.jpg (bot shuni uslub tanlash bosqichida yuboradi).
// Kerak: LibreOffice (soffice), pdftoppm, python3 + Pillow. Faqat koʻrinish oʻzgarganda qayta ishga tushiriladi.
// Ishga tushirish: node scripts/make-previews.js [rang ...]
process.env.MOCK_AI = '1';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildDeck, PALETTES, STYLES } = require('../src/deck');
const { generateDeck } = require('../src/ai');
const { toPdf } = require('../src/pdf');

const OUT = path.join(__dirname, '..', 'assets', 'previews');

(async () => {
  const colors = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PALETTES);
  const deck = await generateDeck({ topic: 'Til va nutq', slides: 8, lang: 'uz' });
  const profile = { fullName: 'Ism Familiya', group: '101', university: 'Universitet', faculty: 'Fakultet' };
  fs.mkdirSync(OUT, { recursive: true });
  for (const color of colors) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prev-'));
    try {
      for (const st of STYLES) {
        const file = path.join(dir, `${st.key}.pptx`);
        fs.writeFileSync(file, await buildDeck(deck, { color, lang: 'uz', style: st.key, profile }));
        const pdf = await toPdf(file);
        const r = spawnSync('pdftoppm', ['-r', '60', '-png', '-f', '1', '-l', '4', pdf, path.join(dir, st.key)]);
        if (r.status !== 0) throw new Error('pdftoppm ishlamadi');
      }
      const names = STYLES.map((s) => s.name).join(',');
      const r = spawnSync('python3', [path.join(__dirname, 'compose_previews.py'), dir, path.join(OUT, `${color}.jpg`), STYLES.map((s) => s.key).join(','), names], { stdio: 'inherit' });
      if (r.status !== 0) throw new Error('rasm yigʻilmadi');
      console.log('✓', color);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
