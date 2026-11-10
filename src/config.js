require('dotenv').config({ quiet: true });
const path = require('path');

const num = (v, d) => {
  const n = parseInt(String(v === undefined ? '' : v).replace(/\s/g, ''), 10);
  return Number.isFinite(n) ? n : d;
};

// Qaysi AI ishlatiladi: aniq yozilgan boʻlsa shu; yozilmasa Claude kaliti bor boʻlsa Claude, boʻlmasa OpenRouter.
// OpenRouter kalitlari: OPENROUTER_API_KEY (asosiy) + OPENROUTER_API_KEYS (vergul, boʻshliq yoki yangi qator bilan ajratilgan qoʻshimchalar)
const OPENROUTER_API_KEYS = [
  ...new Set(`${process.env.OPENROUTER_API_KEY || ''},${process.env.OPENROUTER_API_KEYS || ''}`.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)),
];

function pickProvider() {
  const forced = String(process.env.AI_PROVIDER || '').trim().toLowerCase();
  if (forced === 'openrouter' || forced === 'anthropic') return forced;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (OPENROUTER_API_KEYS.length) return 'openrouter';
  return '';
}

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  AI_PROVIDER: pickProvider(),

  // AI manbasi: Claude (Anthropic) kaliti bo'lsa o'sha, bo'lmasa OpenRouter.
  // AI_PROVIDER=openrouter yoki anthropic deb majburlash mumkin.
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  OPENROUTER_API_KEY: OPENROUTER_API_KEYS[0] || '',
  OPENROUTER_API_KEYS,
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-5.5',
  // Zaxira modellar (vergul bilan): asosiy model band yoki ishlamasa, shular navbat bilan sinab koʻriladi
  OPENROUTER_FALLBACK_MODELS: String(process.env.OPENROUTER_FALLBACK_MODELS || '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean),
  OPENROUTER_BASE_URL: (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
  AI_MAX_TOKENS: num(process.env.AI_MAX_TOKENS, 32000), // yuqori chegara; har soʻrovga kerakli miqdor alohida hisoblanadi
  // MOCK_AI=1 bo'lsa API kalitsiz, tayyor namuna matn bilan ishlaydi (sinash uchun)
  MOCK_AI: process.env.MOCK_AI === '1',

  // Yangi maʼlumot: AI oʻz xotirasiga (2024-yilgacha) emas, mavzu boʻyicha hozir topilgan manbalarga tayansin.
  // WEB_RESEARCH=0 qilinsa oʻchadi. TAVILY_API_KEY (tavily.com, oyiga 1000 ta bepul qidiruv) boʻlsa shu ishlatiladi, boʻlmasa Vikipediya.
  WEB_RESEARCH: process.env.WEB_RESEARCH !== '0',
  TAVILY_API_KEY: (process.env.TAVILY_API_KEY || '').trim(),
  TAVILY_URL: process.env.TAVILY_URL || 'https://api.tavily.com/search',
  WIKI_API_URL: process.env.WIKI_API_URL || 'https://{lang}.wikipedia.org/w/api.php', // {lang} oʻrniga til kodi qoʻyiladi
  RESEARCH_TIMEOUT_MS: num(process.env.RESEARCH_TIMEOUT_MS, 8000),

  ADMIN_IDS: (process.env.ADMIN_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number),
  CARD_NUMBER: process.env.CARD_NUMBER || '0000 0000 0000 0000',
  CARD_HOLDER: process.env.CARD_HOLDER || 'ISM FAMILIYA',

  // Butun taqdimot narxi, slayd soniga bogʻliq emas (8 ta ham, 30 ta ham bir xil). 0 boʻlsa, slayd boshiga PRICE_SLIDE olinadi.
  PRICE_DECK: num(process.env.PRICE_DECK, 5000),
  PRICE_SLIDE: num(process.env.PRICE_SLIDE, 5000), // faqat PRICE_DECK=0 boʻlganda ishlaydi
  PRICE_EDIT: num(process.env.PRICE_EDIT, 3000), // 1 ta tahrir
  deckPrice(slides) {
    return this.PRICE_DECK > 0 ? this.PRICE_DECK : slides * this.PRICE_SLIDE;
  },
  MIN_TOPUP: num(process.env.MIN_TOPUP, 10000),
  MIN_SLIDES: 8,
  MAX_SLIDES: 30,

  SOFFICE_PATH: process.env.SOFFICE_PATH || '',
  // DISABLE_PDF=1: PDF yasalmaydi, faqat .pptx (xotirasi kichik serverlarda LibreOffice jarayonni oʻldirib qoʻymasligi uchun)
  DISABLE_PDF: process.env.DISABLE_PDF === '1',

  // Uyquga qarshi: Renderning bepul rejasida xizmat 15 daqiqa soʻrovsiz tursa uxlaydi. Webhook rejimida xizmat oʻziga
  // har KEEP_ALIVE_MIN daqiqada /healthz soʻrovini yuboradi. 0 qilinsa oʻchadi (pullik rejada kerak emas).
  KEEP_ALIVE_MIN: num(process.env.KEEP_ALIVE_MIN, 5),

  // Webhook rejimi (hosting uchun). WEBHOOK_URL yoki Render bergan RENDER_EXTERNAL_URL boʻlsa yoqiladi,
  // boʻlmasa bot oddiy "polling" rejimida ishlaydi (kompyuterda).
  WEBHOOK_URL: String(process.env.WEBHOOK_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, ''),
  PORT: num(process.env.PORT, 3000),

  // Mini App (veb-ilova). Webhook rejimida bot serveri uni oʻzi xizmat qiladi, manzil Renderniki (WEBAPP_URL berish shart emas).
  // WEBAPP=0 qilinsa oʻchadi. Kompyuterda (polling) sinash uchun WEB_PORT bering va ochiq HTTPS manzilni (tunnel) WEBAPP_URL ga yozing.
  WEBAPP: process.env.WEBAPP !== '0',
  WEBAPP_URL: String(process.env.WEBAPP_URL || process.env.WEBHOOK_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, ''),
  WEB_PORT: num(process.env.WEB_PORT, 0),
  // faqat mahalliy sinash uchun: DEV_AUTH=1 boʻlsa, x-dev-user sarlavhasi bilan kirish mumkin. Hostingda ishga tushmaydi.
  DEV_AUTH: process.env.DEV_AUTH === '1',
  MAX_EXTRACT_BYTES: num(process.env.MAX_EXTRACT_BYTES, 4 * 1024 * 1024), // mini ilovadan yuklanadigan fayl (txt, docx, pdf)

  // Doimiy ombor (Supabase). Ikkalasi berilsa, balans/profil/buyurtmalar Supabaseda saqlanadi va restartda yoʻqolmaydi.
  // Kalit — SERVER kaliti (service_role yoki sb_secret_...), anon/publishable emas.
  SUPABASE_URL: String(process.env.SUPABASE_URL || '').trim(),
  SUPABASE_SERVICE_KEY: String(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim(),

  DATA_DIR: path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data')),
  TMP_DIR: path.resolve(process.env.TMP_DIR || path.join(__dirname, '..', 'tmp')),

  MAX_LECTURE_CHARS: 60000,
};
