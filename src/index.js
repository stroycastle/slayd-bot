const config = require('./config');
const { Store } = require('./store');
const { createBot, fmt } = require('./bot');
const { createServer, hooks } = require('./server');
const { createWebHandler, createWebServer } = require('./web');
const { createBackend } = require('./supabase');
const { startKeepAlive } = require('./keepalive');

function fail(msg) {
  console.error('\n❌ ' + msg + '\n');
  process.exit(1);
}
const hide = (s) => String(s).replace(/bot\d+:[\w-]+/g, 'bot***');

if (!config.BOT_TOKEN) fail('BOT_TOKEN topilmadi. .env faylini tekshiring (README ga qarang).');
if (!config.MOCK_AI) {
  if (!config.AI_PROVIDER) fail('AI kaliti topilmadi. .env ga OPENROUTER_API_KEY (yoki ANTHROPIC_API_KEY) yozing. Kalitsiz sinash uchun MOCK_AI=1.');
  if (config.AI_PROVIDER === 'openrouter' && !config.OPENROUTER_API_KEYS.length) fail('AI_PROVIDER=openrouter, lekin OPENROUTER_API_KEY boʻsh.');
  if (config.AI_PROVIDER === 'anthropic' && !config.ANTHROPIC_API_KEY) fail('AI_PROVIDER=anthropic, lekin ANTHROPIC_API_KEY boʻsh.');
  console.log(`🤖 AI: ${config.AI_PROVIDER === 'openrouter' ? `OpenRouter (${config.OPENROUTER_API_KEYS.length} ta kalit), model ` + config.OPENROUTER_MODEL + (config.OPENROUTER_FALLBACK_MODELS.length ? ` (zaxira: ${config.OPENROUTER_FALLBACK_MODELS.join(', ')})` : '') : 'Claude (Anthropic), model ' + config.ANTHROPIC_MODEL}`);
}
if (!config.ADMIN_IDS.length) console.warn('⚠️  ADMIN_IDS boʻsh: toʻlovlarni tasdiqlovchi admin yoʻq. Botga /id yozib ID ingizni bilib oling.');
if (config.MOCK_AI) console.warn('⚠️  MOCK_AI=1: bot sinov rejimida, haqiqiy AI ishlatilmayapti.');
if (config.DISABLE_PDF) console.warn('ℹ️  DISABLE_PDF=1: faqat .pptx yuboriladi.');
if (config.DEV_AUTH && config.WEBHOOK_URL) fail('DEV_AUTH=1 hostingda yoqilmasin: u mini ilovaga parolsiz kirishga ruxsat beradi. Uni oʻchiring.');

let backend = null;
try {
  backend = createBackend(config);
} catch (e) {
  fail(e.message);
}
if (backend) console.log('🗄️  Ombor: Supabase (balans, profil, buyurtmalar restartda yoʻqolmaydi).');
else console.warn(`ℹ️  Ombor: fayl (${config.DATA_DIR}). Hostingda disk vaqtinchalik boʻlsa, restartda balanslar oʻchadi: SUPABASE_URL va SUPABASE_SERVICE_KEY bering.`);

const store = new Store(config.DATA_DIR, { backend });
const bot = createBot({ store });
const webOn = config.WEBAPP && (config.WEBHOOK_URL || config.WEB_PORT);
const webHandler = webOn ? createWebHandler({ store, bot }) : null;

let server = null;

let webServer = null;

