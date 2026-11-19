// AI yozgan manbalar roʻyxatini tabiiy holatga keltirish: veb-manzillar va "murojaat sanasi" kabi qoʻshimchalar olib tashlanadi.
// Talabaning oʻz roʻyxati (foydalanuvchi bergan) boʻlsa, manzillarga tegilmaydi (faqat sana qoʻshimchasi olinadi).

const ACCESS = '(?:murojaat sanasi|murojaat qilingan sana|мурожаат санаси|дата обращения|дата доступа|kiriw sánesi|accessed|date accessed|retrieved)';
// (murojaat sanasi: 19.11.2026)  yoki  [accessed: ...]
const ACCESS_BRACKET = new RegExp(`\\s*[(\\[]\\s*${ACCESS}[^)\\]]*[)\\]]`, 'gi');
// , murojaat sanasi: 19.11.2026  (qavssiz)
const ACCESS_PLAIN = new RegExp(`[,;.]?\\s*${ACCESS}\\s*:?\\s*[\\d./-]{6,10}\\.?`, 'gi');
// https://...  www....
const URL_RE = /[,;]?\s*(?:https?:\/\/|www\.)[^\s)]+/gi;
// Toʻliq sana (2026-11-18, 19.11.2026): manba yozuvida kerak emas (yil yoki "(2024)" qoladi)
const DATE = '(?:\\d{4}[-./]\\d{1,2}[-./]\\d{1,2}|\\d{1,2}[-./]\\d{1,2}[-./]\\d{2,4})';
// qavs ichida toʻliq sana boʻlsa, butun qavs olib tashlanadi: "(ingliz tilida, 2026-11-18 yangilangan)"
const PAREN_DATE = new RegExp(`\\s*[(\\[][^)\\]]*${DATE}[^)\\]]*[)\\]]`, 'g');
// qavssiz: ", yangilangan: 2026-11-18", "— updated 2026-11-18", "2026-11-18 yangilangan"
const UPDATED = '(?:updated|yangilangan|yangilandi|обновлено|обновлён|jańalanǵan|jańalandı)';
const UPDATED_PLAIN = new RegExp(`[,;—–-]?\\s*(?:${UPDATED}\\s*:?\\s*${DATE}|${DATE}\\s*(?:da\\s+)?${UPDATED})`, 'gi');
// faqat tilni bildiruvchi qavs: "(ingliz tilida)", "(in English)", "(на английском языке)"
const LANG_NOTE = /\s*[(\[]\s*(?:(?:ingliz|inglizcha|rus|ruscha|oʻzbek|uzbek|o'zbek)\s*tilida|in\s+(?:english|russian|uzbek)|на\s+(?:английском|русском)(?:\s+языке)?|english|ingliz)\s*[)\]]/gi;

/** Bitta manba qatorini tozalaydi. Juda qisqa qolsa (<8 belgi) '' qaytaradi. */
function scrubReference(s, { links = true } = {}) {
  let t = String(s == null ? '' : s);
  // links:true — AI yozgan roʻyxat (qattiq tozalanadi); links:false — talabaning oʻz roʻyxati (faqat "murojaat sanasi" olinadi)
  if (links) t = t.replace(PAREN_DATE, '');
  t = t.replace(ACCESS_BRACKET, '').replace(ACCESS_PLAIN, '');
  if (links) t = t.replace(UPDATED_PLAIN, '').replace(LANG_NOTE, '').replace(URL_RE, '');
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
