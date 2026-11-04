const config = require('./config');
const { Store } = require('./store');
const { createBot, fmt } = require('./bot');
const { createServer, hooks } = require('./server');

function fail(msg) {
  console.error('\n❌ ' + msg + '\n');
  process.exit(1);
}
const hide = (s) => String(s).replace(/bot\d+:[\w-]+/g, 'bot***');

if (!config.BOT_TOKEN) fail('BOT_TOKEN topilmadi. .env faylini tekshiring (README ga qarang).');
if (!config.MOCK_AI) {
  if (!config.AI_PROVIDER) fail('AI kaliti topilmadi. .env ga OPENROUTER_API_KEY (yoki ANTHROPIC_API_KEY) yozing. Kalitsiz sinash uchun MOCK_AI=1.');
  if (config.AI_PROVIDER === 'openrouter' && !config.OPENROUTER_API_KEY) fail('AI_PROVIDER=openrouter, lekin OPENROUTER_API_KEY boʻsh.');
  if (config.AI_PROVIDER === 'anthropic' && !config.ANTHROPIC_API_KEY) fail('AI_PROVIDER=anthropic, lekin ANTHROPIC_API_KEY boʻsh.');
  console.log(`🤖 AI: ${config.AI_PROVIDER === 'openrouter' ? 'OpenRouter, model ' + config.OPENROUTER_MODEL : 'Claude (Anthropic), model ' + config.ANTHROPIC_MODEL}`);
}
if (!config.ADMIN_IDS.length) console.warn('⚠️  ADMIN_IDS boʻsh: toʻlovlarni tasdiqlovchi admin yoʻq. Botga /id yozib ID ingizni bilib oling.');
if (config.MOCK_AI) console.warn('⚠️  MOCK_AI=1: bot sinov rejimida, haqiqiy AI ishlatilmayapti.');
if (config.DISABLE_PDF) console.warn('ℹ️  DISABLE_PDF=1: faqat .pptx yuboriladi.');

const store = new Store(config.DATA_DIR);
const bot = createBot({ store });

let server = null;

(async () => {
  // Hosting portni tezda band qilishni kutadi, shuning uchun server eng birinchi ishga tushadi
  if (config.WEBHOOK_URL) {
    const { path } = hooks(config.BOT_TOKEN);
    server = createServer(bot, hooks(config.BOT_TOKEN));
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
  await bot.telegram
    .setMyCommands([
      { command: 'start', description: 'Boshlash' },
      { command: 'cancel', description: 'Bekor qilish' },
      { command: 'id', description: 'ID raqamim' },
    ])
    .catch(() => {});

  if (config.WEBHOOK_URL) {
    try {
      bot.botInfo = await bot.telegram.getMe();
      const { path, secret } = hooks(config.BOT_TOKEN);
      await bot.telegram.setWebhook(config.WEBHOOK_URL + path, { secret_token: secret, max_connections: 5 });
      console.log(`✅ Bot ishga tushdi (webhook): @${bot.botInfo.username}`);
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

function shutdown(sig) {
  if (server) {
    server.close();
    process.exit(0);
  }
  try {
    bot.stop(sig);
  } catch (_) {
    process.exit(0);
  }
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
