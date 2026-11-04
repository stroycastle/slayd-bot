// Telegram bot: buyurtma oqimi, balans, to'lovni admin tasdiqlashi, tahrirlash.
const { Telegraf, Markup } = require('telegraf');
const config = require('./config');
const service = require('./service');
const { PALETTES } = require('./deck');
const { extractText, clip } = require('./extract');

const BTN_NEW = '📊 Yangi taqdimot';
const BTN_EDIT = '✏️ Tahrirlash';
const BTN_BAL = '💰 Balans';
const BTN_HELP = 'ℹ️ Narxlar va yordam';

const LANGS = {
  uz: 'Oʻzbekcha (lotin)',
  uzc: 'Ўзбекча (кирилл)',
  ru: 'Русский',
};
const COLOR_ICON = { green: '🟩', blue: '🟦', red: '🟥', purple: '🟪', orange: '🟧', gray: '⬛' };

const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' soʻm';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const HTML = { parse_mode: 'HTML' };
const isAdmin = (id) => config.ADMIN_IDS.includes(Number(id));

async function defaultDownload(telegram, fileId) {
  const url = await telegram.getFileLink(fileId);
  const res = await fetch(String(url));
  if (!res.ok) throw new Error('Faylni yuklab boʻlmadi');
  return Buffer.from(await res.arrayBuffer());
}

