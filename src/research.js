// Mavzu boʻyicha yangi maʼlumot topish: AI xotirasi eskirgan boʻlishi mumkin (masalan 2024-yilgacha),
// shuning uchun taqdimot yozishdan oldin hozirgi manbalar olinib, AIga beriladi.
// Tavily kaliti boʻlsa shu, boʻlmasa Vikipediya (kalitsiz, bepul). Har qanday xatoda jim ishdan chiqib ketadi: taqdimot baribir yoziladi.
const config = require('./config');
const llm = require('./llm');

const UA = 'SlaydBot/1.0 (Telegram presentation bot)';
const MAX_SOURCES = 5;
const MAX_TOTAL = 9000;

/** Bugungi sana (Oʻzbekiston vaqti, UTC+5): { iso: '2026-11-06', year: 2026, dmy: '06.11.2026' } */
function today(now = Date.now()) {
  const iso = new Date(now + 5 * 3600 * 1000).toISOString().slice(0, 10);
  const [y, m, d] = iso.split('-');
  return { iso, year: Number(y), dmy: `${d}.${m}.${y}` };
}

const squash = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);

async function getJson(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.RESEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json', ...(opts.headers || {}) },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('vaqt tugadi')), ms).unref())]);

// ---------------------------------------------------------------- qidiruv soʻrovlarini tuzish
const PLAN_TOOL = {
  name: 'submit_queries',
  description: 'Submit the search queries.',
  input_schema: {
    type: 'object',
    properties: { queries: { type: 'array', items: { type: 'string' } } },
    required: ['queries'],
  },
};

/** AI mavzuni (oʻzbekcha/ruscha boʻlishi mumkin) inglizcha 1–2 ta qisqa qidiruv soʻroviga aylantiradi. */
async function planQueries(topic) {
  const t = today();
  const system = `You prepare web searches for a university presentation. Today is ${t.iso}. The topic may be in Uzbek (Latin or Cyrillic) or Russian. Return 1 or 2 short English search queries (max 8 words each) that find the most recent facts and statistics about it. Add the year ${t.year} only when the topic is about figures, rankings or recent developments. Call submit_queries.`;
  const out = await llm.callTool(system, `Topic: ${topic}`, PLAN_TOOL, { maxTokens: 1000 });
  const qs = out && Array.isArray(out.queries) ? out.queries : [];
  return qs.map((q) => squash(q, 120)).filter(Boolean).slice(0, 2);
}

// ---------------------------------------------------------------- manbalar
/** Vikipediya: qidiruv + sahifa kirish qismi (intro) bir soʻrovda. */
async function wikiSearch(wiki, query, n) {
  const base = config.WIKI_API_URL.replace('{lang}', wiki);
  const p = new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: query, gsrlimit: String(n),
    prop: 'extracts|info', inprop: 'url', exintro: '1', explaintext: '1', exlimit: String(n), exchars: '2200',
    redirects: '1', format: 'json', formatversion: '2',
  });
  const json = await getJson(`${base}?${p}`);
  const raw = json && json.query && json.query.pages;
  const pages = Array.isArray(raw) ? raw : raw ? Object.values(raw) : [];
  return pages
    .filter((pg) => pg && pg.title && pg.extract)
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map((pg) => ({
      title: squash(pg.title, 120),
      url: pg.fullurl || pg.canonicalurl || '',
      date: pg.touched ? String(pg.touched).slice(0, 10) : '',
      text: squash(pg.extract, 1800),
      site: `${wiki}.wikipedia.org`,
    }));
}

/** Tavily (veb-qidiruv). Kalit Authorization sarlavhasida. */
async function tavilySearch(query, n) {
  const json = await getJson(config.TAVILY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.TAVILY_API_KEY}` },
    body: JSON.stringify({ query, search_depth: 'basic', max_results: n, include_answer: false, topic: 'general' }),
  });
  return ((json && json.results) || [])
    .filter((r) => r && r.url && r.content)
    .map((r) => {
      let site = '';
      try { site = new URL(r.url).hostname.replace(/^www\./, ''); } catch (_) { /* yoʻq */ }
      return { title: squash(r.title || site, 120), url: r.url, date: squash(r.published_date, 10), text: squash(r.content, 1200), site };
    });
}

const settled = async (promises) => (await Promise.allSettled(promises)).flatMap((r) => (r.status === 'fulfilled' ? r.value : []));

function format(sources, t) {
  const parts = [];
  let total = 0;
  sources.forEach((s, i) => {
    const head = `[${i + 1}] ${s.title}${s.site ? ` (${s.site})` : ''}${s.url ? ` ${s.url}` : ''}${s.date ? ` — updated ${s.date}` : ''}`;
    const block = `${head}\n${s.text}`;
    if (total + block.length > MAX_TOTAL) return;
    total += block.length;
    parts.push(block);
  });
  return `<fresh_sources retrieved="${t.iso}">\n${parts.join('\n\n')}\n</fresh_sources>`;
}

/**
 * Mavzu boʻyicha yangi manbalar. Qaytaradi: { text, sources } yoki null (topilmasa/xato boʻlsa).
 * @param {{topic:string, lang:string}} p
 */
async function research({ topic, lang }) {
  if (!config.WEB_RESEARCH || config.MOCK_AI || !topic) return null;
  try {
    return await withTimeout(run(topic, lang), config.RESEARCH_TIMEOUT_MS * 3 + 15000);
  } catch (e) {
    console.warn('Qidiruv ishlamadi, taqdimot manbasiz yoziladi:', String(e.message || e).slice(0, 200));
    return null;
  }
}

async function run(topic, lang) {
  const t = today();
  let planned = [];
  try {
    planned = await withTimeout(planQueries(topic), 20000);
  } catch (e) {
    console.warn('Qidiruv soʻrovlarini tuzib boʻlmadi, mavzu oʻzi ishlatiladi:', String(e.message || e).slice(0, 120));
  }
  const own = lang === 'ru' ? 'ru' : lang === 'kaa' ? 'kaa' : 'uz'; // mavzuning oʻz tilidagi Vikipediya
  let hits = [];
  let provider = 'wikipedia';
  if (config.TAVILY_API_KEY) {
    provider = 'tavily';
    const qs = [...new Set([...planned, topic])].slice(0, 3);
    hits = await settled(qs.map((q) => tavilySearch(q, 4)));
  }
  if (hits.length < 2) {
    provider = hits.length ? 'tavily+wikipedia' : 'wikipedia';
    const jobs = [];
    for (const q of planned.length ? planned : [topic]) jobs.push(wikiSearch('en', q, 3));
    jobs.push(wikiSearch(own, topic, 2));
    hits = hits.concat(await settled(jobs));
  }
  const seen = new Set();
  const sources = [];
  for (const h of hits) {
    const key = h.url || h.title;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(h);
    if (sources.length >= MAX_SOURCES) break;
  }
  if (!sources.length) {
    console.log('🔎 Yangi manba topilmadi:', topic.slice(0, 60));
    return null;
  }
  console.log(`🔎 ${sources.length} ta yangi manba (${provider}): ${topic.slice(0, 60)}`);
  return { text: format(sources, t), sources };
}

module.exports = { research, today, planQueries };
