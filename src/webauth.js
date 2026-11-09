// Telegram Mini App "initData" imzosini tekshirish.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
const crypto = require('crypto');

function dataCheckString(params) {
  return [...params.entries()]
    .filter(([k]) => k !== 'hash')
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

function hmacHex(botToken, params) {
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  return crypto.createHmac('sha256', secret).update(dataCheckString(params)).digest('hex');
}

/** Toʻgʻri boʻlsa Telegram user obyektini, aks holda null qaytaradi. */
function verifyInitData(initData, botToken, { maxAgeSec = 86400, now = Date.now() } = {}) {
  try {
    if (!initData || !botToken || initData.length > 4096) return null;
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null;
    const calc = hmacHex(botToken, params);
    if (!crypto.timingSafeEqual(Buffer.from(calc, 'hex'), Buffer.from(hash.toLowerCase(), 'hex'))) return null;
    const authDate = Number(params.get('auth_date'));
    if (!Number.isFinite(authDate)) return null;
    const age = now / 1000 - authDate;
    if (age > maxAgeSec || age < -300) return null;
    const user = JSON.parse(params.get('user') || 'null');
    if (!user || !Number.isInteger(user.id)) return null;
    return user;
  } catch (e) {
    return null;
  }
}

/** Faqat testlar uchun: imzolangan initData yasaydi. */
function signInitData(fields, botToken) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) params.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  params.set('hash', hmacHex(botToken, params));
  return params.toString();
}

module.exports = { verifyInitData, signInitData };
