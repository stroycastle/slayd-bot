// Yangi maʼlumot (sana + jonli manba) qismini tekshiradi. Internet va haqiqiy AI kerak emas.
// Ishga tushirish: npm run test:research
const assert = require('assert');
const http = require('http');

const state = { mode: 'ok', log: [] };

const WIKI = {
  en: [
    { pageid: 1, title: 'Uzbekistan', index: 1, extract: 'Uzbekistan has about 37 million people (2025 estimate).', fullurl: 'https://en.wikipedia.org/wiki/Uzbekistan', touched: '2026-10-30T10:00:00Z' },
    { pageid: 2, title: 'Demographics of Uzbekistan', index: 2, extract: 'Population growth in Uzbekistan slowed in recent years.', fullurl: 'https://en.wikipedia.org/wiki/Demographics_of_Uzbekistan' },
  ],
  uz: [{ pageid: 3, title: 'Oʻzbekiston', index: 1, extract: 'Oʻzbekiston Markaziy Osiyodagi davlat.', fullurl: 'https://uz.wikipedia.org/wiki/Oʻzbekiston' }],
  ru: [{ pageid: 4, title: 'Узбекистан', index: 1, extract: 'Узбекистан — государство в Центральной Азии.', fullurl: 'https://ru.wikipedia.org/wiki/Узбекистан' }],
};

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    state.log.push({ method: req.method, path: u.pathname, q: u.searchParams.get('gsrsearch'), auth: req.headers.authorization, body });
    const send = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    const reply = () => {
      if (state.mode === 'error') return send(500, { error: 'boom' });
      const m = u.pathname.match(/^\/wiki\/(\w+)$/);
      if (m) return send(200, { query: { pages: WIKI[m[1]] || [] } });
      if (u.pathname === '/tavily') {
        return send(200, {
          results: [
            { title: 'Population of Uzbekistan 2026', url: 'https://www.stat.uz/en/population', content: 'As of 1 January 2026 the population was 37.5 million.', published_date: '2026-02-01' },
            { title: 'Uzbekistan economy', url: 'https://www.worldbank.org/en/country/uzbekistan', content: 'GDP growth was 6.5% in 2025.' },
          ],
        });
      }
      send(404, {});
    };
    if (state.mode === 'slow') setTimeout(reply, 1500);
    else reply();
  });
});

