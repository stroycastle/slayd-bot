// Buyurtmani yulduzcha (1–5) bilan baholash: bot tugmalari va xabarlar.
const { Markup } = require('telegraf');

const stars = (n) => '⭐'.repeat(n);
const PROMPT = '⭐ Natija qanday chiqdi? Baho bering. Bu sifatni yaxshilashga yordam beradi.';

/** 1–5 tugmalari (bir qatorda). Callback: rate:<buyurtma>:<yulduz> */
const keyboard = (orderId) => Markup.inlineKeyboard([[1, 2, 3, 4, 5].map((n) => Markup.button.callback(`${n}⭐`, `rate:${orderId}:${n}`))]);

/** Baho tugmalari bilan xabar yuboradi (xato boʻlsa, jim). */
const prompt = (bot, chatId, orderId) => bot.telegram.sendMessage(chatId, PROMPT, keyboard(orderId)).catch(() => {});

const thanks = (n) =>
  n >= 4 ? `Rahmat! Bahoyingiz: ${stars(n)}`
    : n === 3 ? `Rahmat! Bahoyingiz: ${stars(n)}\nNimani yaxshilash kerakligini /murojaat bilan yozsangiz, qoʻshimcha yordam beramiz.`
      : `Rahmat! Bahoyingiz: ${stars(n)}\nYoqmaganiga afsusdamiz. Nima boʻlganini /murojaat bilan yozing, tuzatamiz.`;

/** Past baho haqida adminga xabar (HTML emas, oddiy matn). */
const lowNotice = (o, user, n) =>
  `⭐ Past baho: ${stars(n)}\nBuyurtma #${o.id}${o.type === 'edit' ? ' (tahrir)' : ''}: «${String(o.topic || '').slice(0, 80)}»\nTil: ${o.lang || '—'} · koʻrinish: ${o.style || '—'}\nFoydalanuvchi: ${(user && user.name) || '—'}${user && user.username ? ' @' + user.username : ''} (ID ${o.userId})`;

module.exports = { stars, PROMPT, keyboard, prompt, thanks, lowNotice };
