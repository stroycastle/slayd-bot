// Referal: taklif havolasi va ulashish matni (bot va Mini App uchun umumiy).
const config = require('./config');

/** Bot nomi: Telegramdan olingani (bot.botInfo) boʻlsa shu, boʻlmasa sozlamadagi. */
const username = (botInfo) => (botInfo && botInfo.username) || config.BOT_USERNAME;

/** https://t.me/<bot>?start=ref_<id> — shu havola orqali kirgan yangi foydalanuvchi taklif qilgan odamga bogʻlanadi. */
const link = (botInfo, userId) => `https://t.me/${username(botInfo)}?start=ref_${userId}`;

const shareText = () => 'Talabalar uchun AI taqdimot (slayd) boti: .pptx va PDF tayyor holda keladi. Mana havola:';

/** Telegramning "ulashish" oynasini ochuvchi havola. */
const shareUrl = (botInfo, userId) => `https://t.me/share/url?url=${encodeURIComponent(link(botInfo, userId))}&text=${encodeURIComponent(shareText())}`;

/** /start matnidan taklif qiluvchi ID sini oladi: "/start ref_123" → 123, boshqa holda null. */
const parseStart = (text) => {
  const m = String(text || '').trim().match(/^\/start(?:@\w+)?\s+ref_(\d{1,15})$/);
  return m ? Number(m[1]) : null;
};

module.exports = { link, shareText, shareUrl, parseStart };