let n = 0;
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`);

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  process.env.WIKI_API_URL = `http://127.0.0.1:${port}/wiki/{lang}`;
  process.env.TAVILY_URL = `http://127.0.0.1:${port}/tavily`;
  process.env.MOCK_AI = '0';
  process.env.OPENROUTER_API_KEY = 'sk-or-test';
  process.env.TAVILY_API_KEY = '';

  const config = require('../src/config');
  const llm = require('../src/llm');
  const calls = [];
  llm.callTool = async (system, user, tool) => {
    calls.push({ system, user, tool: tool.name });
    if (tool.name === 'submit_queries') {
      if (state.planFails) throw new Error('429');
      return { queries: ['Uzbekistan population 2026', 'Uzbekistan demographics'] };
    }
    if (tool.name === 'submit_changes') return { reply: 'Oʻzgarmadi.', changes: [] };
    return {
      title: 'Sinov',
      slides: ['A', 'B', 'C', 'D'].map((t) => ({ layout: 'definition', title: t, lead: `Taʼrif ${t}`, items: [{ head: 'x', text: 'y' }] })),
    };
  };
  const { research, today } = require('../src/research');
  const ai = require('../src/ai');

  // 1. sana: Oʻzbekiston vaqti (UTC+5) boʻyicha
  const t = today(Date.UTC(2026, 10, 5, 20, 0));
  assert.deepStrictEqual(t, { iso: '2026-11-06', year: 2026, dmy: '06.11.2026' });
  ok('bugungi sana Oʻzbekiston vaqti bilan hisoblanadi');

  // 2. Vikipediya yoʻli (kalitsiz): AI tuzgan inglizcha soʻrovlar en, mavzuning oʻzi oʻz tilidagi vikida qidiriladi
  let r = await research({ topic: 'Oʻzbekiston aholisi', lang: 'uz' });
  assert.ok(r && r.sources.length >= 3 && r.sources.length <= 5);
  assert.ok(r.text.startsWith(`<fresh_sources retrieved="${today().iso}">`));
  assert.ok(r.text.includes('Uzbekistan has about 37 million people') && r.text.includes('https://en.wikipedia.org/wiki/Uzbekistan'));
  assert.ok(r.text.includes('updated 2026-10-30'));
  assert.ok(state.log.some((l) => l.path === '/wiki/en' && l.q === 'Uzbekistan population 2026'));
  assert.ok(state.log.some((l) => l.path === '/wiki/uz' && l.q === 'Oʻzbekiston aholisi'));
  assert.strictEqual(new Set(r.sources.map((x) => x.url)).size, r.sources.length, 'takrorlanmasin');
  ok('Vikipediya: manbalar topiladi, soʻrovlar toʻgʻri tilda yuboriladi, takror yoʻq');

  // 3. rus tili: rus vikisi
  state.log.length = 0;
  await research({ topic: 'Население Узбекистана', lang: 'ru' });
  assert.ok(state.log.some((l) => l.path === '/wiki/ru' && l.q === 'Население Узбекистана'));
  ok('rus tilida rus Vikipediyasi qidiriladi');

  // 3b. qoraqalpoq tili: qoraqalpoq Vikipediyasi (kaa)
  state.log.length = 0;
  await research({ topic: 'Qaraqalpaqstan', lang: 'kaa' });
  assert.ok(state.log.some((l) => l.path === '/wiki/kaa' && l.q === 'Qaraqalpaqstan'));
  ok('qoraqalpoq tilida qoraqalpoq Vikipediyasi (kaa) qidiriladi');

  // 4. soʻrovlarni tuzish ishlamasa ham manba olinadi
  state.planFails = true;
  state.log.length = 0;
  r = await research({ topic: 'Uzbekistan economy', lang: 'uz' });
  assert.ok(r && r.sources.length >= 1);
  assert.ok(state.log.some((l) => l.path === '/wiki/en' && l.q === 'Uzbekistan economy'));
  state.planFails = false;
  ok('AI soʻrov tuzolmasa, mavzuning oʻzi bilan qidiriladi');

  // 5. Tavily kaliti boʻlsa shu ishlatiladi, Vikipediyaga kerak boʻlmaydi
  config.TAVILY_API_KEY = 'tvly-test';
  state.log.length = 0;
  r = await research({ topic: 'Oʻzbekiston aholisi', lang: 'uz' });
  assert.ok(r.text.includes('37.5 million') && r.text.includes('stat.uz'));
  const tv = state.log.filter((l) => l.path === '/tavily');
  assert.ok(tv.length >= 1 && tv.every((l) => l.auth === 'Bearer tvly-test'));
  assert.ok(!state.log.some((l) => l.path.startsWith('/wiki')));
  config.TAVILY_API_KEY = '';
  ok('Tavily kaliti boʻlsa veb-qidiruv ishlatiladi');

  // 6. server xato bersa jim null, ishdan chiqmaydi
  state.mode = 'error';
  assert.strictEqual(await research({ topic: 'Oʻzbekiston', lang: 'uz' }), null);
  ok('qidiruv xato bersa null qaytadi, istisno chiqmaydi');

  // 7. sekin server: vaqt chegarasi
  state.mode = 'slow';
  config.RESEARCH_TIMEOUT_MS = 300;
  const t0 = Date.now();
  assert.strictEqual(await research({ topic: 'Oʻzbekiston', lang: 'uz' }), null);
  assert.ok(Date.now() - t0 < 5000, 'juda uzoq kutdi');
  config.RESEARCH_TIMEOUT_MS = 8000;
  state.mode = 'ok';
  ok('sekin server uzoq kutdirmaydi');

  // 8. oʻchirib qoʻyish
  config.WEB_RESEARCH = false;
  state.log.length = 0;
  assert.strictEqual(await research({ topic: 'Oʻzbekiston', lang: 'uz' }), null);
  assert.strictEqual(state.log.length, 0);
  config.WEB_RESEARCH = true;
  ok('WEB_RESEARCH=0 boʻlsa qidirilmaydi');

  // 9. taqdimot promptida sana, qoida va manbalar bor
  calls.length = 0;
  await ai.generateDeck({ topic: 'Oʻzbekiston aholisi', slides: 8, lang: 'uz' });
  const deckCall = calls.find((c) => c.tool === 'submit_deck');
  assert.ok(deckCall.system.includes(`Today's date is ${today().iso}`));
  assert.ok(deckCall.system.includes('name its year'));
  assert.ok(deckCall.system.includes('<fresh_sources> holds pages fetched today'));
  assert.ok(deckCall.system.includes(`murojaat sanasi: ${today().dmy}`));
  const kaaCall = (await ai.generateDeck({ topic: 'Qaraqalpaqstan', slides: 8, lang: 'kaa' }), calls.filter((c) => c.tool === 'submit_deck').slice(-1)[0]);
  assert.ok(kaaCall.system.includes('Karakalpak') && kaaCall.system.includes('kiriw sánesi'), 'qoraqalpoq tili qoidasi promptda');
  assert.ok(deckCall.user.includes('<fresh_sources retrieved='));
  ok('taqdimot promptiga sana, yil qoidasi va yangi manbalar qoʻshiladi');

  // 10. maʼruza matni berilsa qidirilmaydi
  calls.length = 0;
  state.log.length = 0;
  await ai.generateDeck({ topic: 'Mavzu', slides: 8, lang: 'uz', lecture: 'Maʼruza matni.' });
  const lecCall = calls.find((c) => c.tool === 'submit_deck');
  assert.ok(!lecCall.user.includes('<fresh_sources'));
  assert.ok(!lecCall.system.includes('<fresh_sources> holds pages'));
  assert.ok(lecCall.system.includes(`Today's date is ${today().iso}`), 'sana baribir bor');
  assert.strictEqual(state.log.length, 0);
  ok('maʼruza matni berilsa qidirilmaydi, lekin sana qoidasi qoladi');

  // 11. manba topilmasa taqdimot baribir yoziladi
  state.mode = 'error';
  const deck = await ai.generateDeck({ topic: 'Mavzu', slides: 8, lang: 'ru' });
  assert.ok(deck.slides.length >= 3);
  state.mode = 'ok';
  ok('qidiruv ishlamasa ham taqdimot yoziladi');

  // 12. tahrir promptida sana bor
  calls.length = 0;
  await ai.editDeck({ deck, instruction: 'Yangi raqamlarni qoʻying', lang: 'uz' });
  const ed = calls.find((c) => c.tool === 'submit_changes');
  assert.ok(ed.system.includes(`Today's date is ${today().iso}`) && ed.system.includes('"latest"'));
  ok('tahrir promptida ham sana va ehtiyotkorlik qoidasi bor');

  console.log(`\nHamma tekshiruvlar yaxshi (${n} ta).`);
  server.close();
  process.exit(0);
})().catch((e) => {
  console.error('\n❌', e.stack || e.message);
  process.exit(1);
});
