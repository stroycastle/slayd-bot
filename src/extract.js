// Foydalanuvchi yuborgan fayldan (txt, docx, pdf) matn ajratib olish.
const config = require('./config');

async function extractText(buffer, fileName) {
  const name = String(fileName || '').toLowerCase();
  let text = '';
  if (name.endsWith('.txt') || name.endsWith('.md')) {
    text = buffer.toString('utf8');
  } else if (name.endsWith('.docx')) {
    const mammoth = require('mammoth');
    const r = await mammoth.extractRawText({ buffer });
    text = r.value || '';
  } else if (name.endsWith('.pdf')) {
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    const r = await pdfParse(buffer);
    text = r.text || '';
  } else {
    throw new Error('Faqat .txt, .docx yoki .pdf fayl qabul qilinadi');
  }
  return text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

function clip(text) {
  if (text.length <= config.MAX_LECTURE_CHARS) return { text, clipped: false };
  return { text: text.slice(0, config.MAX_LECTURE_CHARS), clipped: true };
}

module.exports = { extractText, clip };
