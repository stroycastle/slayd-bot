// Referat / kurs ishi: doc JSON (docgen.js) -> .docx. OOXML qoʻlda yoziladi (jszip bilan), shuning uchun yangi kutubxona kerak emas.
// Andoza: A4, chap 3 sm, oʻng 1.5 sm, tepa/past 2 sm, Times New Roman 14, 1.5 interval, ikki tomonga tekislash, 1.25 sm abzats.
// Titul varagʻi (bet raqamisiz), Reja/Mundarija (bet raqamlari bilan), sarlavhalar (Word navigatsiyasi uchun Heading 1/2), adabiyotlar.
const JSZip = require('jszip');

const PAGE = { w: 11906, h: 16838, top: 1134, bottom: 1134, left: 1701, right: 851 };
const TEXT_W = PAGE.w - PAGE.left - PAGE.right; // 9354 twip
const WORDS_PER_PAGE = 290;
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];

// Til boʻyicha yorliqlar. Qoraqalpoqcha yorliqlarni ona tili egasi koʻrib chiqishi kerak.
const LABELS = {
  uz: { intro: 'Kirish', concl: 'Xulosa', refs: 'Foydalanilgan adabiyotlar roʻyxati', toc: 'Mundarija', plan: 'Reja', referat: 'REFERAT', kurs: 'KURS ISHI', topic: 'Mavzu', subject: 'Fan', by: 'Bajardi', group: 'Guruh', checked: 'Tekshirdi', chapter: (n, t) => `${ROMAN[n]} BOB. ${t}`, lang: 'uz-Latn-UZ' },
  uzc: { intro: 'Кириш', concl: 'Хулоса', refs: 'Фойдаланилган адабиётлар рўйхати', toc: 'Мундарижа', plan: 'Режа', referat: 'РЕФЕРАТ', kurs: 'КУРС ИШИ', topic: 'Мавзу', subject: 'Фан', by: 'Бажарди', group: 'Гуруҳ', checked: 'Текширди', chapter: (n, t) => `${ROMAN[n]} БОБ. ${t}`, lang: 'uz-Cyrl-UZ' },
  ru: { intro: 'Введение', concl: 'Заключение', refs: 'Список использованной литературы', toc: 'Содержание', plan: 'План', referat: 'РЕФЕРАТ', kurs: 'КУРСОВАЯ РАБОТА', topic: 'Тема', subject: 'Дисциплина', by: 'Выполнил(а)', group: 'Группа', checked: 'Проверил(а)', chapter: (n, t) => `Глава ${n}. ${t}`, lang: 'ru-RU' },
  kaa: { intro: 'Kirisiw', concl: 'Juwmaq', refs: 'Paydalanılǵan ádebiyatlar dizimi', toc: 'Mazmunı', plan: 'Jobası', referat: 'REFERAT', kurs: 'KURS JUMISI', topic: 'Tema', subject: 'Pán', by: 'Orınlaǵan', group: 'Topar', checked: 'Tekserdi', chapter: (n, t) => `${ROMAN[n]} BAP. ${t}`, lang: 'en-US' },
};

const esc = (s) => String(s == null ? '' : s)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const rPr = (o = {}) => {
  let x = '';
  if (o.bold) x += '<w:b/><w:bCs/>';
  if (o.size) x += `<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>`;
  return x ? `<w:rPr>${x}</w:rPr>` : '';
};

/** Matn boʻlagi (\t — tabulyatsiya, \n — qator oxiri). */
function run(text, o) {
  const parts = String(text).split(/(\t|\n)/);
  const inner = parts.map((p) => (p === '\t' ? '<w:tab/>' : p === '\n' ? '<w:br/>' : p ? `<w:t xml:space="preserve">${esc(p)}</w:t>` : '')).join('');
  return `<w:r>${rPr(o)}${inner}</w:r>`;
}

/** Abzats. pPr ichidagi elementlar tartibi OOXML sxemasiga mos (Word qatʼiy talab qiladi). */
function para(content, o = {}) {
  let p = '';
  if (o.style) p += `<w:pStyle w:val="${o.style}"/>`;
  if (o.keepNext) p += '<w:keepNext/>';
  if (o.pageBreakBefore) p += '<w:pageBreakBefore/>';
  if (o.tabs) p += `<w:tabs>${o.tabs}</w:tabs>`;
  if (o.spacing) p += `<w:spacing ${Object.entries(o.spacing).map(([k, v]) => `w:${k}="${v}"`).join(' ')}/>`;
  if (o.ind) p += `<w:ind ${Object.entries(o.ind).map(([k, v]) => `w:${k}="${v}"`).join(' ')}/>`;
  if (o.jc) p += `<w:jc w:val="${o.jc}"/>`;
  return `<w:p>${p ? `<w:pPr>${p}</w:pPr>` : ''}${content}</w:p>`;
}