(async () => {
  // Maʼlumotlar oʻqilmasdan hech narsa ishga tushmaydi: boʻsh ombor bilan ishlasak, balanslar ustiga yozib yuborilishi mumkin
  try {
    await store.init();
  } catch (e) {
    fail(hide(e.message));
  }

  // Hosting portni tezda band qilishni kutadi, shuning uchun server eng birinchi ishga tushadi
  if (config.WEBHOOK_URL) {
    const { path } = hooks(config.BOT_TOKEN);
    server = createServer(bot, hooks(config.BOT_TOKEN), webHandler);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.PORT, '0.0.0.0', resolve);
    }).catch((e) => fail('Server ishga tushmadi: ' + e.message));
    console.log(`🌐 Webhook serveri ${config.PORT}-portda; manzil: ${config.WEBHOOK_URL}${path.slice(0, 8)}…`);
  }

  // bot oʻchib qolganda yarim qolgan buyurtmalar uchun pulni qaytarish
  const stuck = store.recoverStuck();
  for (const o of stuck) {
    bot.telegram
      .sendMessage(o.userId, `Bot qayta ishga tushgani sababli #${o.id} buyurtma bajarilmadi. ${fmt(o.price)} balansingizga qaytarildi, qayta buyurtma bering.`)
      .catch(() => {});
  }
  for (const o of stuck.defense || []) {
    bot.telegram
      .sendMessage(o.userId, `Bot qayta ishga tushgani sababli #${o.id} taqdimot uchun himoya savollari tayyorlanmadi. ${fmt(o.defensePrice)} balansingizga qaytarildi, Ilovada qayta urinib koʻring.`)
      .catch(() => {});
  }
  await bot.telegram
    .setMyCommands([
      { command: 'start', description: 'Boshlash' },
      { command: 'cancel', description: 'Bekor qilish' },
      { command: 'id', description: 'ID raqamim' },
    ])
    .catch(() => {});

  // Mini App: menyudagi «Ilova» tugmasi (Telegram faqat https manzilni qabul qiladi)
  if (webOn && /^https:\/\//.test(config.WEBAPP_URL)) {
    await bot.telegram
      .setChatMenuButton({ menuButton: { type: 'web_app', text: 'Ilova', web_app: { url: config.WEBAPP_URL } } })
      .then(() => console.log(`📱 Mini App: ${config.WEBAPP_URL}`))
      .catch((e) => console.warn('Menyu tugmasi oʻrnatilmadi:', hide(e.message)));
  } else if (webOn) {
    console.warn('⚠️  Mini App uchun ochiq https manzil kerak (WEBAPP_URL). Telegram http manzilni qabul qilmaydi.');
  }

  // polling rejimida (kompyuterda) Mini App uchun alohida server
  if (webOn && !config.WEBHOOK_URL) {
    webServer = createWebServer({ store, bot });
    webServer.listen(config.WEB_PORT, () => console.log(`🌐 Mini App serveri: port ${config.WEB_PORT}`));
  }

  if (config.WEBHOOK_URL) {
    try {
      bot.botInfo = await bot.telegram.getMe();
      const { path, secret } = hooks(config.BOT_TOKEN);
      await bot.telegram.setWebhook(config.WEBHOOK_URL + path, { secret_token: secret, max_connections: 5 });
      console.log(`✅ Bot ishga tushdi (webhook): @${bot.botInfo.username}`);
      if (config.KEEP_ALIVE_MIN > 0) {
        startKeepAlive({ url: config.WEBHOOK_URL, everyMs: config.KEEP_ALIVE_MIN * 60 * 1000 });
        console.log(`🏓 Uyquga qarshi: har ${config.KEEP_ALIVE_MIN} daqiqada oʻziga soʻrov yuboriladi.`);
      }
    } catch (e) {
      fail(
        'Webhookni oʻrnatib boʻlmadi: ' + hide(e.message) + (/401|Unauthorized/i.test(e.message) ? '\nBOT_TOKEN notoʻgʻri: @BotFather dan tokenni qayta oling.' : ''),
      );
    }
  } else {
    bot
      .launch(() => console.log(`✅ Bot ishga tushdi: @${bot.botInfo ? bot.botInfo.username : '?'}. Toʻxtatish: Ctrl+C`))
      .catch((e) =>
        fail('Bot ishga tushmadi: ' + hide(e.message) + (/401|Unauthorized/i.test(e.message) ? '\nBOT_TOKEN notoʻgʻri: @BotFather dan tokenni qayta oling.' : '')),
      );
  }
})();

// Oʻchirishdan oldin yozilmay qolgan oʻzgarishlar omborga yoziladi (Render SIGTERM yuboradi va bir oz kutadi)
let closing = false;
async function shutdown(sig) {
  if (closing) return;
  closing = true;
  const done = () => process.exit(0);
  setTimeout(done, 8000).unref();
  try {
    await store.flush();
  } catch (_) {
    /* ignore */
  }
  if (server) server.close();
  if (webServer) webServer.close();
  if (server) return done();
  try {
    bot.stop(sig);
  } catch (_) {
    done();
  }
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