function createBot({ store, download }) {
  const bot = new Telegraf(config.BOT_TOKEN || '000:test', { handlerTimeout: 15 * 60 * 1000 });
  const dl = download || defaultDownload;

  const states = new Map(); // foydalanuvchi -> { step, data, timer }
  const drafts = new Map(); // foydalanuvchi -> tayyor buyurtma loyihasi
  const busy = new Set(); // hozir slayd tayyorlanayotgan foydalanuvchilar

  const menu = Markup.keyboard([[BTN_NEW], [BTN_EDIT, BTN_BAL], [BTN_HELP]]).resize();
  const cancelKb = Markup.inlineKeyboard([[Markup.button.callback('❌ Bekor qilish', 'cancel')]]);
  const setState = (id, step, data) => {
    const old = states.get(id);
    if (old && old.timer) clearTimeout(old.timer);
    states.set(id, { step, data: data || (old && old.data) || {} });
    return states.get(id);
  };
  const clearState = (id) => {
    const old = states.get(id);
    if (old && old.timer) clearTimeout(old.timer);
    states.delete(id);
  };

  const notifyAdmins = (text, extra) =>
    Promise.all(config.ADMIN_IDS.map((id) => bot.telegram.sendMessage(id, text, extra).catch(() => {})));

  // ------------------------------------------------------------ umumiy
  bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    if (ctx.from) store.ensureUser(ctx.from);
    return next();
  });
  bot.catch((err) => console.error('Bot xatosi:', err));

  const flat = config.PRICE_DECK > 0;
  const priceLine = () =>
    flat
      ? `• Taqdimot (${config.MIN_SLIDES}–${config.MAX_SLIDES} slayd, narxi bir xil) — <b>${fmt(config.PRICE_DECK)}</b>`
      : `• 1 ta slayd — <b>${fmt(config.PRICE_SLIDE)}</b>`;
  // Buyurtmadagidan kam slayd chiqsa qaytariladigan pul. Bir xil narxda faqat sezilarli kamlikda (3 va undan ortiq slayd), 100 soʻmgacha yaxlitlanadi.
  const shortfallRefund = (order, finalSlides) => {
    const missing = order.slides - finalSlides;
    if (missing <= 0) return 0;
    if (!flat) return missing * config.PRICE_SLIDE;
    if (missing < 3) return 0;
    return Math.min(order.price, Math.round((order.price * missing) / order.slides / 100) * 100);
  };

  const welcome = () =>
    `Salom! Men talabalar uchun taqdimot (slayd) yasab beraman.\n\n` +
    `${priceLine()}\n` +
    `• Slaydni tahrirlash (oʻzgartirish, gap qoʻshish) — <b>${fmt(config.PRICE_EDIT)}</b>\n\n` +
    `Tilni (oʻzbek lotin/kirill, rus) va rangni oʻzingiz tanlaysiz. Maʼruza matni va adabiyotlaringiz boʻlsa, yuborasiz, men shulardan foydalanaman. ` +
    `Natija .pptx va PDF koʻrinishida keladi.\n\nBoshlash uchun «${BTN_NEW}» tugmasini bosing.`;

  bot.start((ctx) => {
    clearState(ctx.from.id);
    return ctx.reply(welcome(), { ...HTML, ...menu });
  });
  bot.command('id', (ctx) => ctx.reply(`Sizning ID raqamingiz: ${ctx.from.id}`));
  bot.command('cancel', (ctx) => {
    clearState(ctx.from.id);
    drafts.delete(ctx.from.id);
    return ctx.reply('Bekor qilindi.', menu);
  });
  bot.action('cancel', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    clearState(ctx.from.id);
    drafts.delete(ctx.from.id);
    return ctx.reply('Bekor qilindi.', menu);
  });

  bot.hears(BTN_HELP, (ctx) =>
    ctx.reply(
      `<b>Narxlar</b>\n${priceLine()}\n• Tahrir: ${fmt(config.PRICE_EDIT)}\n\n` +
        `<b>Qanday ishlaydi</b>\n1. Balansni toʻldirasiz (kartaga oʻtkazib, chekni yuborasiz).\n2. «${BTN_NEW}» — mavzu, slaydlar soni, til, rang, maʼruza matni.\n3. Taqdimot tayyor boʻlgach .pptx va PDF keladi.\n4. Oʻzgartirish kerak boʻlsa «${BTN_EDIT}».\n\n` +
        `<b>Muhim</b>\nMatnni AI yozadi. Topshirishdan oldin oʻqib chiqing, faktlar va adabiyotlar roʻyxatini tekshiring, kerak boʻlsa oʻz soʻzingiz bilan moslang.`,
      HTML
    )
  );

  // ------------------------------------------------------------ yangi taqdimot
  bot.hears(BTN_NEW, (ctx) => {
    if (busy.has(ctx.from.id)) return ctx.reply('Avvalgi taqdimotingiz hali tayyorlanmoqda. Biroz kuting.');
    setState(ctx.from.id, 'topic', {});
    return ctx.reply('Taqdimot mavzusini yozing.\nMasalan: «Grammatik kategoriya va uning turlari»', cancelKb);
  });

  const slidesKb = Markup.inlineKeyboard([
    [8, 10, 12].map((n) => Markup.button.callback(String(n), `slides:${n}`)),
    [15, 20, 25].map((n) => Markup.button.callback(String(n), `slides:${n}`)),
    [Markup.button.callback('❌ Bekor qilish', 'cancel')],
  ]);
  const askSlides = (ctx) =>
    ctx.reply(`Nechta slayd kerak? Tugmani bosing yoki ${config.MIN_SLIDES}–${config.MAX_SLIDES} oraligʻida raqam yozing.\n${flat ? `Narxi: ${fmt(config.PRICE_DECK)} (slayd soniga bogʻliq emas).` : `Narxi: ${fmt(config.PRICE_SLIDE)} / slayd.`}`, slidesKb);

  const askLang = (ctx) =>
    ctx.reply(
      'Qaysi tilda yozay?',
      Markup.inlineKeyboard([
        ...Object.entries(LANGS).map(([k, v]) => [Markup.button.callback(v, `lang:${k}`)]),
        [Markup.button.callback('❌ Bekor qilish', 'cancel')],
      ])
    );

  const askColor = (ctx) => {
    const btns = Object.entries(PALETTES).map(([k, p]) => Markup.button.callback(`${COLOR_ICON[k]} ${p.label}`, `color:${k}`));
    return ctx.reply('Qaysi rangda boʻlsin?', Markup.inlineKeyboard([btns.slice(0, 3), btns.slice(3), [Markup.button.callback('❌ Bekor qilish', 'cancel')]]));
  };

  const doneKb = (prefix) =>
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Tayyor', `${prefix}:done`), Markup.button.callback('Oʻtkazib yuborish', `${prefix}:skip`)],
      [Markup.button.callback('❌ Bekor qilish', 'cancel')],
    ]);

  const askLecture = (ctx) =>
    ctx.reply(
      'Maʼruza matni bormi? Matn yoki fayl (.docx, .pdf, .txt) yuboring. Uzun matn bir necha xabarga boʻlinsa ham boʻladi. Hammasini yuborib boʻlgach «Tayyor» ni bosing.\nYoʻq boʻlsa, «Oʻtkazib yuborish».',
      doneKb('lec')
    );
  const askRefs = (ctx) =>
    ctx.reply(
      'Foydalanilgan adabiyotlar roʻyxati bormi? Matn yoki fayl yuboring, «Tayyor» ni bosing.\nYoʻq boʻlsa, «Oʻtkazib yuborish»: u holda faqat aniq mavjud, mashhur manbalar qoʻshiladi.',
      doneKb('ref')
    );

  function profileMissing(p) {
    return ['fullName', 'group', 'university', 'faculty'].find((k) => !p || !p[k]);
  }
  const PROFILE_Q = {
    fullName: ['p_name', 'Titul varagʻi uchun ism va familiyangizni yozing.'],
    group: ['p_group', 'Guruh raqamingiz?'],
    university: ['p_uni', 'Universitet nomi? (masalan: OʻzDJTU)'],
    faculty: ['p_fac', 'Fakultet nomi?'],
  };
  const askProfile = (ctx, key) => {
    setState(ctx.from.id, PROFILE_Q[key][0]);
    return ctx.reply(PROFILE_Q[key][1], cancelKb);
  };
  const afterRefs = (ctx) => {
    const user = store.getUser(ctx.from.id);
    const miss = profileMissing(user.profile);
    if (miss) return askProfile(ctx, miss);
    return showConfirm(ctx);
  };

  function showConfirm(ctx) {
    const id = ctx.from.id;
    const st = states.get(id);
    const d = (st && st.data) || drafts.get(id);
    if (!d) return ctx.reply('Buyurtma topilmadi. Qaytadan boshlang.', menu);
    drafts.set(id, d);
    setState(id, 'confirm', d);
    const user = store.getUser(id);
    const p = user.profile || {};
    const price = config.deckPrice(d.slides);
    const text =
      `<b>Buyurtmani tekshiring</b>\n\n` +
      `Mavzu: ${esc(d.topic)}\n` +
      `Slaydlar: ${d.slides}\n` +
      `Til: ${LANGS[d.lang]}\n` +
      `Rang: ${PALETTES[d.color].label}\n` +
      `Maʼruza matni: ${d.lecture ? `bor (${d.lecture.length} belgi)` : 'yoʻq'}\n` +
      `Adabiyotlar: ${d.references ? 'sizniki' : 'avtomatik'}\n` +
      `Titul: ${esc([p.fullName, p.group, p.university, p.faculty].filter(Boolean).join(', '))}\n\n` +
      `Narxi: <b>${fmt(price)}</b>\nBalansingiz: ${fmt(user.balance)}`;
    return ctx.reply(
      text,
      {
        ...HTML,
        ...Markup.inlineKeyboard([
          [Markup.button.callback(`✅ Tasdiqlash — ${fmt(price)}`, 'order:go')],
          [Markup.button.callback('👤 Titul maʼlumotlari', 'profile:edit')],
          [Markup.button.callback('❌ Bekor qilish', 'cancel')],
        ]),
      }
    );
  }

  bot.action(/^slides:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const st = states.get(ctx.from.id);
    if (!st || st.step !== 'slides') return;
    st.data.slides = Number(ctx.match[1]);
    setState(ctx.from.id, 'lang');
    return askLang(ctx);
  });
  bot.action(/^lang:(uz|uzc|ru)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const st = states.get(ctx.from.id);
    if (!st || st.step !== 'lang') return;
    st.data.lang = ctx.match[1];
    setState(ctx.from.id, 'color');
    return askColor(ctx);
  });
  bot.action(/^color:(\w+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const st = states.get(ctx.from.id);
    if (!st || st.step !== 'color' || !PALETTES[ctx.match[1]]) return;
    st.data.color = ctx.match[1];
    st.data.lecture = '';
    setState(ctx.from.id, 'lecture');
    return askLecture(ctx);
  });
  bot.action(/^lec:(done|skip)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const st = states.get(ctx.from.id);
    if (!st || st.step !== 'lecture') return;
    if (ctx.match[1] === 'skip') st.data.lecture = '';
    st.data.references = '';
    setState(ctx.from.id, 'refs');
    return askRefs(ctx);
  });
  bot.action(/^ref:(done|skip)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const st = states.get(ctx.from.id);
    if (!st || st.step !== 'refs') return;
    if (ctx.match[1] === 'skip') st.data.references = '';
    return afterRefs(ctx);
  });
  bot.action('profile:edit', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const id = ctx.from.id;
    const d = (states.get(id) || {}).data || drafts.get(id);
    if (!d) return;
    drafts.set(id, d);
    store.setProfile(id, { fullName: '', group: '', university: '', faculty: '' });
    setState(id, 'p_name', d);
    return askProfile(ctx, 'fullName');
  });

  // ------------------------------------------------------------ buyurtmani boshlash
  bot.action('order:retry', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const d = drafts.get(ctx.from.id);
    if (!d) return ctx.reply('Buyurtma topilmadi. «' + BTN_NEW + '» tugmasidan boshlang.', menu);
    setState(ctx.from.id, 'confirm', d);
    return showConfirm(ctx);
  });

  bot.action('order:go', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const id = ctx.from.id;
    const d = drafts.get(id);
    if (!d) return ctx.reply('Buyurtma topilmadi. «' + BTN_NEW + '» tugmasidan boshlang.', menu);
    if (busy.has(id)) return ctx.reply('Avvalgi taqdimotingiz hali tayyorlanmoqda.');
    const price = config.deckPrice(d.slides);
    if (!store.charge(id, price, `Taqdimot: ${d.topic.slice(0, 40)}`)) {
      const need = price - store.getUser(id).balance;
      return ctx.reply(
        `Balansingizda mablagʻ yetarli emas. Yana <b>${fmt(need)}</b> kerak.`,
        {
          ...HTML,
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💰 Balans toʻldirish', 'topup:start')],
            [Markup.button.callback('🔄 Toʻldirgach davom etish', 'order:retry')],
          ]),
        }
      );
    }
    const order = store.addOrder({ userId: id, type: 'deck', topic: d.topic, slides: d.slides, lang: d.lang, color: d.color, price, hasLecture: !!d.lecture });
    clearState(id);
    drafts.delete(id);
    await ctx.reply(`⏳ Taqdimot tayyorlanmoqda (buyurtma #${order.id}). Odatda 1–3 daqiqa ketadi. Tayyor boʻlgach shu yerga yuboraman.`, menu);
    runDeck(ctx.chat.id, id, order, d); // fon rejimida
  });

  async function sendFiles(chatId, base, res) {
    await bot.telegram.sendDocument(chatId, { source: res.pptx, filename: `${base}.pptx` });
    if (res.pdf) await bot.telegram.sendDocument(chatId, { source: res.pdf, filename: `${base}.pdf` });
  }

  async function withTyping(chatId, fn) {
    const t = setInterval(() => bot.telegram.sendChatAction(chatId, 'upload_document').catch(() => {}), 4500);
    t.unref && t.unref();
    try {
      return await fn();
    } finally {
      clearInterval(t);
    }
  }

  async function runDeck(chatId, userId, order, d) {
    busy.add(userId);
    try {
      const profile = (store.getUser(userId) || {}).profile || {};
      const res = await withTyping(chatId, () =>
        service.createDeck({ topic: d.topic, slides: d.slides, lang: d.lang, color: d.color, lecture: d.lecture, references: d.references, profile })
      );
      // kamroq slayd chiqsa, farqi qaytariladi
      let refund = 0;
      if (res.finalSlides < order.slides) {
        refund = shortfallRefund(order, res.finalSlides);
        store.refund(userId, refund, `Slayd kam chiqdi: buyurtma #${order.id}`);
      }
      store.updateOrder(order.id, { status: 'done', deck: res.deck, finalSlides: res.finalSlides, price: order.price - refund });
      await sendFiles(chatId, service.fileBase(d.topic), res);
      let msg = `✅ Tayyor! ${res.finalSlides} ta slayd.`;
      if (refund) msg += ` Slayd soni kamroq chiqqani uchun ${fmt(refund)} balansingizga qaytarildi.`;
      msg += `\n\nTopshirishdan oldin matn va adabiyotlar roʻyxatini oʻqib, tekshirib chiqing.\nOʻzgartirish kerak boʻlsa «${BTN_EDIT}» (${fmt(config.PRICE_EDIT)}).`;
      await bot.telegram.sendMessage(chatId, msg, menu);
    } catch (e) {
      console.error('Taqdimot xatosi:', e);
      store.updateOrder(order.id, { status: 'failed', error: String(e.message || e).slice(0, 300) });
      store.refund(userId, order.price, `Xatolik: buyurtma #${order.id}`);
      await bot.telegram
        .sendMessage(chatId, `Kechirasiz, taqdimotni tayyorlashda xatolik chiqdi. ${fmt(order.price)} balansingizga qaytarildi. Birozdan keyin qayta urinib koʻring.`, menu)
        .catch(() => {});
      notifyAdmins(`❗ Buyurtma #${order.id} xatolik: ${String(e.message || e).slice(0, 300)}`);
    } finally {
      busy.delete(userId);
    }
  }

  // ------------------------------------------------------------ tahrirlash
  bot.hears(BTN_EDIT, (ctx) => {
    const orders = store.userOrders(ctx.from.id, 5);
    if (!orders.length) return ctx.reply(`Hali taqdimotingiz yoʻq. Avval «${BTN_NEW}» orqali yasang.`);
    clearState(ctx.from.id);
    return ctx.reply(
      'Qaysi taqdimotni tahrirlaymiz?',
      Markup.inlineKeyboard([
        ...orders.map((o) => [Markup.button.callback(`#${o.id} · ${o.topic.slice(0, 40)} (${o.finalSlides || o.slides} slayd)`, `edit:pick:${o.id}`)]),
        [Markup.button.callback('❌ Bekor qilish', 'cancel')],
      ])
    );
  });

  bot.action(/^edit:pick:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const o = store.getOrder(ctx.match[1]);
    if (!o || o.userId !== ctx.from.id || !o.deck) return ctx.reply('Buyurtma topilmadi.');
    setState(ctx.from.id, 'edit_text', { orderId: o.id });
    return ctx.reply(
      `Nimani oʻzgartirish kerak? Masalan:\n• «3-slayddagi taʼrifni qisqartiring»\n• «5-slaydga ikkita gap qoʻshing»\n• «Xulosani soddaroq yozing»\n\nSlayd raqamlari fayldagi raqamlarga mos (1-slayd — titul).\nNarxi: ${fmt(config.PRICE_EDIT)}. Hech narsa oʻzgarmasa, pul qaytariladi.`,
      cancelKb
    );
  });

  async function runEdit(chatId, userId, edit, parent, instruction) {
    busy.add(userId);
    try {
      const profile = (store.getUser(userId) || {}).profile || {};
      const res = await withTyping(chatId, () =>
        service.editDeck({ deck: parent.deck, instruction, lang: parent.lang, color: parent.color, profile })
      );
      if (!res.changed) {
        store.updateOrder(edit.id, { status: 'failed', error: 'oʻzgarish yoʻq' });
        store.refund(userId, edit.price, `Tahrir qaytarildi #${edit.id}`);
        return bot.telegram.sendMessage(chatId, `${res.reply || 'Oʻzgarish kiritilmadi.'}\n\n${fmt(edit.price)} balansingizga qaytarildi. Soʻrovni aniqroq yozib, qayta urinib koʻring.`, menu);
      }
      store.updateOrder(parent.id, { deck: res.deck });
      store.updateOrder(edit.id, { status: 'done' });
      await sendFiles(chatId, service.fileBase(parent.topic), res);
      await bot.telegram.sendMessage(chatId, `✅ ${res.reply || 'Tahrir kiritildi.'}`, menu);
    } catch (e) {
      console.error('Tahrir xatosi:', e);
      store.updateOrder(edit.id, { status: 'failed', error: String(e.message || e).slice(0, 300) });
      store.refund(userId, edit.price, `Xatolik: tahrir #${edit.id}`);
      await bot.telegram.sendMessage(chatId, `Tahrirda xatolik chiqdi. ${fmt(edit.price)} balansingizga qaytarildi. Qayta urinib koʻring.`, menu).catch(() => {});
      notifyAdmins(`❗ Tahrir #${edit.id} xatolik: ${String(e.message || e).slice(0, 300)}`);
    } finally {
      busy.delete(userId);
    }
  }

  // ------------------------------------------------------------ balans va to'lov
  const showBalance = (ctx) =>
    ctx.reply(`Balansingiz: <b>${fmt(store.getUser(ctx.from.id).balance)}</b>`, {
      ...HTML,
      ...Markup.inlineKeyboard([[Markup.button.callback('➕ Balans toʻldirish', 'topup:start')]]),
    });
  bot.hears(BTN_BAL, (ctx) => showBalance(ctx));

  bot.action('topup:start', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    setState(ctx.from.id, 'topup_amount', {});
    return ctx.reply(
      `Qancha pul tashlaysiz? Summani raqam bilan yozing (kamida ${fmt(config.MIN_TOPUP)}) yoki tugmani bosing.`,
      Markup.inlineKeyboard([
        [30000, 60000, 100000].map((n) => Markup.button.callback(fmt(n), `topup:amt:${n}`)),
        [Markup.button.callback('❌ Bekor qilish', 'cancel')],
      ])
    );
  });
  bot.action(/^topup:amt:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    return startReceipt(ctx, Number(ctx.match[1]));
  });

  function startReceipt(ctx, amount) {
    if (amount < config.MIN_TOPUP || amount > 5000000) return ctx.reply(`Summa ${fmt(config.MIN_TOPUP)} dan 5 000 000 soʻmgacha boʻlishi kerak.`);
    const pay = store.addPayment({ userId: ctx.from.id, amount });
    setState(ctx.from.id, 'topup_receipt', { paymentId: pay.id });
    return ctx.reply(
      `Quyidagi kartaga <b>${fmt(amount)}</b> oʻtkazing:\n\n💳 <code>${esc(config.CARD_NUMBER)}</code>\n👤 ${esc(config.CARD_HOLDER)}\n\nOʻtkazgach, <b>chek (skrinshot)</b> rasmini shu yerga yuboring. Tekshirilgach balansingiz toʻldiriladi.`,
      { ...HTML, ...cancelKb }
    );
  }

  async function receiptReceived(ctx, kind, fileId) {
    const st = states.get(ctx.from.id);
    if (!st || st.step !== 'topup_receipt') return false;
    const pay = store.getPayment(st.data.paymentId);
    if (!pay || pay.status !== 'waiting_receipt') return false;
    store.updatePayment(pay.id, { status: 'pending', fileId, kind });
    clearState(ctx.from.id);
    const u = store.getUser(ctx.from.id);
    const caption = `💳 To'lov #${pay.id}\nFoydalanuvchi: ${u.name || ''} ${u.username ? '@' + u.username : ''} (ID ${u.id})\nSumma: ${fmt(pay.amount)}`;
    const kb = Markup.inlineKeyboard([[Markup.button.callback('✅ Tasdiqlash', `pay:ok:${pay.id}`), Markup.button.callback('❌ Rad etish', `pay:no:${pay.id}`)]]);
    if (!config.ADMIN_IDS.length) console.warn('ADMIN_IDS sozlanmagan: toʻlovni tasdiqlovchi yoʻq!');
    for (const adminId of config.ADMIN_IDS) {
      try {
        if (kind === 'photo') await bot.telegram.sendPhoto(adminId, fileId, { caption, ...kb });
        else await bot.telegram.sendDocument(adminId, fileId, { caption, ...kb });
      } catch (e) {
        console.error('Adminga yuborib boʻlmadi:', adminId, e.message);
      }
    }
    await ctx.reply('Chek qabul qilindi. Tekshirilgach balansingiz toʻldiriladi, xabar beraman.', menu);
    return true;
  }

  bot.on('photo', async (ctx) => {
    const photos = ctx.message.photo;
    const handled = await receiptReceived(ctx, 'photo', photos[photos.length - 1].file_id);
    if (!handled) return ctx.reply(`Rasm kerak emas. Menyudan tanlang 👇`, menu);
  });

  bot.action(/^pay:(ok|no):(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Ruxsat yoʻq').catch(() => {});
    const ok = ctx.match[1] === 'ok';
    const pay = ok ? store.approvePayment(ctx.match[2], ctx.from.id) : store.rejectPayment(ctx.match[2], ctx.from.id);
    if (!pay) return ctx.answerCbQuery('Bu toʻlov allaqachon koʻrib chiqilgan').catch(() => {});
    await ctx.answerCbQuery(ok ? 'Tasdiqlandi' : 'Rad etildi').catch(() => {});
    try {
      const old = (ctx.callbackQuery.message && (ctx.callbackQuery.message.caption || ctx.callbackQuery.message.text)) || '';
      await ctx.editMessageCaption(`${old}\n\n${ok ? '✅ Tasdiqlandi' : '❌ Rad etildi'} (admin ${ctx.from.id})`);
    } catch (e) {
      /* xabarni yangilab boʻlmasa, muhim emas */
    }
    const u = store.getUser(pay.userId);
    const msg = ok
      ? `✅ Balansingiz ${fmt(pay.amount)} ga toʻldirildi. Hozirgi balans: <b>${fmt(u.balance)}</b>.`
      : `❌ #${pay.id} toʻlov tasdiqlanmadi. Chek notoʻgʻri boʻlsa, qayta yuboring yoki adminga murojaat qiling.`;
    bot.telegram.sendMessage(pay.userId, msg, { ...HTML, ...menu }).catch(() => {});
  });

  // ------------------------------------------------------------ admin buyruqlari
  bot.command('stat', (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const s = store.stats();
    return ctx.reply(
      `Foydalanuvchilar: ${s.users}\nTaqdimotlar: ${s.decks}\nTahrirlar: ${s.edits}\nTushum (xarajat qilingan): ${fmt(s.revenue)}\nTasdiqlangan toʻldirishlar: ${fmt(s.topups)}\nBalanslardagi qoldiq: ${fmt(s.balances)}\nTasdiq kutayotgan toʻlovlar: ${s.pending}`
    );
  });
  bot.command('qosh', (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const [, uid, amount] = ctx.message.text.trim().split(/\s+/);
    const sum = parseInt(amount, 10);
    if (!store.getUser(uid) || !(sum > 0)) return ctx.reply('Format: /qosh <foydalanuvchi_id> <summa>');
    store.credit(Number(uid), sum, `Admin ${ctx.from.id} qoʻshdi`);
    bot.telegram.sendMessage(Number(uid), `✅ Balansingizga ${fmt(sum)} qoʻshildi. Hozirgi balans: ${fmt(store.getUser(uid).balance)}.`).catch(() => {});
    return ctx.reply(`Qoʻshildi. Yangi balans: ${fmt(store.getUser(uid).balance)}`);
  });

  // ------------------------------------------------------------ fayllar (maʼruza / adabiyot)
  bot.on('document', async (ctx) => {
    const st = states.get(ctx.from.id);
    const doc = ctx.message.document;
    if (st && st.step === 'topup_receipt') {
      const handled = await receiptReceived(ctx, 'document', doc.file_id);
      if (handled) return;
    }
    if (!st || (st.step !== 'lecture' && st.step !== 'refs')) return ctx.reply('Menyudan tanlang 👇', menu);
    if (doc.file_size && doc.file_size > 15 * 1024 * 1024) return ctx.reply('Fayl juda katta (15 MB dan oshmasin).');
    try {
      const buf = await dl(bot.telegram, doc.file_id);
      const text = await extractText(buf, doc.file_name);
      if (!text) return ctx.reply('Fayldan matn topilmadi (skaner qilingan rasm boʻlishi mumkin).');
      appendText(ctx, st, text);
    } catch (e) {
      return ctx.reply(e.message || 'Faylni oʻqib boʻlmadi.');
    }
  });

  function appendText(ctx, st, text) {
    const key = st.step === 'lecture' ? 'lecture' : 'references';
    const joined = ((st.data[key] || '') + '\n\n' + text).trim();
    const { text: clipped, clipped: wasClipped } = clip(joined);
    st.data[key] = clipped;
    if (st.timer) clearTimeout(st.timer);
    st.timer = setTimeout(() => {
      ctx.reply(`✅ Qabul qilindi (${st.data[key].length} belgi)${wasClipped ? ', juda uzun boʻlgani uchun boshidan qismi olindi' : ''}. Yana yuborishingiz yoki «Tayyor» ni bosishingiz mumkin.`).catch(() => {});
    }, 1200);
    if (st.timer.unref) st.timer.unref();
  }

  // ------------------------------------------------------------ matnli xabarlar
  bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;
    const id = ctx.from.id;
    const st = states.get(id);
    if (!st) return ctx.reply('Menyudan tanlang 👇', menu);

    switch (st.step) {
      case 'topic':
        if (text.length < 3 || text.length > 300) return ctx.reply('Mavzu 3 dan 300 belgigacha boʻlishi kerak. Qayta yozing.');
        st.data.topic = text;
        setState(id, 'slides');
        return askSlides(ctx);
      case 'slides': {
        const n = parseInt(text, 10);
        if (!(n >= config.MIN_SLIDES && n <= config.MAX_SLIDES)) return ctx.reply(`Slaydlar soni ${config.MIN_SLIDES} dan ${config.MAX_SLIDES} gacha boʻlishi kerak.`);
        st.data.slides = n;
        setState(id, 'lang');
        return askLang(ctx);
      }
      case 'lecture':
      case 'refs':
        return appendText(ctx, st, text);
      case 'p_name':
      case 'p_group':
      case 'p_uni':
      case 'p_fac': {
        if (text.length > 120) return ctx.reply('Juda uzun. Qisqaroq yozing.');
        const key = { p_name: 'fullName', p_group: 'group', p_uni: 'university', p_fac: 'faculty' }[st.step];
        store.setProfile(id, { [key]: text });
        const miss = profileMissing(store.getUser(id).profile);
        if (miss) return askProfile(ctx, miss);
        return showConfirm(ctx);
      }
      case 'topup_amount': {
        const n = parseInt(text.replace(/[^\d]/g, ''), 10);
        if (!n) return ctx.reply('Summani raqam bilan yozing, masalan: 60000');
        return startReceipt(ctx, n);
      }
      case 'topup_receipt':
        return ctx.reply('Chek rasmini (skrinshot) yuboring. Bekor qilish uchun /cancel.');
      case 'edit_text': {
        if (busy.has(id)) return ctx.reply('Avvalgi buyurtmangiz hali tayyorlanmoqda.');
        if (text.length < 5 || text.length > 1500) return ctx.reply('Nimani oʻzgartirish kerakligini batafsilroq yozing (5–1500 belgi).');
        const parent = store.getOrder(st.data.orderId);
        if (!parent || !parent.deck) return ctx.reply('Buyurtma topilmadi.');
        if (!store.charge(id, config.PRICE_EDIT, `Tahrir #${parent.id}`)) {
          const need = config.PRICE_EDIT - store.getUser(id).balance;
          return ctx.reply(`Balansingizda mablagʻ yetarli emas. Yana ${fmt(need)} kerak. Balansni toʻldirib, soʻrovni qayta yuboring.`, Markup.inlineKeyboard([[Markup.button.callback('💰 Balans toʻldirish', 'topup:start')]]));
        }
        const edit = store.addOrder({ userId: id, type: 'edit', parentId: parent.id, price: config.PRICE_EDIT, instruction: text.slice(0, 300) });
        clearState(id);
        await ctx.reply('⏳ Tahrir qilinmoqda...', menu);
        runEdit(ctx.chat.id, id, edit, parent, text);
        return;
      }
      default:
        return ctx.reply('Menyudan tanlang 👇', menu);
    }
  });

  bot._internals = { states, drafts, busy, runDeck, runEdit };
  return bot;
}

module.exports = { createBot, fmt };
