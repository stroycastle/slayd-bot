// Qoraqalpoq tili (lotin, 2016-yilgi alifbo) uchun yordamchi funksiyalar.
// Alifbo: a á b d e f g ǵ h x í ı i j k l m n ń o ó p q r s t u ú v w y z, sh ch c
// Eski imloda urgʻu belgisi oʻrnida apostrof yozilgan edi (a' g' n' o' u'), AI ba'zan shuni yozadi.

const ACUTE = { a: 'á', A: 'Á', o: 'ó', O: 'Ó', u: 'ú', U: 'Ú', g: 'ǵ', G: 'Ǵ', n: 'ń', N: 'Ń' };
const OLD_APOSTROPHE = /([aAoOuUgGnN])['’ʼʻ‘´`]/g;

const ALLOWED = new Set(
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZáÁǵǴíÍıńŃóÓúÚ'.split('')
);

/** Eski apostrofli yozuvni yangi (á ǵ ń ó ú) yozuvga oʻtkazadi va belgilarni NFC ga keltiradi. */
function normalizeQq(s) {
  return String(s == null ? '' : s)
    .normalize('NFC')
    .replace(OLD_APOSTROPHE, (_, c) => ACUTE[c]);
}

/** Matndagi alifboga kirmaydigan harflar (oʻzbekcha ʻ ʼ, kirill, ç ş ğ va h.k.). */
function foreignChars(s) {
  const bad = new Set();
  for (const ch of String(s || '')) {
    if (/\p{L}/u.test(ch) && !ALLOWED.has(ch)) bad.add(ch);
  }
  return [...bad];
}

/** deck ichidagi barcha matnlarga fn qoʻllaydi (layout kaliti tegmaydi). */
function mapStrings(v, fn) {
  if (typeof v === 'string') return fn(v);
  if (Array.isArray(v)) return v.map((x) => mapStrings(x, fn));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = k === 'layout' ? x : mapStrings(x, fn);
    return o;
  }
  return v;
}

function allStrings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'layout') allStrings(x, out);
  return out;
}

/** Barcha matnni yangi imloga keltiradi. Adabiyotlar slaydi tegilmaydi: unda oʻzbekcha kitob nomlari va ismlar boʻlishi mumkin. */
function normalizeDeckQq(deck) {
  if (!deck || !Array.isArray(deck.slides)) return mapStrings(deck, normalizeQq);
  const out = mapStrings(Object.assign({}, deck, { slides: [] }), normalizeQq);
  out.slides = deck.slides.map((sl) => (sl && sl.layout === 'references' ? sl : mapStrings(sl, normalizeQq)));
  return out;
}

/**
 * Qoraqalpoqcha matnda qolib ketgan oʻzbekcha belgilar (ʻ ʼ) va kirill harflari (adabiyotlar slaydidan tashqari).
 * Qaytaradi: { count, chars }. Ismlardagi ü, é kabi harflar xato hisoblanmaydi.
 */
function leftovers(deck) {
  const chars = new Set();
  let count = 0;
  const scan = (v) => {
    for (const s of allStrings(v)) {
      for (const ch of s) {
        if (/[\u0400-\u04FF\u02BB\u02BC]/.test(ch)) { chars.add(ch); count++; }
      }
    }
  };
  scan({ title: deck && deck.title, subtitle: deck && deck.subtitle });
  for (const sl of (deck && deck.slides) || []) if (!sl || sl.layout !== 'references') scan(sl);
  return { count, chars: [...chars] };
}

/** deck ichidagi begona harflar roʻyxati (boʻsh boʻlsa — toza). */
function deckIssues(deck) {
  const bad = new Set();
  for (const s of allStrings(deck)) foreignChars(s).forEach((c) => bad.add(c));
  return [...bad];
}

module.exports = { normalizeQq, normalizeDeckQq, leftovers, foreignChars, deckIssues, mapStrings, allStrings };
