// OpenRouter yo'lini soxta (mahalliy) server bilan tekshiradi. Internet va kalit kerak emas.
// Ishga tushirish: npm run test:ai
const http = require('http');
const assert = require('assert');

const FAKE_KEY = 'sk-or-v1-TESTKEY1234567890';
let queue = []; // har bir POST so'roviga navbat bilan javob
let seen = []; // kelgan so'rovlar
let routes = {}; // GET so'rovlari uchun: yo'l -> javob

const server = http.createServer((req, res) => {
  let data = '';
  req.on('data', (c) => (data += c));
  req.on('end', () => {
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: JSON.parse(data || '{}') });
    const step = req.method === 'GET' ? routes[req.url.replace('/api/v1', '')] || { status: 404, body: { error: { message: 'yoʻq' } } } : queue.shift() || { status: 500, body: { error: { message: 'navbat boʻsh' } } };
    res.writeHead(step.status, { 'Content-Type': 'application/json' });
    res.end(typeof step.body === 'string' ? step.body : JSON.stringify(step.body));
  });
});

const RAW_DECK = {
  title: 'Sinov mavzusi',
  slides: [
    { layout: 'agenda', title: 'Reja', items: [{ head: 'Birinchi' }, { head: 'Ikkinchi' }, { head: 'Uchinchi' }] },
    { layout: 'definition', title: 'Taʼrif', lead: 'Bu sinov taʼrifi.' },
    { layout: 'cards', title: 'Kartalar', items: [{ head: 'A', text: 'a matni' }, { head: 'B', text: 'b matni' }] },
    { layout: 'references', title: 'Adabiyotlar', references: ['Muallif. Kitob. Toshkent, 2000.'] },
  ],
};
const toolReply = (name, args, extra = {}) => ({
  status: 200,
  body: { choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } }] } }], ...extra },
});
const textReply = (content, finish = 'stop') => ({ status: 200, body: { choices: [{ finish_reason: finish, message: { role: 'assistant', content } }] } });