// ---------------------------------------------------------------- tuzilma
/** doc -> tartibli blok roʻyxati. Sarlavhalar (h) Reja/Mundarija va bet raqamlarini aniqlash uchun ham ishlatiladi. */
function layout(doc, L) {
  const blocks = [];
  const kurs = doc.kind === 'kurs';
  const h = (level, text, o = {}) => blocks.push({ t: 'h', level, text, ...o });
  const ps = (list) => (list || []).forEach((x) => blocks.push({ t: 'p', text: x }));

  const intro = doc.parts.find((p) => p.type === 'intro');
  const concl = doc.parts.find((p) => p.type === 'conclusion');
  if (intro) { h(1, L.intro, { pageBreak: true, caps: true }); ps(intro.paragraphs); }
  let n = 0;
  for (const c of doc.parts.filter((p) => p.type === 'chapter')) {
    n++;
    const title = kurs ? L.chapter(n, c.title) : `${n}. ${c.title}`;
    h(1, title, { pageBreak: kurs, caps: true });
    ps(c.paragraphs);
    (c.subs || []).forEach((s, i) => {
      h(2, `${n}.${i + 1}. ${s.title}`);
      ps(s.paragraphs);
    });
  }
  if (concl) { h(1, L.concl, { pageBreak: kurs, caps: true }); ps(concl.paragraphs); }
  if (doc.references && doc.references.length) {
    h(1, L.refs, { pageBreak: true, caps: true });
    doc.references.forEach((r, i) => blocks.push({ t: 'ref', text: `${i + 1}. ${r}` }));
  }
  return blocks;
}

/** Har bir sarlavha qaysi betda boshlanishini taxminan hisoblaydi (soʻz soni boʻyicha). PDF boʻlsa, aniqlashtiriladi. */
function estimate(blocks) {
  let cursor = 3; // 1 — titul, 2 — reja
  const pages = [];
  for (const b of blocks) {
    if (b.t === 'h') {
      if (b.pageBreak && cursor % 1 > 1e-9) cursor = Math.ceil(cursor);
      pages.push(Math.floor(cursor + 1e-9));
      cursor += b.level === 1 ? 0.12 : 0.09;
    } else if (b.t === 'p') {
      cursor += ((String(b.text).match(/\S+/g) || []).length / WORDS_PER_PAGE) * 1.04;
    } else cursor += Math.max(0.045, (String(b.text).length / 95) * 0.045);
  }
  return pages;
}

const norm = (s) => String(s).replace(/[^\p{L}\p{N}]+/gu, '');

// ---------------------------------------------------------------- XML qismlari
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function stylesXml(lang) {
  const font = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/>';
  const tab = `<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${TEXT_W}"/></w:tabs>`;
  return `${XML}<w:styles ${NS}>
<w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="28"/><w:szCs w:val="28"/><w:lang w:val="${lang}" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:widowControl/><w:ind w:firstLine="709"/><w:jc w:val="both"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="BodyText"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="240"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:bCs/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="BodyText"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="160"/><w:ind w:firstLine="709"/><w:jc w:val="left"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:bCs/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="240"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:bCs/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr>${tab}<w:spacing w:before="0" w:after="80" w:line="276" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr>${tab}<w:spacing w:before="0" w:after="80" w:line="276" w:lineRule="auto"/><w:ind w:left="397"/></w:pPr></w:style>
</w:styles>`;
}

const footerXml = (withNumber) => `${XML}<w:ftr ${NS}>${withNumber
  ? '<w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:fldSimple w:instr=" PAGE "><w:r><w:t>2</w:t></w:r></w:fldSimple></w:p>'
  : '<w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr></w:p>'}</w:ftr>`;

function titlePage(doc, L, profile) {
  const p = profile || {};
  const year = new Date(Date.now() + 5 * 3600 * 1000).getUTCFullYear();
  const one = { line: 276, lineRule: 'auto' };
  const c = (text, o = {}) => para(run(text, { bold: o.bold, size: o.size }), { jc: 'center', spacing: { before: o.before || 0, after: 0, ...one } });
  const right = (label, value, before) => para(run(`${label}: `, { bold: true }) + run(value || '—'), { jc: 'left', ind: { left: 4678 }, spacing: { before, after: 0, line: 312, lineRule: 'auto' } });
  const out = [];
  out.push(c(String(p.university || '').toUpperCase(), { bold: true }));
  if (p.faculty) out.push(c(p.faculty, { before: 120 }));
  out.push(c(doc.kind === 'kurs' ? L.kurs : L.referat, { bold: true, size: 44, before: 3000 }));
  out.push(c(`${L.topic}: «${doc.topic}»`, { bold: true, size: 32, before: 700 }));
  if (doc.subject) out.push(c(`${L.subject}: ${doc.subject}`, { before: 300 }));
  out.push(right(L.by, p.fullName, 2600));
  out.push(right(L.group, p.group, 120));
  out.push(right(L.checked, '_______________', 240));
  out.push(c(String(year), { before: 2300 }));
  return out.join('');
}

