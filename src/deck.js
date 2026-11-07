// Slayd yasash dvigateli: AI qaytargan tuzilmali matndan (JSON) .pptx fayl yasaydi.
const PptxGenJS = require('pptxgenjs');
const { STYLES, STYLE_KEYS, DEFAULT_STYLE, styleOf, randomStyle, makeTheme, mix } = require('./styles');

// ---------------------------------------------------------------- ranglar
const PALETTES = {
  green: { label: 'Yashil', dark: '1B2F33', accent: '2E7D78', accentDark: '1F5C58', soft: 'A8D8B9', tint: 'EDF2F0', muted: '6F878B', text2: '3E5C60', line: 'D5DEDC' },
  blue: { label: "Ko'k", dark: '14213D', accent: '2F6DB5', accentDark: '1D4E89', soft: 'A9CBF0', tint: 'EAF0F8', muted: '6B7F99', text2: '3A4F6B', line: 'D3DCE8' },
  red: { label: 'Qizil', dark: '3A1218', accent: 'B03A48', accentDark: '8A2432', soft: 'F2B8BE', tint: 'F8EDEE', muted: '8F6F73', text2: '5E3A40', line: 'E8D5D7' },
  purple: { label: 'Binafsha', dark: '2A1B3D', accent: '7B4FB0', accentDark: '5B3590', soft: 'D3BEEF', tint: 'F1ECF8', muted: '80718F', text2: '4F3E66', line: 'DDD3EA' },
  orange: { label: "To'q sariq", dark: '3A2410', accent: 'C2680F', accentDark: '8F4A08', soft: 'F5CE9E', tint: 'FBF1E6', muted: '99826B', text2: '6B4A28', line: 'EBDCCB' },
  gray: { label: 'Kulrang', dark: '1E1E24', accent: '4B5563', accentDark: '374151', soft: 'D1D5DB', tint: 'F1F2F4', muted: '7B8089', text2: '4B5563', line: 'DADCE0' },
};

// ---------------------------------------------------------------- tillar
const LABELS = {
  uz: { work: 'Mustaqil ish', by: 'Bajardi', group: 'Guruh', uni: 'Universitet', fac: 'Fakultet' },
  uzc: { work: 'Мустақил иш', by: 'Бажарди', group: 'Гуруҳ', uni: 'Университет', fac: 'Факультет' },
  ru: { work: 'Самостоятельная работа', by: 'Выполнил(а)', group: 'Группа', uni: 'Университет', fac: 'Факультет' },
};

const DEFAULT_TITLES = {
  uz: { agenda: 'Reja', conclusion: 'Xulosa', references: 'Foydalanilgan adabiyotlar' },
  uzc: { agenda: 'Режа', conclusion: 'Хулоса', references: 'Фойдаланилган адабиётлар' },
  ru: { agenda: 'План', conclusion: 'Заключение', references: 'Список литературы' },
};

const LAYOUTS = [
  'agenda', 'definition', 'cards', 'two_columns', 'table', 'process', 'keypoint', 'rows', 'conclusion', 'references',
  'stats', 'timeline', 'hub', 'split', 'pyramid', 'cycle', 'versus', 'section',
];

// ---------------------------------------------------------------- o'lchamlar
const W = 13.333;
const M = 0.7;
const CW = W - 2 * M;
// Shriftlar uslubga qarab buildDeck boshida oʻrnatiladi (chizish toʻliq sinxron, shuning uchun xavfsiz)
let FH = 'Cambria'; // sarlavha
let FB = 'Calibri'; // asosiy matn

// ---------------------------------------------------------------- matn sig'ishini hisoblash
const CYR = /[Ѐ-ӿ]/;

// Shriftlarning Calibri'ga nisbatan kengligi (LibreOffice'da ham shu shriftlarning metrik analoglari ishlatiladi)
const FACE_W = { Cambria: 1.1, Calibri: 1.0, Arial: 1.12, 'Times New Roman': 1.0, 'Courier New': 1.22 };

function charW(text, fs, bold, face, wide = 1) {
  let k = CYR.test(text) ? 0.56 : 0.5;
  if (bold) k *= 1.07;
  k *= (FACE_W[face] || 1) * (wide || 1);
  return (fs * k) / 72;
}

function lineCount(text, fs, w, o = {}) {
  const per = Math.max(4, Math.floor(w / charW(text, fs, o.bold, o.face, o.wide)));
  let lines = 0;
  for (const para of String(text).split('\n')) {
    lines++;
    let cur = 0;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const l = word.length;
      if (cur === 0) {
        lines += Math.floor((l - 1) / per);
        cur = ((l - 1) % per) + 1;
      } else if (cur + 1 + l <= per) cur += 1 + l;
      else {
        lines++;
        lines += Math.floor((l - 1) / per);
        cur = ((l - 1) % per) + 1;
      }
    }
  }
  return lines;
}

const textH = (text, fs, w, o) => (lineCount(text, fs, w, o) * fs * 1.22) / 72;

/** Berilgan qutiga sig'adigan eng katta shriftni topadi; baribir sig'masa matnni qisqartiradi. */
function fitText(text, w, h, max, min, o = {}) {
  text = String(text || '');
  // noBreak: qisqa sarlavha va raqamlar uchun, shrift eng uzun soʻz bir qatorga sigʻadigan darajagacha kichraytiriladi
  const longest = o.noBreak ? Math.max(1, ...text.split(/\s+/).map((x) => x.length)) : 0;
  for (let fs = max; fs >= min; fs--) {
    if (o.noBreak && longest * charW(text, fs, o.bold, o.face, o.wide) * 1.25 > w) continue;
    if (textH(text, fs, w, o) <= h) return { text, fs };
  }
  let t = text;
  const sentences = t.split(/(?<=[.!?])\s+/);
  while (sentences.length > 1 && textH(sentences.join(' '), min, w, o) > h) sentences.pop();
  t = sentences.join(' ');
  if (textH(t, min, w, o) > h) {
    const words = t.split(/\s+/);
    while (words.length > 3 && textH(words.join(' ') + '…', min, w, o) > h) words.pop();
    t = words.join(' ').replace(/[,;:\s]+$/, '') + '…';
  }
  return { text: t, fs: min };
}

function bulletsH(items, fs, w) {
  const iw = w - 0.4;
  let lines = 0;
  for (const it of items) lines += lineCount(it, fs, iw, { face: FB });
  return (lines * fs * 1.22) / 72 + ((items.length - 1) * 7) / 72;
}

function fitBullets(items, w, h, max, min) {
  items = items.slice();
  for (let fs = max; fs >= min; fs--) if (bulletsH(items, fs, w) <= h) return { items, fs };
  while (items.length > 2 && bulletsH(items, min, w) > h) items.pop();
  return { items, fs: min };
}

