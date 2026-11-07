// 20 xil koʻrinish (uslub). Har bir uslub shrift, fon, karta shakli, raqam belgisi, sarlavha, bezak,
// pastki qator va titul slaydini oʻzgartiradi; rangni (yashil, koʻk...) foydalanuvchi alohida tanlaydi.
const WHITE = 'FFFFFF';

/** Ikki rang orasidagi oraliq rang (t: 0..1). */
function mix(a, b, t) {
  const pa = [0, 2, 4].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [0, 2, 4].map((i) => parseInt(b.slice(i, i + 2), 16));
  return pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}

// mode: fon (white | cream | tint | dark)        card: karta shakli (soft pill flat line frame dash shadow left top)
// badge: raqam belgisi (circle square rounded ring diamond hexagon plain)
// title: sarlavha (plain rule line bar band center caps)   deco: bezak (none side top corner dots frame frame2)
// footer: pastki qator (plain line band pill center)       cover: titul kompozitsiyasi, cmode: titul foni (dark | light | acc)
// dk: toʻq slaydlar (asosiy fikr, xulosa, boʻlim) foni: dark yoki acc (toʻq rang)    bandAcc: sarlavha tasmasi asosiy rangda
const STYLES = [
  { key: 'klassik', name: 'Klassik', fh: 'Cambria', fb: 'Calibri', mode: 'white', card: 'soft', badge: 'circle', title: 'plain', deco: 'none', footer: 'plain', cover: 'orbit', cmode: 'dark', dk: 'dark' },
  { key: 'minimal', name: 'Minimal', fh: 'Arial', fb: 'Arial', mode: 'white', card: 'line', badge: 'plain', title: 'rule', deco: 'none', footer: 'line', cover: 'bar', cmode: 'light', dk: 'dark' },
  { key: 'zamonaviy', name: 'Zamonaviy', fh: 'Calibri', fb: 'Calibri', mode: 'tint', card: 'shadow', badge: 'rounded', title: 'bar', deco: 'corner', footer: 'pill', cover: 'block', cmode: 'light', dk: 'dark' },
  { key: 'tungi', name: 'Tungi', fh: 'Arial', fb: 'Calibri', mode: 'dark', card: 'soft', badge: 'circle', title: 'plain', deco: 'dots', footer: 'plain', cover: 'ring', cmode: 'dark', dk: 'acc' },
  { key: 'gazeta', name: 'Gazeta', fh: 'Times New Roman', fb: 'Arial', mode: 'cream', card: 'top', badge: 'plain', title: 'line', deco: 'none', footer: 'line', cover: 'editorial', cmode: 'light', dk: 'dark' },
  { key: 'kompaniya', name: 'Kompaniya', fh: 'Calibri', fb: 'Calibri', mode: 'white', card: 'shadow', badge: 'square', title: 'band', deco: 'none', footer: 'band', cover: 'split', cmode: 'dark', dk: 'dark' },
  { key: 'texno', name: 'Texno', fh: 'Courier New', fb: 'Arial', mode: 'dark', card: 'frame', badge: 'diamond', title: 'plain', deco: 'dots', footer: 'line', cover: 'tech', cmode: 'dark', dk: 'acc' },
  { key: 'yumshoq', name: 'Yumshoq', fh: 'Cambria', fb: 'Calibri', mode: 'cream', card: 'pill', badge: 'ring', title: 'center', deco: 'corner', footer: 'center', cover: 'bubbles', cmode: 'light', dk: 'dark' },
  { key: 'geometrik', name: 'Geometrik', fh: 'Arial', fb: 'Arial', mode: 'white', card: 'left', badge: 'hexagon', title: 'bar', deco: 'side', footer: 'plain', cover: 'strips', cmode: 'light', dk: 'dark' },
  { key: 'akademik', name: 'Akademik', fh: 'Times New Roman', fb: 'Times New Roman', mode: 'white', card: 'frame', badge: 'plain', title: 'center', deco: 'frame2', footer: 'center', cover: 'frame', cmode: 'light', dk: 'dark' },
  { key: 'jasur', name: 'Jasur', fh: 'Arial', fb: 'Arial', mode: 'white', card: 'flat', badge: 'circle', title: 'band', bandAcc: true, deco: 'none', footer: 'pill', cover: 'solid', cmode: 'acc', dk: 'acc' },
  { key: 'nafis', name: 'Nafis', fh: 'Cambria', fb: 'Cambria', mode: 'cream', card: 'dash', badge: 'diamond', title: 'center', deco: 'frame', footer: 'center', cover: 'banner', cmode: 'light', dk: 'dark' },
  { key: 'yarimtun', name: 'Yarim tun', fh: 'Cambria', fb: 'Calibri', mode: 'dark', card: 'left', badge: 'rounded', title: 'rule', deco: 'side', footer: 'line', cover: 'strips', cmode: 'dark', dk: 'acc' },
  { key: 'pastel', name: 'Pastel', fh: 'Calibri', fb: 'Calibri', mode: 'tint', card: 'soft', badge: 'rounded', title: 'plain', deco: 'corner', footer: 'plain', cover: 'split', cmode: 'light', dk: 'dark' },
  { key: 'blok', name: 'Blok', fh: 'Arial', fb: 'Arial', mode: 'white', card: 'flat', badge: 'square', title: 'bar', deco: 'top', footer: 'band', cover: 'bar', cmode: 'dark', dk: 'dark' },
  { key: 'jurnal', name: 'Jurnal', fh: 'Times New Roman', fb: 'Calibri', mode: 'white', card: 'top', badge: 'plain', title: 'caps', deco: 'none', footer: 'line', cover: 'editorial', cmode: 'dark', dk: 'dark' },
  { key: 'oyna', name: 'Oyna', fh: 'Calibri', fb: 'Calibri', mode: 'dark', card: 'line', badge: 'ring', title: 'plain', deco: 'corner', footer: 'center', cover: 'bubbles', cmode: 'dark', dk: 'acc' },
  { key: 'retro', name: 'Retro', fh: 'Cambria', fb: 'Arial', mode: 'cream', card: 'frame', badge: 'square', title: 'band', bandAcc: true, deco: 'frame', footer: 'line', cover: 'frame', cmode: 'acc', dk: 'dark' },
  { key: 'rasmiy', name: 'Rasmiy', fh: 'Times New Roman', fb: 'Times New Roman', mode: 'tint', card: 'flat', badge: 'rounded', title: 'line', deco: 'top', footer: 'line', cover: 'banner', cmode: 'acc', dk: 'dark' },
  { key: 'tabiat', name: 'Tabiat', fh: 'Cambria', fb: 'Calibri', mode: 'cream', card: 'soft', badge: 'circle', title: 'bar', deco: 'dots', footer: 'pill', cover: 'orbit', cmode: 'light', dk: 'acc' },
];

