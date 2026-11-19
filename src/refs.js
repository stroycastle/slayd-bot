// AI yozgan manbalar roʻyxatini tabiiy holatga keltirish: veb-manzillar va "murojaat sanasi" kabi qoʻshimchalar olib tashlanadi.
// Talabaning oʻz roʻyxati (foydalanuvchi bergan) boʻlsa, manzillarga tegilmaydi (faqat sana qoʻshimchasi olinadi).

const ACCESS = '(?:murojaat sanasi|murojaat qilingan sana|мурожаат санаси|дата обращения|дата доступа|kiriw sánesi|accessed|date accessed|retrieved)';
// (murojaat sanasi: 19.11.2026)  yoki  [accessed: ...]
const ACCESS_BRACKET = new RegExp(`\\s*[(\\[]\\s*${ACCESS}[^)\\]]*[)\\]]`, 'gi');
// , murojaat sanasi: 19.11.2026  (qavssiz)
const ACCESS_PLAIN = new RegExp(`[,;.]?\\s*${ACCESS}\\s*:?\\s*[\\d./-]{6,10}\\.?`, 'gi');
// https://...  www....
const URL_RE = /[,;]?\s*(?:https?:\/\/|www\.)[^\s)]+/gi;

/** Bitta manba qatorini tozalaydi. Juda qisqa qolsa (<8 belgi) '' qaytaradi. */
function scrubReference(s, { links = true } = {}) {
  let t = String(s == null ? '' : s);
  t = t.replace(ACCESS_BRACKET, '').replace(ACCESS_PLAIN, '');
  if (links) t = t.replace(URL_RE, '');
  t = t
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s,;:–—-]+$/, '')
    .replace(/\s+([,.;])/g, '$1')
    .trim();
  return t.length < 8 ? '' : t;
}

/** Roʻyxatni tozalaydi, boʻsh va takror qatorlarni tashlaydi. */
function scrubReferences(list, opts) {
  const seen = new Set();
  const out = [];
  for (const x of Array.isArray(list) ? list : []) {
    if (typeof x !== 'string') continue;
    const s = scrubReference(x, opts);
    const key = s.toLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** Taqdimotning "manbalar" slaydlaridagi roʻyxatni tozalaydi (deck oʻzgartiriladi). Foydalanuvchi oʻz roʻyxatini bergan boʻlsa links:false. */
function scrubDeck(deck, opts) {
  if (!deck || !Array.isArray(deck.slides)) return deck;
  for (const s of deck.slides) {
    if (s && s.layout === 'references' && Array.isArray(s.references)) {
      const cleaned = scrubReferences(s.references, opts);
      if (cleaned.length) s.references = cleaned;
    }
  }
  return deck;
}

module.exports = { scrubReference, scrubReferences, scrubDeck };