// ---------------------------------------------------------------- chizish yordamchilari
function addFit(s, text, x, y, w, h, o = {}) {
  if (!text) return;
  const { text: t, fs } = fitText(text, w, h, o.max || 18, o.min || 12, { bold: o.bold, face: o.font || FB, wide: o.wide, noBreak: o.noBreak });
  s.addText(t, {
    x, y, w, h,
    fontFace: o.font || FB,
    fontSize: fs,
    bold: !!o.bold,
    italic: !!o.italic,
    color: o.color,
    align: o.align || 'left',
    valign: o.valign || 'top',
    margin: 0,
    isTextBox: true,
  });
}

function addBullets(s, items, x, y, w, h, o = {}) {
  const { items: its, fs } = fitBullets(items, w, h, o.max || 18, o.min || 12);
  const runs = its.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < its.length - 1, paraSpaceAfter: 7 } }));
  s.addText(runs, { x, y, w, h, fontFace: FB, fontSize: fs, color: o.color, valign: 'top', margin: 0, isTextBox: true });
}

// ---------------------------------------------------------------- uslub: karta, raqam belgisi, sarlavha, bezak, pastki qator
const CARDS = {
  soft: { r: 0.12 },
  pill: { r: 0.32 },
  flat: { r: 0 },
  line: { r: 0.12, line: 'soft', w: 1.5, fill: 'bg' },
  frame: { r: 0, line: 'acc', w: 2, fill: 'bg' },
  dash: { r: 0.12, line: 'acc', w: 1.5, dash: true, fill: 'bg' },
  shadow: { r: 0.1, fill: 'paper', shadow: true },
  left: { r: 0, bar: 'left' },
  top: { r: 0, bar: 'top' },
};

const rectShape = (s, x, y, w, h, color, transparency) =>
  s.addShape('rect', { x, y, w, h, fill: transparency ? { color, transparency } : { color }, line: { type: 'none' } });
const ovalShape = (s, x, y, d, color, transparency) =>
  s.addShape('ellipse', { x, y, w: d, h: d, fill: transparency ? { color, transparency } : { color }, line: { type: 'none' } });
const outlineShape = (s, type, x, y, w, h, color, width, transparency) =>
  s.addShape(type, { x, y, w, h, fill: { color: 'FFFFFF', transparency: 100 }, line: { color, width, transparency: transparency || 0 } });

/** Karta. fill berilsa: shu rangda toʻldirilgan panel (uslubning burchak shakli bilan), aks holda uslubdagi karta. */
function card(s, P, x, y, w, h, fill) {
  const c = CARDS[P.st.card];
  const r = Math.min(c.r, Math.min(w, h) * 0.45);
  const shape = r > 0 ? 'roundRect' : 'rect';
  const o = { x, y, w, h };
  if (r > 0) o.rectRadius = r;
  if (c.shadow) o.shadow = { type: 'outer', color: '000000', opacity: 0.18, blur: 7, offset: 2, angle: 90 };
  if (fill) {
    s.addShape(shape, Object.assign(o, { fill: { color: fill }, line: { type: 'none' } }));
    return;
  }
  o.fill = { color: c.fill ? P[c.fill] : P.card };
  if (c.line) {
    const lc = c.line === 'acc' ? P.accent : mix(P.accent, P.bg, 0.55);
    o.line = { color: lc, width: c.w, dashType: c.dash ? 'dash' : 'solid' };
  } else o.line = { type: 'none' };
  s.addShape(shape, o);
  if (c.bar === 'left') rectShape(s, x, y, 0.09, h, P.accent);
  if (c.bar === 'top') rectShape(s, x, y, w, 0.07, P.accent);
}