let passed = 0;
async function step(name, fn) {
  queue = [];
  seen = [];
  routes = {};
  try {
    await fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    console.error('  ✗ ' + name + '\n    ' + (e && e.stack ? e.stack : e));
    process.exitCode = 1;
  }
}

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  process.env.AI_PROVIDER = 'openrouter';
  process.env.OPENROUTER_API_KEY = FAKE_KEY;
  process.env.OPENROUTER_MODEL = 'test/model-1';
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${port}/api/v1`;
  process.env.AI_RETRY_MS = '5';
  process.env.MOCK_AI = '0';
  delete process.env.ANTHROPIC_API_KEY;

  const config = require('../src/config');
  assert.strictEqual(config.AI_PROVIDER, 'openrouter');
  const ai = require('../src/ai');
  const params = { topic: 'Sinov', slides: 5, lang: 'uz' };

  console.log('OpenRouter yoʻli:');

  await step('tool_calls javobi oʻqiladi, soʻrov shakli toʻgʻri', async () => {
    queue.push(toolReply('submit_deck', RAW_DECK));
    const deck = await ai.generateDeck(params);
    assert.strictEqual(deck.slides.length, 4);
    assert.strictEqual(seen.length, 1);
    const r = seen[0];
    assert.strictEqual(r.url, '/api/v1/chat/completions');
    assert.strictEqual(r.auth, 'Bearer ' + FAKE_KEY);
    assert.strictEqual(r.body.model, 'test/model-1');
    assert.strictEqual(r.body.messages[0].role, 'system');
    assert.strictEqual(r.body.messages[1].role, 'user');
    assert.ok(/Topic: Sinov/.test(r.body.messages[1].content));
    assert.strictEqual(r.body.tools[0].type, 'function');
    assert.strictEqual(r.body.tools[0].function.name, 'submit_deck');
    assert.strictEqual(r.body.tools[0].function.parameters.type, 'object');
    assert.deepStrictEqual(r.body.tool_choice, { type: 'function', function: { name: 'submit_deck' } });
    assert.strictEqual(r.body.max_tokens, 4700, '5 slayd: 1500 + 4 x 800 token');
  });

  await step('max_tokens slayd soniga qarab hisoblanadi, 30 slaydda ham chegaradan oshmaydi', async () => {
    queue.push(toolReply('submit_deck', RAW_DECK));
    await ai.generateDeck({ ...params, slides: 30 });
    assert.strictEqual(seen[0].body.max_tokens, 24700);
    queue.push(toolReply('submit_deck', RAW_DECK));
    await ai.generateDeck({ ...params, slides: 8 });
    assert.strictEqual(seen[1].body.max_tokens, 7100);
    assert.ok(seen.every((x) => x.body.max_tokens <= 32000));
  });

  await step('arguments obyekt sifatida kelsa ham ishlaydi', async () => {
    const t = toolReply('submit_deck', RAW_DECK);
    t.body.choices[0].message.tool_calls[0].function.arguments = RAW_DECK;
    queue.push(t);
    const deck = await ai.generateDeck(params);
    assert.strictEqual(deck.slides.length, 4);
  });

  await step('tool chaqirmasdan matnda JSON (```json bilan) kelsa oʻqiladi', async () => {
    queue.push(textReply('Mana natija:\n```json\n' + JSON.stringify(RAW_DECK) + '\n```'));
    const deck = await ai.generateDeck(params);
    assert.strictEqual(deck.slides.length, 4);
    assert.strictEqual(seen.length, 1);
  });

  await step('model tool ni qoʻllamasa (400) toolsiz JSON rejimiga oʻtadi', async () => {
    queue.push({ status: 404, body: { error: { message: 'No endpoints found that support tool use', code: 404 } } });
    queue.push(textReply(JSON.stringify(RAW_DECK)));
    const deck = await ai.generateDeck(params);
    assert.strictEqual(deck.slides.length, 4);
    assert.strictEqual(seen.length, 2);
    assert.ok(!seen[1].body.tools, 'ikkinchi soʻrovda tools boʻlmasligi kerak');
    assert.ok(/JSON Schema/.test(seen[1].body.messages[0].content));
    assert.deepStrictEqual(seen[1].body.response_format, { type: 'json_object' });
  });

  await step('response_format rad etilsa, usiz yana urinadi', async () => {
    queue.push({ status: 400, body: { error: { message: 'tools not supported' } } });
    queue.push({ status: 400, body: { error: { message: 'response_format not supported' } } });
    queue.push(textReply(JSON.stringify(RAW_DECK)));
    const deck = await ai.generateDeck(params);
    assert.strictEqual(deck.slides.length, 4);
    assert.strictEqual(seen.length, 3);
    assert.ok(!seen[2].body.response_format);
  });

  await step('429 va 502 da qayta urinadi, keyin muvaffaqiyat', async () => {
    queue.push({ status: 429, body: { error: { message: 'rate limited' } } });
    queue.push({ status: 502, body: { error: { message: 'bad gateway' } } });
    queue.push(toolReply('submit_deck', RAW_DECK));
    const deck = await ai.generateDeck(params);
    assert.strictEqual(deck.slides.length, 4);
    assert.strictEqual(seen.length, 3);
  });

  await step('200 + {error} javobi qayta uriniladi', async () => {
    queue.push({ status: 200, body: { error: { message: 'Provider returned error', code: 502 } } });
    queue.push(toolReply('submit_deck', RAW_DECK));
    const deck = await ai.generateDeck(params);
    assert.strictEqual(deck.slides.length, 4);
  });

  await step('401: tushunarli xabar, qayta urinmaydi, kalit sizmaydi', async () => {
    queue.push({ status: 401, body: { error: { message: `No auth credentials found for ${FAKE_KEY}` } } });
    await assert.rejects(ai.generateDeck(params), (e) => {
      assert.ok(/401/.test(e.message) && /kaliti/.test(e.message), e.message);
      assert.ok(!e.message.includes(FAKE_KEY), 'xabarda kalit boʻlmasligi kerak');
      return true;
    });
    assert.strictEqual(seen.length, 1);
  });

  await step('402: hisobda pul yoʻq xabari', async () => {
    queue.push({ status: 402, body: { error: { message: 'Insufficient credits' } } });
    await assert.rejects(ai.generateDeck(params), (e) => /402/.test(e.message) && /mablagʻ/.test(e.message));
    assert.strictEqual(seen.length, 1);
  });

  await step('finish_reason=length: "juda uzun" xatosi', async () => {
    queue.push(textReply('{"title":"x","slides":[', 'length'));
    await assert.rejects(ai.generateDeck(params), /uzun/);
  });

  await step('tushunarsiz javob: xato, kutilmagan holatda ham yiqilmaydi', async () => {
    queue.push(textReply('Kechirasiz, bajara olmayman.'));
    queue.push(textReply('Yana kechirasiz.'));
    await assert.rejects(ai.generateDeck(params), /kutilgan javob/);
  });

  await step('editDeck OpenRouter orqali ishlaydi', async () => {
    const deck = { title: 'T', subtitle: '', slides: [{ layout: 'definition', title: 'Taʼrif', lead: 'Eski matn.', notes: 'Izoh.' }] };
    queue.push(toolReply('submit_changes', { reply: 'Matn yangilandi.', changes: [{ slide: 2, content: { layout: 'definition', title: 'Taʼrif', lead: 'Yangi matn.' } }] }));
    const out = await ai.editDeck({ deck, instruction: 'Matnni yangila', lang: 'uz' });
    assert.strictEqual(out.changed, 1);
    assert.strictEqual(out.deck.slides[0].lead, 'Yangi matn.');
    assert.strictEqual(out.deck.slides[0].notes, 'Izoh.');
    assert.strictEqual(seen[0].body.tools[0].function.name, 'submit_changes');
  });

  await step('/ai: bepul hisob aniqlanadi, /credits ruxsat bermasa ham xato bermaydi', async () => {
    const llm = require('../src/llm');
    routes['/key'] = { status: 200, body: { data: { label: 'sk-or-v1-abc...xyz', limit: null, usage: 0.0123, is_free_tier: true } } };
    routes['/credits'] = { status: 403, body: { error: { message: 'management key required' } } };
    const t = await llm.accountInfo();
    assert.ok(/OpenRouter/.test(t) && /BEPUL/.test(t) && /\$0\.01/.test(t), t);
    assert.ok(/openrouter\.ai\/settings\/credits/.test(t), t);
    assert.ok(!t.includes(FAKE_KEY));
    assert.strictEqual(seen.find((x) => x.url.endsWith('/key')).auth, 'Bearer ' + FAKE_KEY);
  });

  await step('/ai: pullik hisobda qoldiq hisoblanadi', async () => {
    const llm = require('../src/llm');
    routes['/key'] = { status: 200, body: { data: { limit: null, usage: 1.5, is_free_tier: false } } };
    routes['/credits'] = { status: 200, body: { data: { total_credits: 5, total_usage: 1.5 } } };
    const t = await llm.accountInfo();
    assert.ok(/qoldi \$3\.50/.test(t) && !/BEPUL/.test(t), t);
  });

  await step('/ai: kalit notoʻgʻri boʻlsa tushunarli xabar', async () => {
    const llm = require('../src/llm');
    routes['/key'] = { status: 401, body: { error: { message: 'No auth credentials found' } } };
    routes['/credits'] = { status: 401, body: { error: { message: 'No auth credentials found' } } };
    const t = await llm.accountInfo();
    assert.ok(/401/.test(t) && /kaliti/.test(t), t);
  });

  await step('provayder tanlash: Anthropic kaliti boʻlsa u ustun, AI_PROVIDER bilan majburlash mumkin', async () => {
    const pick = (env) => {
      const { execFileSync } = require('child_process');
      const out = execFileSync(process.execPath, ['-e', "console.log(require('./src/config').AI_PROVIDER)"], {
        cwd: require('path').join(__dirname, '..'),
        env: { PATH: process.env.PATH, DOTENV_CONFIG_QUIET: 'true', ...env },
      });
      return String(out).trim();
    };
    // .env fayli bor boʻlsa dotenv unga qaramaydi: process.env ustun turadi
    assert.strictEqual(pick({ OPENROUTER_API_KEY: 'a' }), 'openrouter');
    assert.strictEqual(pick({ ANTHROPIC_API_KEY: 'b', OPENROUTER_API_KEY: 'a' }), 'anthropic');
    assert.strictEqual(pick({ ANTHROPIC_API_KEY: 'b', OPENROUTER_API_KEY: 'a', AI_PROVIDER: 'openrouter' }), 'openrouter');
  });

  server.close();
  console.log(process.exitCode ? '\nXATO bor.' : `\nHammasi yaxshi (${passed} ta tekshiruv).`);
});
