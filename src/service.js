// Biznes mantiq: matn yozish -> slaydlar -> .pptx va .pdf. Telegramga bog'liq emas (shuning uchun osongina sinaladi).
const fs = require('fs');
const path = require('path');
const config = require('./config');
const ai = require('./ai');
const { buildDeck } = require('./deck');
const { toPdf } = require('./pdf');

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

function fileBase(topic) {
  const t = String(topic || 'Taqdimot').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
  return t || 'Taqdimot';
}

module.exports = { createDeck, editDeck, fileBase, trimToTarget, render, shortfallRefund };