/** Raqam belgisi (1, 2, 3...). fill/color: toʻq slaydlarda boshqa rang berish uchun. */
function badge(s, P, n, x, y, d, fill, color) {
  const kind = P.st.badge;
  const main = fill || P.accent;
  const fs = d >= 0.55 ? 20 : d >= 0.45 ? 16 : 13;
  let txt = String(n);
  let tc = color || 'FFFFFF';
  let font = FB;
  let size = fs;
  if (kind === 'circle') ovalShape(s, x, y, d, main);
  else if (kind === 'square') rectShape(s, x, y, d, d, main);
  else if (kind === 'rounded') s.addShape('roundRect', { x, y, w: d, h: d, rectRadius: d * 0.28, fill: { color: main }, line: { type: 'none' } });
  else if (kind === 'diamond') { s.addShape('diamond', { x, y, w: d, h: d, fill: { color: main }, line: { type: 'none' } }); size = Math.round(fs * 0.85); }
  else if (kind === 'hexagon') { s.addShape('hexagon', { x, y, w: d, h: d, fill: { color: main }, line: { type: 'none' } }); size = Math.round(fs * 0.9); }
  else if (kind === 'ring') { outlineShape(s, 'ellipse', x + 0.02, y + 0.02, d - 0.04, d - 0.04, main, 2.25); tc = main; }
  else { txt = String(n).padStart(2, '0'); tc = main; font = FH; size = fs + 4; } // plain: faqat raqam
  s.addText(txt, { x, y, w: d, h: d, fontFace: font, fontSize: size, bold: true, color: tc, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
}

const DECO = {
  none() {},
  side(s, P, dark, ac) { rectShape(s, 0, 0, 0.28, 7.5, ac); },
  top(s, P, dark, ac) { rectShape(s, 0, 0, W, 0.2, ac); },
  corner(s, P, dark, ac) {
    ovalShape(s, W - 2.1, -1.6, 3.6, ac, 88);
    ovalShape(s, W - 0.95, 0.55, 1.5, P.soft, 75);
  },
  dots(s, P, dark, ac) {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) ovalShape(s, W - 1.75 + c * 0.24, 0.3 + r * 0.24, 0.09, ac, 60);
  },
  frame(s, P, dark, ac) { outlineShape(s, 'rect', 0.25, 0.22, W - 0.5, 7.06, ac, 1.25); },
  frame2(s, P, dark, ac) {
    outlineShape(s, 'rect', 0.22, 0.2, W - 0.44, 7.1, ac, 2);
    outlineShape(s, 'rect', 0.34, 0.32, W - 0.68, 6.86, ac, 0.5);
  },
};

const NO_TITLE = new Set(['section']); // sarlavhasini oʻzi chizadigan turlar

function slideBase(pres, P, d, meta, dark) {
  const st = P.st;
  const s = pres.addSlide();
  s.background = { color: dark ? P.dkBg : P.bg };
  const ac = dark ? P.dkAcc : P.accent;
  const band = !dark && st.title === 'band';
  if (band) rectShape(s, 0, 0, W, 1.4, P.bandFill);
  if (d.layout !== 'section') DECO[st.deco](s, P, dark, ac);
  if (!NO_TITLE.has(d.layout) && d.title) {
    const caps = st.title === 'caps';
    const center = st.title === 'center';
    addFit(s, caps ? d.title.toUpperCase() : d.title, M, band ? 0.2 : 0.4, CW, 1.0, {
      max: 34, min: 22, bold: true, font: FH, color: dark || band ? 'FFFFFF' : P.title, valign: 'middle', align: center ? 'center' : 'left', wide: caps ? 1.15 : 1,
    });
    if (st.title === 'rule' || caps) rectShape(s, M, 1.43, 1.2, 0.06, ac);
    if (center) rectShape(s, W / 2 - 0.6, 1.43, 1.2, 0.05, ac);
    if (st.title === 'line') rectShape(s, M, 1.45, CW, 0.025, ac);
    if (st.title === 'bar') rectShape(s, M - 0.3, 0.55, 0.1, 0.7, ac);
  }
  // pastki qator: qisqa sarlavha va slayd raqami
  const short = String(meta.deckTitle || '').slice(0, 70);
  const fc = dark ? P.soft : P.muted;
  const num = { x: W - M - 0.8, y: 6.98, w: 0.8, h: 0.3, fontFace: FB, fontSize: 11, color: fc, align: 'right' };
  const foot = { x: M, y: 6.98, w: 9, h: 0.3, fontFace: FB, fontSize: 10, color: fc, margin: 0, isTextBox: true };
  const f = st.footer;
  if (f === 'line') rectShape(s, M, 6.9, CW, 0.015, dark ? P.soft : P.line, dark ? 70 : 0);
  if (f === 'band' && !dark) {
    rectShape(s, 0, 7.08, W, 0.42, P.bandFill);
    Object.assign(foot, { y: 7.17, color: 'FFFFFF' });
    Object.assign(num, { y: 7.17, color: 'FFFFFF' });
  }
  if (f === 'pill') {
    ovalShape(s, W - M - 0.44, 6.92, 0.44, ac);
    Object.assign(num, { x: W - M - 0.44, y: 6.92, w: 0.44, h: 0.44, align: 'center', valign: 'middle', bold: true, color: dark ? P.dkOn : 'FFFFFF' });
  }
  if (f === 'center') Object.assign(num, { x: W / 2 - 0.4, align: 'center' });
  if (f !== 'center') s.addText(short, foot);
  s.slideNumber = num;
  if (d.notes) s.addNotes(String(d.notes));
  return s;
}

// ---------------------------------------------------------------- slayd turlari
function layoutAgenda(s, P, d) {
  const items = d.items.slice(0, 8);
  const n = items.length;
  const twoCols = n > 4;
  const rows = twoCols ? Math.ceil(n / 2) : n;
  const cw = twoCols ? (CW - 0.3) / 2 : CW;
  const h = Math.min(twoCols ? 1.2 : 1.05, (5.0 - (rows - 1) * 0.22) / rows);
  items.forEach((it, i) => {
    const col = twoCols && i >= rows ? 1 : 0;
    const row = twoCols ? i % rows : i;
    const x = M + col * (cw + 0.3);
    const y = 1.75 + row * (h + 0.22);
    card(s, P, x, y, cw, h);
    badge(s, P, i + 1, x + 0.3, y + (h - 0.6) / 2, 0.6);
    addFit(s, it.head || it.text, x + 1.2, y + 0.1, cw - 1.5, h - 0.2, { max: 20, min: 13, valign: 'middle', color: P.ink });
  });
}

function layoutDefinition(s, P, d) {
  const items = d.items.slice(0, 4);
  const hasItems = items.length > 0;
  const leadH = hasItems ? 1.75 : 3.0;
  card(s, P, M, 1.7, CW, leadH);
  addFit(s, d.lead, M + 0.4, 1.8, CW - 0.8, leadH - 0.2, { max: hasItems ? 24 : 28, min: 15, valign: 'middle', color: P.ink });
  let noteY = hasItems ? 6.0 : 5.0;
  if (hasItems) {
    const n = items.length;
    const gap = 0.25;
    const cw = (CW - (n - 1) * gap) / n;
    items.forEach((it, i) => {
      const x = M + i * (cw + gap);
      card(s, P, x, 3.7, cw, 2.15);
      addFit(s, it.head, x + 0.25, 3.82, cw - 0.5, 0.55, { max: 20, min: 14, bold: true, color: P.head });
      addFit(s, it.text, x + 0.25, 4.45, cw - 0.5, 1.3, { max: 17, min: 12, color: P.ink });
    });
  }
  if (d.note) addFit(s, d.note, M, noteY, CW, 0.7, { max: 17, min: 13, italic: true, color: P.text2 });
}

function layoutCards(s, P, d) {
  const items = d.items.slice(0, 6);
  const n = items.length;
  const perRow = n === 2 ? 2 : n === 4 ? 2 : 3;
  const rows = Math.ceil(n / perRow);
  const gap = 0.3;
  const cw = (CW - (perRow - 1) * gap) / perRow;
  const totalH = 5.0;
  const ch = (totalH - (rows - 1) * gap) / rows;
  const tall = rows === 1;
  items.forEach((it, i) => {
    const r = Math.floor(i / perRow);
    const c = i % perRow;
    const inRow = r === rows - 1 ? n - r * perRow : perRow;
    const rowW = inRow * cw + (inRow - 1) * gap;
    const x0 = M + (CW - rowW) / 2; // oxirgi qator markazlanadi
    const x = x0 + c * (cw + gap);
    const y = 1.75 + r * (ch + gap);
    card(s, P, x, y, cw, ch);
    if (tall) {
      badge(s, P, i + 1, x + 0.3, y + 0.3, 0.6);
      addFit(s, it.head, x + 0.3, y + 1.1, cw - 0.6, 0.9, { max: 24, min: 15, bold: true, color: P.ink });
      addFit(s, it.text, x + 0.3, y + 2.05, cw - 0.6, ch - 2.3, { max: 19, min: 13, color: P.ink });
    } else {
      badge(s, P, i + 1, x + 0.25, y + 0.25, 0.5);
      addFit(s, it.head, x + 0.95, y + 0.2, cw - 1.2, 0.6, { max: 20, min: 14, bold: true, color: P.ink, valign: 'middle' });
      addFit(s, it.text, x + 0.25, y + 0.95, cw - 0.5, ch - 1.15, { max: 17, min: 12, color: P.ink });
    }
  });
}

function layoutTwoColumns(s, P, d) {
  const cols = d.columns.slice(0, 2);
  const cw = (CW - 0.3) / 2;
  const h = d.note ? 4.15 : 4.95;
  cols.forEach((c, i) => {
    const x = M + i * (cw + 0.3);
    card(s, P, x, 1.75, cw, h, i === 1 ? P.accent : undefined);
    const dark = i === 1;
    addFit(s, c.head, x + 0.35, 1.95, cw - 0.7, 0.7, { max: 24, min: 16, bold: true, font: FH, color: dark ? 'FFFFFF' : P.head, valign: 'middle' });
    addBullets(s, c.bullets, x + 0.35, 2.85, cw - 0.7, h - 1.3, { max: 18, min: 12, color: dark ? 'FFFFFF' : P.ink });
  });
  if (d.note) addFit(s, d.note, M, 6.1, CW, 0.65, { max: 17, min: 13, italic: true, color: P.text2 });
}

function layoutTable(s, P, d) {
  const header = d.table.header;
  const rows = d.table.rows.slice(0, 7);
  const nc = header.length;
  const fr = nc === 2 ? [0.36, 0.64] : nc === 3 ? [0.25, 0.375, 0.375] : [0.22, 0.26, 0.26, 0.26];
  const colW = fr.map((f) => +(f * CW).toFixed(3));
  const maxLen = Math.max(...rows.flat().map((c) => c.length), 10);
  const fs = maxLen <= 28 ? 20 : maxLen <= 40 ? 18 : maxLen <= 65 ? 16 : 14;
  const cm = [0, 0.15, 0, 0.15];
  const minRow = Math.min(0.95, 4.0 / rows.length);
  const rowH = rows.map((r) => {
    const lines = Math.max(...r.map((c, i) => lineCount(c, fs, colW[i] - 0.3, { face: FB, bold: i === 0 })));
    return Math.max(minRow, (lines * fs * 1.25) / 72 + 0.3);
  });
  let total = 0.6 + rowH.reduce((a, b) => a + b, 0);
  const k = total > 5.0 ? 5.0 / total : 1;
  const hdr = header.map((t) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: P.tblHead }, fontFace: FB, fontSize: fs, valign: 'middle', margin: cm } }));
  const body = rows.map((r, ri) => {
    const f = ri % 2 === 0 ? P.tblAlt : P.tblBase;
    return r.map((t, ci) => ({
      text: t,
      options: { bold: ci === 0, color: ci === 0 ? P.head : P.ink, fill: { color: f }, fontFace: FB, fontSize: fs, valign: 'middle', margin: cm },
    }));
  });
  s.addTable([hdr, ...body], { x: M, y: 1.75, w: CW, colW, rowH: [0.6 * k, ...rowH.map((h) => h * k)], border: { type: 'solid', pt: 0.75, color: P.line } });
  if (d.note) addFit(s, d.note, M, 6.3, CW, 0.5, { max: 16, min: 12, italic: true, color: P.text2 });
}