/**
 * doc (docgen.js) -> .docx.
 * opts: { profile, lang, pages } — pages: PDFdan aniqlangan bet raqamlari (sarlavhalar tartibida); boʻlmasa taxminiy hisoblanadi.
 * Qaytaradi: { buffer, headings: [{ level, text, search, page }] }
 */
async function buildDocx(doc, opts = {}) {
  const lang = LABELS[opts.lang || doc.lang] ? opts.lang || doc.lang : 'uz';
  const L = LABELS[lang];
  const blocks = layout(doc, L);
  const estHeads = estimate(blocks); // sarlavhalar tartibidagi taxminiy betlar
  const headings = blocks.filter((b) => b.t === 'h').map((b, i) => ({
    level: b.level,
    text: b.text,
    search: b.caps ? b.text.toUpperCase() : b.text,
    page: opts.pages && Number.isInteger(opts.pages[i]) ? opts.pages[i] : estHeads[i],
  }));

  const body = [];
  body.push(titlePage(doc, L, opts.profile));
  // reja / mundarija
  body.push(para(run((doc.kind === 'kurs' ? L.toc : L.plan).toUpperCase(), { bold: true }), { style: 'TOCHeading', pageBreakBefore: true }));
  for (const hd of headings) {
    body.push(para(run(`${hd.text}\t${hd.page}`), { style: hd.level === 1 ? 'TOC1' : 'TOC2' }));
  }
  // asosiy matn
  for (const b of blocks) {
    if (b.t === 'h') {
      const text = b.caps ? b.text.toUpperCase() : b.text;
      body.push(para(run(text), { style: b.level === 1 ? 'Heading1' : 'Heading2', pageBreakBefore: !!b.pageBreak }));
    } else {
      body.push(para(run(b.text), { style: 'BodyText' }));
    }
  }

  const sect = `<w:sectPr><w:footerReference w:type="default" r:id="rId4"/><w:footerReference w:type="first" r:id="rId5"/><w:pgSz w:w="${PAGE.w}" w:h="${PAGE.h}"/><w:pgMar w:top="${PAGE.top}" w:right="${PAGE.right}" w:bottom="${PAGE.bottom}" w:left="${PAGE.left}" w:header="709" w:footer="567" w:gutter="0"/><w:titlePg/></w:sectPr>`;
  const documentXml = `${XML}<w:document ${NS}><w:body>${body.join('')}${sect}</w:body></w:document>`;

  const profile = opts.profile || {};
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/footer2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  zip.file('_rels/.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  zip.file('word/_rels/document.xml.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/></Relationships>`);
  zip.file('word/document.xml', documentXml);
  zip.file('word/styles.xml', stylesXml(L.lang));
  zip.file('word/settings.xml', `${XML}<w:settings ${NS}><w:defaultTabStop w:val="709"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`);
  zip.file('word/footer1.xml', footerXml(true));
  zip.file('word/footer2.xml', footerXml(false));
  zip.file('docProps/core.xml', `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(doc.topic)}</dc:title><dc:creator>${esc(profile.fullName || '')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  zip.file('docProps/app.xml', `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Office Word</Application></Properties>`);
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { buffer, headings };
}

// ---------------------------------------------------------------- PDF dan bet raqamlarini aniqlash
/** PDF har bir betining matni. */
async function pdfPageTexts(pdfBuffer) {
  const pdfParse = require('pdf-parse/lib/pdf-parse.js');
  const pages = [];
  const r = await pdfParse(pdfBuffer, {
    pagerender: (pd) => pd.getTextContent({ normalizeWhitespace: true }).then((tc) => {
      const t = tc.items.map((i) => i.str).join(' ');
      pages.push(t);
      return t;
    }),
  });
  return { pages, total: r.numpages || pages.length };
}

/**
 * Sarlavhalar qaysi betda ekanini PDF matnidan topadi (titul va reja betlaridan keyin, ketma-ket qidiriladi).
 * Qaytaradi: [bet | null] sarlavhalar tartibida.
 */
function locateHeadings(pageTexts, headings, from = 3) {
  const normPages = pageTexts.map(norm);
  const out = [];
  let cursor = from;
  for (const hd of headings) {
    const needle = norm(hd.search);
    let found = null;
    for (let p = cursor; p <= normPages.length; p++) {
      if (normPages[p - 1].includes(needle)) { found = p; break; }
    }
    out.push(found);
    if (found) cursor = found;
  }
  return out;
}

module.exports = { buildDocx, layout, estimate, pdfPageTexts, locateHeadings, LABELS, TEXT_W, PAGE };
