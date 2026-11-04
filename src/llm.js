// AI chaqiruvi: bitta funksiya callTool(system, user, tool) -> tool kirishi (JSON obyekt).
// Ikki manba bor: Anthropic (Claude) va OpenRouter. Qaysi biri ishlashi config.AI_PROVIDER da.
const config = require('./config');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TIMEOUT_MS = 240000;
const RETRY_MS = parseInt(process.env.AI_RETRY_MS || '', 10) || 2500;
const MAX_TRIES = 3;

// ---------------------------------------------------------------- Anthropic
let client = null;
function anthropic() {
  if (!client) {
    const Anthropic = require('@anthropic-ai/sdk');
    client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, timeout: TIMEOUT_MS, maxRetries: 2 });
  }
  return client;
}

async function viaAnthropic(system, user, tool, maxTokens) {
  const res = await anthropic().messages.create({
    model: config.ANTHROPIC_MODEL,
    // oqimsiz (non-streaming) soʻrovda SDK ~21 000 tokendan kattasini rad etadi
    max_tokens: Math.min(maxTokens, 20000),
    system,
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content: user }],
  });
  if (res.stop_reason === 'max_tokens') throw new Error('AI javobi juda uzun boʻlib kesilib qoldi');
  const block = res.content.find((b) => b.type === 'tool_use');
  if (!block || !block.input) throw new Error('AI kutilgan javobni qaytarmadi');
  return block.input;
}

// ---------------------------------------------------------------- OpenRouter
// OpenAI formatidagi chat/completions. Barcha modellar "tool" chaqiruvini bir xil
// bajarmaydi, shuning uchun uch bosqichli zaxira bor:
//   1) tool chaqiruvi (tool_calls)   2) javob matnidagi JSON   3) toolsiz "faqat JSON" rejimi
function orError(status, bodyText) {
  let msg = '';
  try {
    const j = JSON.parse(bodyText);
    msg = (j.error && (j.error.message || j.error.code)) || j.message || '';
    if (j.error && j.error.metadata && j.error.metadata.raw) msg += ' ' + String(j.error.metadata.raw).slice(0, 200);
  } catch (_) {
    msg = String(bodyText || '').slice(0, 200);
  }
  msg = String(msg).replace(/sk-or-[A-Za-z0-9_-]+/g, '***').slice(0, 300);
  let head;
  if (status === 401) head = 'OpenRouter kaliti notoʻgʻri yoki oʻchirilgan (401)';
  else if (status === 402) head = 'OpenRouter hisobida mablagʻ yetarli emas (402), openrouter.ai/credits ga pul tashlang';
  else if (status === 403) head = 'OpenRouter ruxsat bermadi (403)';
  else if (status === 404) head = 'OpenRouterda bu model topilmadi yoki ishlamayapti (404)';
  else if (status === 429) head = 'OpenRouter soʻrovlar limitiga yetdi (429)';
  else head = `OpenRouter xatosi (${status})`;
  const err = new Error(msg ? `${head}: ${msg}` : head);
  err.status = status;
  err.detail = msg;
  return err;
}