function layoutProcess(s, P, d) {
  const items = d.items.slice(0, 5);
  const n = items.length;
  const gap = 0.5;
  const cw = (CW - (n - 1) * gap) / n;
  items.forEach((it, i) => {
    const x = M + i * (cw + gap);
    card(s, P, x, 1.85, cw, 4.2);
    badge(s, P, i + 1, x + 0.3, 2.1, 0.6);
    addFit(s, it.head, x + 0.3, 2.95, cw - 0.6, 0.95, { max: 21, min: 14, bold: true, color: P.ink });
    addFit(s, it.text, x + 0.3, 3.95, cw - 0.6, 1.95, { max: 17, min: 12, color: P.ink });
    if (i < n - 1) {
      s.addText('→', { x: x + cw, y: 3.5, w: gap, h: 0.6, fontFace: FB, fontSize: 26, bold: true, color: P.accent, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
    }
  });
  if (d.note) addFit(s, d.note, M, 6.2, CW, 0.55, { max: 16, min: 12, italic: true, color: P.text2 });
}

function layoutKeypoint(s, P, d) {
  const items = d.items.slice(0, 3);
  const leadH = items.length ? 2.3 : 4.2;
  addFit(s, d.lead, M, 1.75, CW, leadH, { max: items.length ? 32 : 36, min: 18, font: FH, color: P.soft, valign: 'middle' });
  const y0 = 4.25;
  const h = 0.72;
  items.forEach((it, i) => {
    const y = y0 + i * (h + 0.1);
    s.addShape('ellipse', { x: M, y: y + (h - 0.22) / 2, w: 0.22, h: 0.22, fill: { color: P.dkAcc }, line: { type: 'none' } });
    addFit(s, it.text || it.head, M + 0.5, y, CW - 0.5, h, { max: 20, min: 13, color: 'FFFFFF', valign: 'middle' });
  });
}

function layoutRows(s, P, d) {
  const items = d.items.slice(0, 5);
  const n = items.length;
  const gap = 0.18;
  const h = Math.min(1.0, (5.0 - (n - 1) * gap) / n);
  items.forEach((it, i) => {
    const y = 1.75 + i * (h + gap);
    card(s, P, M, y, CW, h);
    badge(s, P, i + 1, M + 0.3, y + (h - 0.5) / 2, 0.5);
    addFit(s, it.head, M + 1.1, y + 0.08, 3.4, h - 0.16, { max: 20, min: 13, bold: true, color: P.head, valign: 'middle' });
    addFit(s, it.text, M + 4.7, y + 0.08, CW - 5.0, h - 0.16, { max: 17, min: 12, color: P.ink, valign: 'middle' });
  });
}

function layoutConclusion(s, P, d) {
  const items = d.items.slice(0, 6);
  const n = items.length;
  const gap = 0.15;
  const h = Math.min(0.95, (5.0 - (n - 1) * gap) / n);
  items.forEach((it, i) => {
    const y = 1.7 + i * (h + gap);
    badge(s, P, i + 1, M, y + (h - 0.55) / 2, 0.55, P.dkAcc, P.dkOn);
    addFit(s, it.text || it.head, M + 0.95, y, CW - 0.95, h, { max: 21, min: 13, color: 'FFFFFF', valign: 'middle' });
  });
}

function layoutReferences(s, P, d) {
  const refs = d.references.slice(0, 8);
  const n = refs.length;
  const h = Math.min(0.62, 5.0 / n);
  refs.forEach((t, i) => {
    const y = 1.6 + i * h;
    badge(s, P, i + 1, M, y + (h - 0.4) / 2, 0.4);
    addFit(s, t, M + 0.7, y, CW - 0.7, h, { max: 16, min: 11, color: P.ink, valign: 'middle' });
  });
}

/** Katta raqamlar: 2–4 ta ustun, har birida yirik son va izoh. */
function layoutStats(s, P, d) {
  const items = d.items.slice(0, 4);
  const n = items.length;
  const gap = 0.3;
  const cw = (CW - (n - 1) * gap) / n;
  const y = 1.85;
  const h = d.note ? 3.9 : 4.6;
  items.forEach((it, i) => {
    const x = M + i * (cw + gap);
    card(s, P, x, y, cw, h);
    const rr = Math.min(CARDS[P.st.card].r, 0.12);
    s.addShape('rect', { x: x + rr, y, w: cw - 2 * rr, h: 0.1, fill: { color: P.accent }, line: { type: 'none' } });
    addFit(s, it.head, x + 0.25, y + 0.5, cw - 0.5, 1.5, { max: n > 3 ? 48 : 60, min: 20, bold: true, font: FH, color: P.num, align: 'center', valign: 'middle', noBreak: true });
    s.addShape('rect', { x: x + cw / 2 - 0.4, y: y + 2.15, w: 0.8, h: 0.05, fill: { color: P.soft }, line: { type: 'none' } });
    addFit(s, it.text, x + 0.3, y + 2.4, cw - 0.6, h - 2.7, { max: 19, min: 12, color: P.ink, align: 'center' });
  });
  if (d.note) addFit(s, d.note, M, 6.0, CW, 0.7, { max: 17, min: 13, italic: true, color: P.text2 });
}

/** Vaqt chizigʻi: sana yuqorida, voqea pastda. */
function layoutTimeline(s, P, d) {
  const items = d.items.slice(0, 6);
  const n = items.length;
  const cw = CW / n;
  const ly = 3.45;
  s.addShape('rect', { x: M, y: ly - 0.03, w: CW, h: 0.06, fill: { color: P.soft }, line: { type: 'none' } });
  items.forEach((it, i) => {
    const x = M + cw * i;
    const cx = x + cw / 2;
    addFit(s, it.head, x + 0.08, 2.0, cw - 0.16, 1.05, { max: 22, min: 12, bold: true, font: FH, color: P.head, align: 'center', valign: 'bottom', noBreak: true });
    s.addShape('ellipse', { x: cx - 0.2, y: ly - 0.2, w: 0.4, h: 0.4, fill: { color: P.accent }, line: { color: P.bg, width: 3 } });
    card(s, P, x + 0.08, 4.0, cw - 0.16, 2.5);
    addFit(s, it.text, x + 0.25, 4.15, cw - 0.5, 2.2, { max: n <= 4 ? 20 : 17, min: 12, color: P.ink, align: 'center', valign: 'middle' });
  });
}

/** Markaziy tushuncha va uning atrofidagi 3–6 ta jihat. */
function layoutHub(s, P, d) {
  const items = d.items.slice(0, 6);
  const n = items.length;
  const cx = W / 2;
  const cy = 4.25;
  const R = 1.45;
  const cwd = 3.95;
  const nLeft = Math.ceil(n / 2);
  const sides = [
    { list: items.slice(0, nLeft), left: true },
    { list: items.slice(nLeft), left: false },
  ];
  const boxes = [];
  for (const side of sides) {
    const k = side.list.length;
    const gap = 0.2;
    const h = Math.min(1.6, (4.9 - (k - 1) * gap) / k);
    const y0 = cy - (k * h + (k - 1) * gap) / 2;
    side.list.forEach((it, i) => boxes.push({ it, h, x: side.left ? M : W - M - cwd, y: y0 + i * (h + gap), left: side.left }));
  }
  // chiziqlar avval (kartalar va doira ustidan yopadi)
  for (const b of boxes) {
    const ex = b.left ? b.x + cwd : b.x;
    const ey = b.y + b.h / 2;
    const [xl, yl, xr, yr] = b.left ? [ex, ey, cx, cy] : [cx, cy, ex, ey];
    s.addShape('line', { x: xl, y: Math.min(yl, yr), w: xr - xl, h: Math.abs(yr - yl), flipV: yl > yr, line: { color: P.soft, width: 2.25 } });
  }
  s.addShape('ellipse', { x: cx - R - 0.2, y: cy - R - 0.2, w: 2 * (R + 0.2), h: 2 * (R + 0.2), fill: { color: P.soft, transparency: 60 }, line: { type: 'none' } });
  s.addShape('ellipse', { x: cx - R, y: cy - R, w: 2 * R, h: 2 * R, fill: { color: P.accent }, line: { type: 'none' } });
  addFit(s, d.lead, cx - 1.1, cy - 0.8, 2.2, 1.6, { max: 24, min: 11, bold: true, font: FH, color: 'FFFFFF', align: 'center', valign: 'middle', noBreak: true });
  for (const b of boxes) {
    card(s, P, b.x, b.y, cwd, b.h);
    const ex = b.left ? b.x + cwd : b.x;
    s.addShape('ellipse', { x: ex - 0.09, y: b.y + b.h / 2 - 0.09, w: 0.18, h: 0.18, fill: { color: P.accent }, line: { type: 'none' } });
    if (b.it.head) {
      addFit(s, b.it.head, b.x + 0.25, b.y + 0.12, cwd - 0.5, 0.5, { max: 19, min: 13, bold: true, color: P.head, valign: 'middle' });
      addFit(s, b.it.text, b.x + 0.25, b.y + 0.62, cwd - 0.5, b.h - 0.74, { max: 17, min: 11, color: P.ink });
    } else {
      addFit(s, b.it.text, b.x + 0.25, b.y + 0.1, cwd - 0.5, b.h - 0.2, { max: 18, min: 11, color: P.ink, valign: 'middle' });
    }
  }
}

/** Chapda rangli panelda asosiy fikr, oʻngda izohlar roʻyxati. */
function layoutSplit(s, P, d) {
  const items = d.items.slice(0, 4);
  const px = M;
  const py = 1.75;
  const pw = 4.7;
  const ph = 4.95;
  card(s, P, px, py, pw, ph, P.accent);
  const noteH = d.note ? 1.2 : 0;
  addFit(s, d.lead, px + 0.4, py + 0.35, pw - 0.8, ph - 0.7 - noteH, { max: 28, min: 15, font: FH, color: 'FFFFFF', valign: 'middle' });
  if (d.note) addFit(s, d.note, px + 0.4, py + ph - noteH - 0.25, pw - 0.8, noteH, { max: 16, min: 12, italic: true, color: P.tint, valign: 'bottom' });
  const x0 = px + pw + 0.5;
  const w0 = CW - pw - 0.5;
  const n = items.length;
  const gap = 0.2;
  const h = (ph - (n - 1) * gap) / n;
  items.forEach((it, i) => {
    const y = py + i * (h + gap);
    s.addShape('rect', { x: x0, y, w: 0.08, h, fill: { color: P.accent }, line: { type: 'none' } });
    if (it.head) {
      addFit(s, it.head, x0 + 0.3, y + 0.04, w0 - 0.3, 0.45, { max: 21, min: 14, bold: true, color: P.head, valign: 'middle' });
      addFit(s, it.text, x0 + 0.3, y + 0.52, w0 - 0.3, h - 0.56, { max: 17, min: 12, color: P.ink });
    } else {
      addFit(s, it.text, x0 + 0.3, y + 0.05, w0 - 0.3, h - 0.1, { max: 19, min: 12, color: P.ink, valign: 'middle' });
    }
  });
}

/** Piramida: yuqoridan pastga kengayib boruvchi pogʻonalar, har birining yonida izoh. */
function layoutPyramid(s, P, d) {
  const items = d.items.slice(0, 5);
  const n = items.length;
  const gap = 0.14;
  const h = Math.min(1.0, (5.0 - (n - 1) * gap) / n);
  const zoneW = 5.4;
  const cxp = M + zoneW / 2;
  const minW = 2.9;
  items.forEach((it, i) => {
    const y = 1.75 + i * (h + gap);
    const bw = n === 1 ? zoneW : minW + ((zoneW - minW) * i) / (n - 1);
    const col = mix(P.accentDark, P.accent, n === 1 ? 0 : i / (n - 1));
    s.addShape('roundRect', { x: cxp - bw / 2, y, w: bw, h, rectRadius: 0.1, fill: { color: col }, line: { type: 'none' } });
    addFit(s, it.head || it.text, cxp - bw / 2 + 0.15, y + 0.05, bw - 0.3, h - 0.1, { max: 20, min: 11, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', noBreak: true });
    if (it.head && it.text) {
      const lx = cxp + bw / 2 + 0.1;
      s.addShape('rect', { x: lx, y: y + h / 2 - 0.01, w: M + zoneW + 0.35 - lx, h: 0.02, fill: { color: P.soft }, line: { type: 'none' } });
      addFit(s, it.text, M + zoneW + 0.5, y, CW - zoneW - 0.5, h, { max: 17, min: 12, color: P.ink, valign: 'middle' });
    }
  });
}

/** Aylanma jarayon: 4 ta boʻlsa 2×2 halqa, 3 ta boʻlsa qator va qaytish strelkasi. */
function layoutCycle(s, P, d) {
  const items = d.items.slice(0, 4);
  const n = items.length;
  const arrow = (type, x, y, w, h) => s.addShape(type, { x, y, w, h, fill: { color: P.soft }, line: { type: 'none' } });
  const box = (it, i, x, y, w, h) => {
    card(s, P, x, y, w, h);
    badge(s, P, i + 1, x + 0.25, y + 0.25, 0.5);
    addFit(s, it.head, x + 0.95, y + 0.2, w - 1.2, 0.6, { max: 20, min: 14, bold: true, color: P.ink, valign: 'middle' });
    addFit(s, it.text, x + 0.25, y + 0.95, w - 0.5, h - 1.1, { max: 16, min: 12, color: P.ink });
  };
  if (n === 4) {
    const cw = 4.9;
    const ch = 2.1;
    const xl = M;
    const xr = W - M - cw;
    const yt = 1.75;
    const yb = 4.6;
    const gx = xl + cw;
    const gw = xr - gx;
    arrow('rightArrow', gx + 0.3, yt + ch / 2 - 0.3, gw - 0.6, 0.6);
    arrow('downArrow', xr + cw / 2 - 0.3, yt + ch + 0.08, 0.6, yb - yt - ch - 0.16);
    arrow('leftArrow', gx + 0.3, yb + ch / 2 - 0.3, gw - 0.6, 0.6);
    arrow('upArrow', xl + cw / 2 - 0.3, yt + ch + 0.08, 0.6, yb - yt - ch - 0.16);
    box(items[0], 0, xl, yt, cw, ch);
    box(items[1], 1, xr, yt, cw, ch);
    box(items[2], 2, xr, yb, cw, ch);
    box(items[3], 3, xl, yb, cw, ch);
    if (d.lead) {
      const cy = (yt + yb + ch) / 2;
      s.addShape('ellipse', { x: W / 2 - 0.85, y: cy - 0.85, w: 1.7, h: 1.7, fill: { color: P.accent }, line: { type: 'none' } });
      addFit(s, d.lead, W / 2 - 0.74, cy - 0.6, 1.48, 1.2, { max: 20, min: 10, bold: true, font: FH, color: 'FFFFFF', align: 'center', valign: 'middle', noBreak: true });
    }
  } else {
    const gap = 0.7;
    const cw = (CW - 2 * gap) / 3;
    const ch = 3.0;
    items.forEach((it, i) => {
      const x = M + i * (cw + gap);
      box(it, i, x, 1.85, cw, ch);
      if (i < 2) arrow('rightArrow', x + cw + 0.1, 1.85 + ch / 2 - 0.25, gap - 0.2, 0.5);
    });
    arrow('leftArrow', M + 0.5, 5.3, CW - 1.0, 0.6);
    if (d.lead) {
      s.addShape('roundRect', { x: W / 2 - 2.0, y: 5.22, w: 4.0, h: 0.76, rectRadius: 0.38, fill: { color: P.accent }, line: { type: 'none' } });
      addFit(s, d.lead, W / 2 - 1.8, 5.26, 3.6, 0.68, { max: 18, min: 12, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
    }
  }
}

/** Ikki tomonni qarama-qarshi qoʻyish: ikkita panel va oʻrtada "VS". */
function layoutVersus(s, P, d) {
  const cols = d.columns.slice(0, 2);
  const gap = 1.1;
  const cw = (CW - gap) / 2;
  const h = d.note ? 4.15 : 4.95;
  cols.forEach((c, i) => {
    const x = M + i * (cw + gap);
    card(s, P, x, 1.75, cw, h);
    card(s, P, x, 1.75, cw, 0.95, i === 0 ? P.accentDark : P.accent);
    addFit(s, c.head, x + 0.3, 1.8, cw - 0.6, 0.85, { max: 24, min: 15, bold: true, font: FH, color: 'FFFFFF', align: 'center', valign: 'middle' });
    addBullets(s, c.bullets, x + 0.4, 3.0, cw - 0.8, h - 1.5, { max: 18, min: 12, color: P.ink });
  });
  const d0 = 0.9;
  s.addShape('ellipse', { x: W / 2 - d0 / 2, y: 1.75 + 0.475 - d0 / 2, w: d0, h: d0, fill: { color: P.tblHead }, line: { color: P.bg, width: 3 } });
  s.addText('VS', { x: W / 2 - d0 / 2, y: 1.75 + 0.475 - d0 / 2, w: d0, h: d0, fontFace: FB, fontSize: 18, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, isTextBox: true });
  if (d.note) addFit(s, d.note, M, 6.1, CW, 0.65, { max: 17, min: 13, italic: true, color: P.text2 });
}

/** Boʻlim sarlavhasi (uzun taqdimotlarda): katta raqam va nom. */
function layoutSection(s, P, d) {
  s.addShape('ellipse', { x: 8.9, y: 0.6, w: 4.2, h: 4.2, fill: { color: P.dkAcc, transparency: 70 }, line: { type: 'none' } });
  s.addShape('ellipse', { x: 10.8, y: 3.8, w: 2.0, h: 2.0, fill: { color: P.soft, transparency: 50 }, line: { type: 'none' } });
  addFit(s, String(d.sectionNo || 1).padStart(2, '0'), M, 1.1, 5, 1.9, { max: 100, min: 80, bold: true, font: FH, color: P.dkAcc, valign: 'bottom' });
  s.addShape('rect', { x: M, y: 3.25, w: 1.2, h: 0.08, fill: { color: P.soft }, line: { type: 'none' } });
  addFit(s, d.title, M, 3.6, 8.2, 1.6, { max: 42, min: 24, bold: true, font: FH, color: 'FFFFFF' });
  if (d.lead) {
    // izoh sarlavhaning tagida turadi (sarlavha qancha qator boʻlishiga qarab)
    const t = fitText(d.title, 8.2, 1.6, 42, 24, { bold: true, face: FH });
    const ly = 3.6 + textH(t.text, t.fs, 8.2, { bold: true, face: FH }) + 0.3;
    addFit(s, d.lead, M, ly, 8.2, 6.6 - ly, { max: 22, min: 14, color: P.soft });
  }
}

const DRAW = {
  stats: layoutStats,
  timeline: layoutTimeline,
  hub: layoutHub,
  split: layoutSplit,
  pyramid: layoutPyramid,
  cycle: layoutCycle,
  versus: layoutVersus,
  section: layoutSection,
  agenda: layoutAgenda,
  definition: layoutDefinition,
  cards: layoutCards,
  two_columns: layoutTwoColumns,
  table: layoutTable,
  process: layoutProcess,
  keypoint: layoutKeypoint,
  rows: layoutRows,
  conclusion: layoutConclusion,
  references: layoutReferences,
};
const DARK_LAYOUTS = new Set(['keypoint', 'conclusion', 'section']);

// ---------------------------------------------------------------- titul slaydi (12 xil kompozitsiya, 3 xil fon)
// Har bir kompozitsiya bezakni chizadi va matn joylashuvini (lay) qaytaradi.
const COVERS = {
  orbit(s, C) {
    ovalShape(s, 8.9, 0.7, 4.0, C.a, 65);
    ovalShape(s, 10.5, 3.5, 2.2, C.b, 45);
    return {};
  },
  block(s, C) {
    rectShape(s, 0, 0, 4.2, 7.5, C.a);
    ovalShape(s, -0.9, 4.7, 3.6, C.b, 60);
    ovalShape(s, 1.9, -1.0, 2.9, 'FFFFFF', 85);
    rectShape(s, 4.9, 0.75, 0.9, 0.08, C.a);
    return { x: 4.9, w: 7.7, ty: 1.0 };
  },
  split(s, C, P) {
    const band = C.mode === 'light' ? P.dark : C.mode === 'acc' ? P.accentDark : P.accent;
    rectShape(s, 0, 0, W, 4.75, band);
    rectShape(s, 0, 4.75, W, 0.1, C.b);
    ovalShape(s, 10.4, -1.2, 3.6, 'FFFFFF', 90);
    return { w: 11.9, ty: 0.6, th: 2.8, sy: 3.55, wy: 5.3, iy: 5.85, tc: 'FFFFFF', sc: P.soft };
  },
  frame(s, C) {
    outlineShape(s, 'rect', 0.4, 0.4, W - 0.8, 6.7, C.a, 2);
    outlineShape(s, 'rect', 0.55, 0.55, W - 1.1, 6.4, C.b, 0.75);
    rectShape(s, W / 2 - 0.6, 3.85, 1.2, 0.06, C.a);
    return { x: M + 0.4, w: CW - 0.8, align: 'center', ty: 1.15, th: 2.45, sy: 4.1, wy: 5.2, iy: 5.7 };
  },
  strips(s, C) {
    ovalShape(s, 9.4, 2.1, 5.0, C.a, 82);
    rectShape(s, 0, 0, 0.55, 7.5, C.a);
    rectShape(s, 0.55, 0, 0.2, 7.5, C.b, 40);
    rectShape(s, 0.75, 0, 0.07, 7.5, C.a, 50);
    return { x: 1.6, w: 9.4 };
  },
  editorial(s, C) {
    rectShape(s, M, 0.65, CW, 0.03, C.a);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) rectShape(s, 10.6 + c * 0.52, 1.55 + r * 0.52, 0.42, 0.42, C.a, 25 + ((r * 3 + c) % 4) * 18);
    return { w: 9.4, ty: 1.5, th: 2.9, sy: 4.7, wy: 0.85, iy: 5.9, caps: true, wc: C.lab };
  },
  bar(s, C, P) {
    const fill = C.mode === 'light' ? P.dark : C.mode === 'acc' ? P.accentDark : P.accent;
    rectShape(s, 0, 5.35, W, 2.15, fill);
    rectShape(s, M, 0.55, 0.9, 0.09, C.a);
    return { w: 11.0, ty: 0.85, th: 3.0, sy: 4.0, wy: 5.65, iy: 6.1, wc: 'FFFFFF', ic: P.tint };
  },
  tech(s, C) {
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) ovalShape(s, 9.0 + c * 0.5, 0.9 + r * 0.5, 0.1, C.b, 75);
    rectShape(s, M - 0.35, 0.9, 0.05, 5.7, C.a);
    return { ty: 1.35, th: 2.7, sy: 4.2, wy: 0.7, iy: 5.8, caps: true, wc: C.lab, prefix: '// ' };
  },
  ring(s, C) {
    outlineShape(s, 'ellipse', W / 2 - 3.4, 0.35, 6.8, 6.8, C.b, 1, 70);
    outlineShape(s, 'ellipse', W / 2 - 2.6, 1.15, 5.2, 5.2, C.a, 1.25, 55);
    return { x: (W - 7.6) / 2, w: 7.6, align: 'center', ty: 1.85, th: 2.3, tv: 'middle', sy: 4.25, wy: 5.55, iy: 6.0 };
  },
  bubbles(s, C) {
    ovalShape(s, -2.2, 3.5, 6.0, C.a, 15);
    ovalShape(s, 9.6, -1.5, 4.2, C.b, 40);
    ovalShape(s, 11.4, 4.9, 1.1, C.a, 30);
    return { x: 4.6, w: 7.2, ty: 0.9, th: 2.9, sy: 3.95, wy: 5.25, iy: 5.8 };
  },
  banner(s, C) {
    rectShape(s, 0, 0, W, 0.4, C.a);
    rectShape(s, 0, 7.1, W, 0.4, C.a);
    rectShape(s, W / 2 - 0.7, 4.5, 1.4, 0.06, C.a);
    return { x: M + 0.5, w: CW - 1.0, align: 'center', ty: 1.65, th: 2.7, tv: 'middle', sy: 4.75, wy: 1.05, iy: 5.95, caps: true, wc: C.lab };
  },
  solid(s, C) {
    for (const [d0, tr] of [[2.6, 65], [4.4, 72], [6.2, 80]]) outlineShape(s, 'ellipse', 10.4 - d0 / 2, 3.75 - d0 / 2, d0, d0, 'FFFFFF', 1.5, tr);
    ovalShape(s, 9.9, 3.25, 1.0, C.b, 40);
    return { w: 8.0 };
  },
};

function titleSlide(pres, P, deck, profile, lang) {
  const L = LABELS[lang] || LABELS.uz;
  const st = P.st;
  const s = pres.addSlide();
  const mode = st.cmode;
  const C = mode === 'dark' ? { mode, bg: P.dark, fg: 'FFFFFF', sub: P.soft, info: P.tint, a: P.accent, b: P.soft }
    : mode === 'acc' ? { mode, bg: P.accent, fg: 'FFFFFF', sub: P.tint, info: P.tint, a: P.accentDark, b: P.soft }
    : { mode, bg: P.bg, fg: P.title, sub: P.head, info: P.text2, a: P.accent, b: P.soft };
  C.lab = mode === 'light' ? C.a : mode === 'dark' ? C.b : 'FFFFFF'; // kichik yozuv rangi
  s.background = { color: C.bg };
  const lay = Object.assign({ x: M, w: 8.0, align: 'left', ty: 0.9, th: 2.9, tv: 'bottom', sy: 3.95, wy: 5.2, iy: 5.75, tc: C.fg, sc: C.sub, wc: C.fg, ic: C.info }, COVERS[st.cover](s, C, P));
  addFit(s, deck.title, lay.x, lay.ty, lay.w, lay.th, { max: 46, min: 26, bold: true, font: FH, color: lay.tc, valign: lay.tv, align: lay.align });
  if (deck.subtitle) addFit(s, deck.subtitle, lay.x, lay.sy, lay.w, 0.9, { max: 22, min: 15, color: lay.sc, align: lay.align });
  const work = (lay.prefix || '') + (lay.caps ? L.work.toUpperCase() : L.work);
  addFit(s, work, lay.x, lay.wy, lay.w, 0.4, { max: lay.caps ? 16 : 20, min: lay.caps ? 12 : 16, bold: true, color: lay.wc, align: lay.align, font: lay.caps ? FH : FB });
  const p = profile || {};
  const lines = [];
  if (p.fullName || p.group) lines.push(`${L.by}: ${p.fullName || ''}${p.group ? `    ${L.group}: ${p.group}` : ''}`.trim());
  if (p.university) lines.push(`${L.uni}: ${p.university}`);
  if (p.faculty) lines.push(`${L.fac}: ${p.faculty}`);
  lines.forEach((t, i) => addFit(s, t, lay.x, lay.iy + i * 0.35, lay.w, 0.32, { max: 16, min: 12, color: lay.ic, align: lay.align }));
  return s;
}

// ---------------------------------------------------------------- tozalash (AI javobini tekshirish)
const clean = (v, max = 600) => {
  let t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  if (t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, '') + '…';
  return t;
};
const arr = (v) => (Array.isArray(v) ? v : []);

function normItems(v) {
  return arr(v)
    .map((it) => (typeof it === 'string' ? { head: '', text: clean(it) } : { head: clean(it && it.head, 120), text: clean(it && (it.text || it.example || ''), 400) }))
    .filter((it) => it.head || it.text);
}

/** AI javobidagi har bir slaydni tekshiradi, noto'g'ri tuzilganini mosiga o'tkazadi yoki tashlab yuboradi. */
function normalizeDeck(raw) {
  raw = raw || {};
  const out = { title: clean(raw.title, 140) || 'Taqdimot', subtitle: clean(raw.subtitle, 160), slides: [] };
  for (const r of arr(raw.slides)) {
    if (!r || typeof r !== 'object') continue;
    const s = {
      layout: LAYOUTS.includes(r.layout) ? r.layout : null,
      title: clean(r.title, 120),
      lead: clean(r.lead, 500),
      note: clean(r.note, 300),
      notes: clean(r.notes, 1200),
      items: normItems(r.items),
      columns: arr(r.columns).map((c) => ({ head: clean(c && c.head, 100), bullets: arr(c && c.bullets).map((b) => clean(b, 220)).filter(Boolean) })).filter((c) => c.bullets.length),
      table: null,
      references: arr(r.references).map((x) => clean(x, 300)).filter(Boolean),
    };
    if (r.table && Array.isArray(r.table.header)) {
      const header = r.table.header.map((h) => clean(h, 60)).slice(0, 4);
      const rows = arr(r.table.rows)
        .map((row) => header.map((_, i) => clean(arr(row)[i], 160)))
        .filter((row) => row.some(Boolean));
      if (header.length >= 2 && rows.length) s.table = { header, rows };
    }
    if (!s.layout) s.layout = s.table ? 'table' : s.columns.length >= 2 ? 'two_columns' : s.items.length ? 'rows' : s.references.length ? 'references' : 'definition';

    // yetarli ma'lumot bo'lmasa, mos turga o'tkazamiz
    const L = s.layout;
    if (L === 'agenda' && s.items.length < 2) continue;
    if (L === 'references') {
      if (!s.references.length) continue;
    } else if (L === 'conclusion') {
      if (!s.items.length) continue;
    } else if (L === 'table' && !s.table) s.layout = s.items.length >= 2 ? 'rows' : 'definition';
    else if (L === 'two_columns' && s.columns.length < 2) s.layout = s.items.length >= 2 ? 'rows' : 'definition';
    else if (L === 'cards' && s.items.length < 2) s.layout = 'definition';
    else if (L === 'process' && s.items.length < 3) s.layout = s.items.length === 2 ? 'cards' : 'definition';
    else if (L === 'rows' && s.items.length < 2) s.layout = 'definition';
    else if (L === 'stats' && s.items.filter((i) => i.head).length < 2) s.layout = s.items.length >= 2 ? 'cards' : 'definition';
    else if (L === 'timeline' && s.items.filter((i) => i.head).length < 3) s.layout = s.items.length >= 3 ? 'process' : s.items.length === 2 ? 'cards' : 'definition';
    else if (L === 'hub' && (!s.lead || s.items.length < 3)) s.layout = s.items.length >= 2 ? 'cards' : 'definition';
    else if (L === 'split' && (!s.lead || s.items.length < 2)) s.layout = s.items.length >= 2 ? 'rows' : 'definition';
    else if ((L === 'pyramid' || L === 'cycle') && s.items.length < 3) s.layout = s.items.length === 2 ? 'cards' : 'definition';
    else if (L === 'versus' && s.columns.length < 2) s.layout = s.items.length >= 2 ? 'rows' : 'definition';
    else if (L === 'section') {
      if (!s.title) s.title = s.lead.slice(0, 60);
      if (!s.title) continue;
    }
    if (s.layout === 'keypoint' && !s.lead) s.layout = s.items.length >= 2 ? 'rows' : 'definition';
    if (s.layout === 'definition' && !s.lead) s.lead = (s.items[0] && (s.items[0].text || s.items[0].head)) || s.title;
    if (!s.title && s.layout !== 'references') s.title = s.layout === 'conclusion' ? '' : s.lead.slice(0, 60);
    out.slides.push(s);
  }
  return out;
}

// ---------------------------------------------------------------- asosiy funksiya
/**
 * deck: normalizeDeck natijasi. opts: { color, style, lang, profile }
 * Qaytaradi: Buffer (.pptx)
 */
async function buildDeck(deck, opts = {}) {
  const st = styleOf(opts.style);
  const P = makeTheme(PALETTES[opts.color] || PALETTES.green, st);
  FH = st.fh;
  FB = st.fb;
  const lang = LABELS[opts.lang] ? opts.lang : 'uz';
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = deck.title;
  pres.author = (opts.profile && opts.profile.fullName) || '';
  pres.theme = { headFontFace: FH, bodyFontFace: FB };

  titleSlide(pres, P, deck, opts.profile, lang);
  const meta = { deckTitle: deck.title };
  let sectionNo = 0;
  for (const d0 of deck.slides) {
    const d = Object.assign({}, d0);
    if (d.layout === 'section') d.sectionNo = ++sectionNo;
    if (!d.title && DEFAULT_TITLES[lang][d.layout]) d.title = DEFAULT_TITLES[lang][d.layout];
    const dark = DARK_LAYOUTS.has(d.layout);
    const s = slideBase(pres, P, d, meta, dark);
    DRAW[d.layout](s, P, d);
  }
  const out = await pres.write({ outputType: 'nodebuffer' });
  return Buffer.from(out);
}

module.exports = { buildDeck, normalizeDeck, PALETTES, LABELS, LAYOUTS, STYLES, STYLE_KEYS, DEFAULT_STYLE, styleOf, randomStyle };