const STYLE_KEYS = STYLES.map((s) => s.key);
const DEFAULT_STYLE = 'klassik';

function styleOf(key) {
  return STYLES.find((s) => s.key === key) || STYLES[0];
}

/** Tasodifiy uslub kaliti (exclude: shu uslubdan boshqasi). */
function randomStyle(exclude) {
  const keys = STYLE_KEYS.filter((k) => k !== exclude);
  return keys[Math.floor(Math.random() * keys.length)];
}

/**
 * Palitra + uslubdan "rollar" toʻplamini tuzadi. Slayd turlari faqat shu rollardan foydalanadi:
 *   bg fon, card karta toʻldirishi, paper oq karta, ink asosiy matn, title sarlavha, head kichik sarlavha, num yirik raqam,
 *   tblHead/tblAlt/tblBase jadval, dkBg/dkAcc/dkOn toʻq slaydlar, bandFill sarlavha tasmasi.
 * Eski kalitlar (dark, accent, accentDark, soft, tint, muted, text2, line) ham saqlanadi, toʻq fonda moslab oʻzgartiriladi.
 */
function makeTheme(base, st) {
  const P = Object.assign({}, base);
  P.st = st;
  const dm = st.mode === 'dark';
  if (dm) {
    P.bg = base.dark;
    P.card = mix(base.dark, WHITE, 0.1);
    P.paper = mix(base.dark, WHITE, 0.13);
    P.ink = 'EEF2F3';
    P.title = WHITE;
    P.head = base.soft;
    P.num = base.soft;
    P.text2 = mix(base.soft, base.dark, 0.2);
    P.muted = mix(base.soft, base.dark, 0.4);
    P.line = mix(base.dark, WHITE, 0.22);
    P.tblHead = base.accent;
    P.tblAlt = mix(base.dark, WHITE, 0.08);
    P.tblBase = base.dark;
    P.bandFill = base.accent;
    P.accentDark = base.accent;
    P.accent = mix(base.accent, base.soft, 0.12);
  } else {
    const bg = st.mode === 'cream' ? mix('FBF6EC', base.tint, 0.25) : st.mode === 'tint' ? base.tint : WHITE;
    P.bg = bg;
    P.card = st.mode === 'tint' ? WHITE : st.mode === 'cream' ? mix(bg, base.accent, 0.07) : base.tint;
    P.paper = WHITE;
    P.ink = base.dark;
    P.title = base.dark;
    P.head = base.accentDark;
    P.num = base.accent;
    P.tblHead = base.dark;
    P.tblAlt = st.mode === 'white' ? base.tint : st.mode === 'tint' ? WHITE : P.card;
    P.tblBase = st.mode === 'white' ? WHITE : bg;
    P.bandFill = st.bandAcc ? base.accent : base.dark;
  }
  // toʻq slaydlar (asosiy fikr, xulosa, boʻlim)
  const acc = st.dk === 'acc';
  P.dkBg = acc ? base.accentDark : base.dark;
  P.dkAcc = acc ? base.soft : P.accent;
  P.dkOn = acc ? base.dark : WHITE;
  return P;
}

module.exports = { STYLES, STYLE_KEYS, DEFAULT_STYLE, styleOf, randomStyle, makeTheme, mix };