async function post(body) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(config.OPENROUTER_BASE_URL + '/chat/completions', {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + config.OPENROUTER_API_KEY,
          'X-Title': 'Slayd bot',
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (res.ok) {
        let json;
        try {
          json = JSON.parse(text);
        } catch (_) {
          throw Object.assign(new Error('OpenRouter notoʻgʻri javob qaytardi'), { retry: true });
        }
        // OpenRouter ba'zan 200 bilan {error:{...}} qaytaradi
        if (json && json.error && !json.choices) throw Object.assign(orError(json.error.code || 502, JSON.stringify(json)), { retry: true });
        return json;
      }
      const err = orError(res.status, text);
      err.retry = res.status === 429 || res.status >= 500;
      throw err;
    } catch (e) {
      if (e.name === 'AbortError') e = Object.assign(new Error('OpenRouter javob bermadi (vaqt tugadi)'), { retry: true });
      else if (e.cause && !e.status && !e.retry) e = Object.assign(new Error('OpenRouterga ulanib boʻlmadi: ' + (e.cause.code || e.cause.message || e.message)), { retry: true });
      lastErr = e;
      if (!e.retry || attempt === MAX_TRIES) throw e;
      await sleep(RETRY_MS * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

// Matn ichidan JSON obyektni ajratib olish (```json ... ``` va ortiqcha gaplarni tashlaydi)
function extractJson(s) {
  if (s && typeof s === 'object') return s;
  let t = String(s || '').trim();
  if (!t) return null;
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    const v = JSON.parse(t);
    return v && typeof v === 'object' ? v : null;
  } catch (_) {
    /* davom etamiz */
  }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try {
      const v = JSON.parse(t.slice(a, b + 1));
      return v && typeof v === 'object' ? v : null;
    } catch (_) {
      return null;
    }
  }
  return null;
}

function contentText(msg) {
  const c = msg && msg.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((p) => (typeof p === 'string' ? p : p && p.text) || '').join('');
  return '';
}

function parseChoice(json, tool) {
  const choice = json && json.choices && json.choices[0];
  if (!choice) return { err: 'OpenRouter boʻsh javob qaytardi' };
  if (choice.finish_reason === 'length') return { err: 'AI javobi juda uzun boʻlib kesilib qoldi' };
  const msg = choice.message || {};
  const calls = msg.tool_calls || [];
  const call = calls.find((c) => c.function && c.function.name === tool.name) || calls[0];
  if (call && call.function) {
    const v = extractJson(call.function.arguments);
    if (v) return { value: v };
  }
  const v = extractJson(contentText(msg));
  if (v) return { value: v.input && typeof v.input === 'object' ? v.input : v };
  return { err: 'AI kutilgan javobni qaytarmadi' };
}

async function viaOpenRouter(system, user, tool, maxTokens) {
  const base = {
    model: config.OPENROUTER_MODEL,
    // OpenRouter hisobda max_tokens ga yetarli pul borligini oldindan talab qiladi, shuning uchun keraksiz katta qoʻymaymiz
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };

  // 1) tool chaqiruvi
  let toolsRejected = false;
  try {
    const json = await post({
      ...base,
      tools: [{ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.input_schema } }],
      tool_choice: { type: 'function', function: { name: tool.name } },
    });
    const r = parseChoice(json, tool);
    if (r.value) return r.value;
    if (/uzun/.test(r.err)) throw new Error(r.err);
  } catch (e) {
    // faqat "model tool ni qoʻllamaydi" turidagi xatolarda zaxiraga oʻtamiz
    const toolish = e.status === 400 || e.status === 404 || e.status === 422;
    if (!toolish || /kaliti|hisobida/.test(e.message)) throw e;
    toolsRejected = true;
  }

  // 2) zaxira: toolsiz, faqat JSON
  const schema = JSON.stringify(tool.input_schema);
  const json = await post({
    ...base,
    messages: [
      {
        role: 'system',
        content:
          system +
          `\n\nThis model run has no tool calling. Instead of calling the tool "${tool.name}", reply with ONE JSON object only (no markdown fences, no commentary) that matches this JSON Schema:\n${schema}`,
      },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
  }).catch((e) => {
    // ba'zi modellar response_format ni qabul qilmaydi: usiz yana bir urinish
    if (e.status === 400 || e.status === 404 || e.status === 422) {
      return post({ ...base, messages: [{ role: 'system', content: system + `\n\nReply with ONE JSON object only that matches this JSON Schema:\n${schema}` }, { role: 'user', content: user }] });
    }
    throw e;
  });
  const r = parseChoice(json, tool);
  if (r.value) return r.value;
  throw new Error(toolsRejected ? `${r.err} (model tool chaqiruvini ham, JSON rejimini ham bajarmadi)` : r.err);
}

// ---------------------------------------------------------------- umumiy
async function callTool(system, user, tool, { maxTokens } = {}) {
  const max = Math.max(1000, Math.min(maxTokens || config.AI_MAX_TOKENS, config.AI_MAX_TOKENS));
  if (config.AI_PROVIDER === 'openrouter') return viaOpenRouter(system, user, tool, max);
  return viaAnthropic(system, user, tool, max);
}

// ---------------------------------------------------------------- hisob holati (/ai buyrugʻi)
const usd = (n) => (typeof n === 'number' && Number.isFinite(n) ? '$' + (Math.abs(n) >= 0.01 || n === 0 ? n.toFixed(2) : n.toFixed(4)) : '?');

async function orGet(path) {
  const res = await fetch(config.OPENROUTER_BASE_URL + path, {
    headers: { Authorization: 'Bearer ' + config.OPENROUTER_API_KEY },
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  if (!res.ok) throw orError(res.status, text);
  const j = JSON.parse(text);
  return j && j.data ? j.data : j;
}

/** Adminga koʻrsatish uchun AI manbasi va (OpenRouter boʻlsa) hisob qoldigʻi haqida matn. */
async function accountInfo() {
  if (config.MOCK_AI) return 'AI: sinov rejimi (MOCK_AI=1), haqiqiy AI ishlatilmayapti.';
  if (config.AI_PROVIDER !== 'openrouter') return `AI: Claude (Anthropic)\nModel: ${config.ANTHROPIC_MODEL}\nQoldiqni console.anthropic.com → Billing da koʻring.`;
  const [key, credits] = await Promise.allSettled([orGet('/key'), orGet('/credits')]);
  const lines = ['AI: OpenRouter', `Model: ${config.OPENROUTER_MODEL}`];
  if (key.status === 'fulfilled') {
    const k = key.value;
    if (k.is_free_tier === true) lines.push('Hisob turi: BEPUL (hali pul tashlanmagan, pullik modellar ishlamaydi)');
    if (k.limit != null) lines.push(`Kalit limiti: ${usd(k.limit)}, sarflangan: ${usd(k.usage)}, qoldi: ${usd(k.limit_remaining)}`);
    else lines.push(`Kalit boʻyicha sarflangan: ${usd(k.usage)} (limit qoʻyilmagan)`);
  } else {
    lines.push('Kalit holatini olib boʻlmadi: ' + key.reason.message);
  }
  if (credits.status === 'fulfilled' && typeof credits.value.total_credits === 'number') {
    const c = credits.value;
    lines.push(`Hisob: tashlangan ${usd(c.total_credits)}, sarflangan ${usd(c.total_usage)}, qoldi ${usd(c.total_credits - c.total_usage)}`);
  } else {
    lines.push('Hisob qoldigʻini aniq koʻrish: openrouter.ai/settings/credits');
  }
  return lines.join('\n');
}

module.exports = { callTool, extractJson, accountInfo };
