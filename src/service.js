// Biznes mantiq: matn yozish -> slaydlar -> .pptx va .pdf. Telegramga bog'liq emas (shuning uchun osongina sinaladi).
const fs = require('fs');
const path = require('path');
const config = require('./config');
const ai = require('./ai');
const { buildDeck } = require('./deck');
const { toPdf } = require('./pdf');
const docgen = require('./docgen');
const docx = require('./docx');

const KEEP_AT_ENDS = new Set(['agenda', 'conclusion', 'references']);

/** Slaydlar soni so'ralganidan ko'p bo'lsa, o'rtadagi ortiqcha slaydlarni olib tashlaydi. */
function trimToTarget(deck, target) {
  while (deck.slides.length > target) {
    // avval faqat bezak vazifasini bajaradigan boʻlim sarlavhalari olib tashlanadi
    let idx = deck.slides.findIndex((sl) => sl.layout === 'section');
    for (let i = deck.slides.length - 1; idx < 0 && i >= 0; i--) {
      if (!KEEP_AT_ENDS.has(deck.slides[i].layout)) idx = i;
    }
    if (idx < 0) break;
    deck.slides.splice(idx, 1);
  }
  return deck;
}

/**
 * Buyurtmadagidan kam slayd chiqsa qaytariladigan pul (bot ham, mini ilova ham shuni ishlatadi).
 * Bir xil narxda faqat sezilarli kamlikda (3 va undan ortiq slayd), 100 soʻmgacha yaxlitlanadi; hech qachon toʻlangandan koʻp emas.
 */
function shortfallRefund(order, finalSlides) {
  const missing = order.slides - finalSlides;
  if (missing <= 0) return 0;
  if (!(config.PRICE_DECK > 0)) return Math.min(order.price, missing * config.PRICE_SLIDE);
  if (missing < 3) return 0;
  return Math.min(order.price, Math.round((order.price * missing) / order.slides / 100) * 100);
}

async function render(deck, { color, style, lang, profile }) {
  const pptx = await buildDeck(deck, { color, style, lang, profile });
  fs.mkdirSync(config.TMP_DIR, { recursive: true });
  const dir = fs.mkdtempSync(path.join(config.TMP_DIR, 'job-'));
  let pdf = null;
  try {
    const file = path.join(dir, 'deck.pptx');
    fs.writeFileSync(file, pptx);
    if (!config.DISABLE_PDF) {
      try {
        const out = await toPdf(file);
        pdf = fs.readFileSync(out);
      } catch (e) {
        console.warn('PDF yasalmadi (faqat .pptx yuboriladi):', e.message);
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return { pptx, pdf };
}

/** params: { topic, slides, lang, color, style, lecture, references, profile } */
async function createDeck(params) {
  const deck = trimToTarget(await ai.generateDeck(params), params.slides - 1);
  const files = await render(deck, params);
  return { deck, finalSlides: deck.slides.length + 1, ...files };
}

/** params: { deck, instruction, lang, color, style, profile } */
async function editDeck(params) {
  const res = await ai.editDeck({ deck: params.deck, instruction: params.instruction, lang: params.lang });
  if (!res.changed) return { ...res, pptx: null, pdf: null };
  const files = await render(res.deck, params);
  return { ...res, ...files };
}

/** params: { deck, topic, lang }. Qaytaradi: [{ q, a, level }] (oʻqituvchi savollari va namunaviy javoblar) */
async function createDefense(params) {
  return ai.generateDefense({ deck: params.deck, topic: params.topic, lang: params.lang, count: config.DEFENSE_QUESTIONS });
}

// ---------------------------------------------------------------- referat va kurs ishi (.docx + PDF)
/** Matn yozilgandan keyingi hujjat: avval taxminiy bet raqamlari bilan .docx, PDFga aylantirib, mundarijadagi betlar haqiqiysiga almashtiriladi. */
async function renderDoc(doc, { lang, profile }) {
  const first = await docx.buildDocx(doc, { profile, lang });
  let buffer = first.buffer;
  let pdf = null;
  let pageCount = null;
  if (config.DISABLE_PDF) return { docx: buffer, pdf, pageCount };
  fs.mkdirSync(config.TMP_DIR, { recursive: true });
  const dir = fs.mkdtempSync(path.join(config.TMP_DIR, 'doc-'));
  try {
    const file = path.join(dir, 'doc.docx');
    fs.writeFileSync(file, buffer);
    try {
      pdf = fs.readFileSync(await toPdf(file));
    } catch (e) {
      console.warn('PDF yasalmadi (faqat .docx yuboriladi):', e.message);
      return { docx: buffer, pdf: null, pageCount };
    }
    try {
      const { pages: texts, total } = await docx.pdfPageTexts(pdf);
      pageCount = total;
      const found = docx.locateHeadings(texts, first.headings);
      const ok = found.filter((p) => Number.isInteger(p)).length;
      if (ok >= Math.ceil(found.length / 2)) {
        const pages = found.map((p, i) => (Number.isInteger(p) ? p : first.headings[i].page));
        if (pages.some((p, i) => p !== first.headings[i].page)) {
          const second = await docx.buildDocx(doc, { profile, lang, pages });
          fs.writeFileSync(file, second.buffer);
          pdf = fs.readFileSync(await toPdf(file));
          buffer = second.buffer;
        }
      }
    } catch (e) {
      // mundarijadagi betlar taxminiy qoladi — hujjat baribir yaroqli
      console.warn('Mundarija betlari aniqlanmadi (taxminiy qoldi):', e.message);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return { docx: buffer, pdf, pageCount };
}

/** params: { kind, topic, pages, lang, subject, lecture, references, profile } */
async function createDoc(params) {
  const gen = await docgen.generateDoc(params);
  const files = await renderDoc(gen.doc, params);
  return { doc: gen.doc, words: gen.words, targetWords: gen.targetWords, ...files };
}

/**
 * Matn rejadagidan ancha kam chiqsa qaytariladigan pul: soʻz soni rejaning 75 foizidan kam boʻlsa, yetishmagan ulushi
 * (100 soʻmgacha yaxlitlanadi, toʻlangandan koʻp emas).
 */
function docShortfallRefund(order, words, target) {
  if (!(target > 0) || !(order.price > 0)) return 0;
  const ratio = words / target;
  if (ratio >= 0.75) return 0;
  return Math.min(order.price, Math.max(0, Math.round((order.price * (1 - ratio)) / 100) * 100));
}

function fileBase(topic) {
  const t = String(topic || 'Taqdimot').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
  return t || 'Taqdimot';
}

module.exports = { createDeck, editDeck, createDefense, fileBase, trimToTarget, render, shortfallRefund, createDoc, renderDoc, docShortfallRefund };
