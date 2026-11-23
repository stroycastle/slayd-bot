// Oʻzbekcha (lotin) imlo tuzatuvchi.
// AI koʻpincha oddiy apostrof yozadi: o'zbek, g'oya, ta'rif, ma'naviy. Rasmiy imlo: oʻ va gʻ — ʻ (U+02BB), tutuq belgisi — ʼ (U+02BC).
// Faqat oʻzbek (lotin) matniga qoʻllanadi. Inglizcha qismlar (rasm soʻrovi, adabiyotlar) tegilmaydi.

const MARKS = "'’‘`´ʻʼ";
const OG = new RegExp(`([oOgG])[${MARKS}]`, 'g'); // o' g' -> oʻ gʻ
const TUTUQ = new RegExp(`(\\p{L})[${MARKS}](?=\\p{L})`, 'gu'); // ma'no -> maʼno (harf + belgi + harf); oʻ/gʻ oldin vaqtincha \u0001 bilan belgilanadi

/** Bitta matnni rasmiy imloga keltiradi. */
function normalizeUz(s) {
  if (typeof s !== 'string' || !/['’‘`´ʻʼ]/.test(s)) return s;
  // oʻ/gʻ avval vaqtincha belgilanadi, shunda keyingi qoida ularni tutuq belgisiga almashtirib yubormaydi
  return s.replace(OG, '$1\u0001').replace(TUTUQ, '$1ʼ').replace(/\u0001/g, 'ʻ');
}

// Bu kalitlar ichidagi matn tegilmaydi: layout (xizmat kaliti), imageQuery va image (inglizcha, havola, muallif), references (kitob nomlari)
const SKIP = new Set(['layout', 'imageQuery', 'image', 'references']);

/** Obyekt/massiv ichidagi hamma matnga normalizeUz ni qoʻllaydi (yangi nusxa qaytaradi). */
function mapUz(v) {
  if (typeof v === 'string') return normalizeUz(v);
  if (Array.isArray(v)) return v.map(mapUz);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = SKIP.has(k) ? x : mapUz(x);
    return o;
  }
  return v;
}

module.exports = { normalizeUz, mapUz };
