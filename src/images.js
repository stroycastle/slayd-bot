// Slaydlar uchun rasm topish: avval Vikipediya (Wikimedia Commons, kalitsiz), topilmasa Pexels (PEXELS_API_KEY boʻlsa).
// Har qanday xatoda jim ishdan chiqadi: rasm topilmasa slayd rasmsiz (matnli) chiqadi, buyurtma bajariluvchi boʻlib qoladi.
//
// Xavfsizlik: rasm manzillari tashqi APIdan keladi, shuning uchun faqat https va roʻyxatdagi hostlardan yuklanadi
// (SSRFdan himoya), yoʻnaltirishlar qoʻlda kuzatiladi, hajm va oʻlcham chegaralangan, fayl turi baytlardan tekshiriladi.
// Litsenziya: faqat CC0 / CC BY / CC BY-SA / public domain. NC va ND (oʻzgartirish taqiqlangan) rad etiladi.
const config = require('./config');

const UA = 'SlaydBot/1.0 (Telegram presentation bot)';
const HOSTS = new Set(['upload.wikimedia.org', 'images.pexels.com']);
const MIN_W = 600; // yuklangan rasmning minimal oʻlchami (px)
const MIN_H = 380;
const MAX_DIM = 7000;
const TARGET_ASPECT = 1.46; // slayddagi rasm oynasining nisbati (kenglik/balandlik)
const CACHE_ITEMS = 60;
const CACHE_BYTES = 24 * 1024 * 1024;

// Sarlavhasida shular boʻlgan fayllar slaydga yaramaydi (logotip, belgi, skrinshot, skan va h.k.)
const TITLE_BLOCK = /logo|icon|signature|wordmark|emblem|coat[ _]of[ _]arms|screenshot|stamp|banknote|poster|\bcover\b|scan|diagram|chart|graph|infographic|clipart|template|sprite|button|badge/i;

const squash = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

// ---------------------------------------------------------------- tekshiruvlar
/** Rasm manzili xavfsizmi: https, roʻyxatdagi host, standart port, login/parolsiz. */
function allowedUrl(u) {
  try {
    const x = new URL(String(u));
    return x.protocol === 'https:' && HOSTS.has(x.hostname) && !x.username && !x.password && (x.port === '' || x.port === '443');
  } catch {
    return false;
  }
}

/** Litsenziya qisqa nomi slaydda erkin ishlatishga yaraydimi. */
function licenseOk(name) {
  const l = String(name || '').toLowerCase().trim();
  if (!l) return false;
  if (/\b(nc|nd)\b|non-?commercial|no[ -]?deriv|fair[ -]?use|non-?free|all rights reserved|copyrighted|gfdl|gnu/.test(l)) return false;
  return /^(cc0|cc[ -]by|public domain|pd\b|attribution|no restrictions)/.test(l);
}

/** Qidiruv soʻrovini tozalaydi (operatorlar va belgilar olib tashlanadi). Juda qisqa boʻlsa ''. */
function cleanQuery(q) {
  const t = String(q == null ? '' : q)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^(AND|OR|NOT)$/.test(w))
    .join(' ')
    .slice(0, 70)
    .trim();
  return t.length >= 3 ? t : '';
}

/** Taqdimot JSONida saqlanadigan rasm maʼlumoti haqiqiymi. */
function validImage(img) {
  return !!(img && typeof img === 'object' && allowedUrl(img.url) && Number.isInteger(img.w) && Number.isInteger(img.h) && img.w > 0 && img.h > 0 && typeof img.credit === 'string');
}

/** JPEG/PNG baytlaridan turi va oʻlchamini oʻqiydi; boshqa format yoki buzuq fayl uchun null. */
function imageInfo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 24) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
    return { mime: 'image/png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const m = buf[i + 1];
      if (m === 0xff) {
        i++;
        continue;
      }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { mime: 'image/jpeg', h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      if (len < 2) return null;
      i += 2 + len;
    }
  }
  return null;
}

// ---------------------------------------------------------------- tarmoq
async function getJson(url, headers = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.IMAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'application/json', ...headers } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(res, max) {
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > max) {
        reader.cancel().catch(() => {});
        throw new Error('rasm juda katta');
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, n);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > max) throw new Error('rasm juda katta');
  return buf;
}

/** Rasm baytlarini yuklaydi. Har bir yoʻnaltirishdan keyin manzil yana tekshiriladi. */
async function getImageBytes(url) {
  let cur = url;
  for (let hop = 0; hop < 3; hop++) {
    if (!allowedUrl(cur)) throw new Error('ruxsat etilmagan manzil');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), config.IMAGE_TIMEOUT_MS);
    try {
      const res = await fetch(cur, { signal: ctrl.signal, redirect: 'manual', headers: { 'User-Agent': UA, Accept: 'image/jpeg,image/png;q=0.9,*/*;q=0.1' } });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers && res.headers.get ? res.headers.get('location') : '';
        if (!loc) throw new Error('yoʻnaltirish manzili yoʻq');
        cur = new URL(loc, cur).toString();
        continue;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const len = Number((res.headers && res.headers.get && res.headers.get('content-length')) || 0);
      if (len > config.IMAGE_MAX_BYTES) throw new Error('rasm juda katta');
      return await readCapped(res, config.IMAGE_MAX_BYTES);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('juda koʻp yoʻnaltirish');
}

const withTimeout = (p, ms) => {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('vaqt tugadi')), ms); t.unref && t.unref(); })]).finally(() => clearTimeout(t));
};

async function mapLimit(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// ---------------------------------------------------------------- kesh (xotirada, qisqa umrli)
const BYTES = new Map(); // url -> { buf, mime, w, h }
let bytesTotal = 0;
const FOUND = new Map(); // soʻrov -> natija (url, credit, ...)

function cacheBytes(url, e) {
  if (BYTES.has(url)) bytesTotal -= BYTES.get(url).buf.length;
  BYTES.delete(url);
  BYTES.set(url, e);
  bytesTotal += e.buf.length;
  while (BYTES.size > CACHE_ITEMS || bytesTotal > CACHE_BYTES) {
    const k = BYTES.keys().next().value;
    bytesTotal -= BYTES.get(k).buf.length;
    BYTES.delete(k);
  }
}

function cacheFound(q, r) {
  FOUND.delete(q);
  FOUND.set(q, r);
  while (FOUND.size > CACHE_ITEMS) FOUND.delete(FOUND.keys().next().value);
}

function clearCache() {
  BYTES.clear();
  FOUND.clear();
  bytesTotal = 0;
}

// ---------------------------------------------------------------- manbalar
const htmlText = (s) =>
  squash(
    String(s == null ? '' : s)
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&#x27;|&apos;/g, "'")
      .replace(/&amp;/g, '&'),
    200
  );

const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/** Wikimedia Commons: soʻrov boʻyicha mos rasmlar (eng mosi birinchi). */
async function searchCommons(query) {
  const p = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: `${query} filetype:bitmap`,
    gsrlimit: '12',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '1000',
    iiextmetadatafilter: 'LicenseShortName|Artist',
  });
  const j = await getJson(`${config.COMMONS_API_URL}?${p}`);
  const raw = j && j.query && j.query.pages;
  const pages = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : [];
  const out = [];
  for (const pg of pages) {
    const ii = pg && Array.isArray(pg.imageinfo) ? pg.imageinfo[0] : null;
    if (!ii) continue;
    const title = String(pg.title || '');
    if (TITLE_BLOCK.test(title)) continue;
    if (ii.mime !== 'image/jpeg' && ii.mime !== 'image/png') continue;
    const url = ii.thumburl || ii.url;
    if (!allowedUrl(url)) continue;
    const w = Number(ii.thumbwidth || ii.width);
    const h = Number(ii.thumbheight || ii.height);
    if (!(w >= MIN_W && h >= MIN_H)) continue;
    if (Number(ii.width) < 800 || Number(ii.height) < 500) continue;
    const aspect = w / h;
    if (aspect < 0.8 || aspect > 2.4) continue;
    const meta = ii.extmetadata || {};
    const lic = htmlText(meta.LicenseShortName && meta.LicenseShortName.value);
    if (!licenseOk(lic)) continue;
    const artist = cut(htmlText(meta.Artist && meta.Artist.value), 34);
    const credit = `${artist ? artist + ', ' : ''}${cut(lic, 20)} · Wikimedia Commons`;
    const rank = Number.isFinite(pg.index) ? pg.index : out.length + 1;
    out.push({ url, credit, source: 'commons', score: rank + Math.abs(Math.log(aspect / TARGET_ASPECT)) * 3 });
  }
  return out.sort((a, b) => a.score - b.score);
}

/** Pexels (kalit boʻlsa): bepul litsenziyali suratlar. */
async function searchPexels(query) {
  const key = config.PEXELS_API_KEY;
  if (!key) return [];
  const p = new URLSearchParams({ query, per_page: '6', orientation: 'landscape' });
  const j = await getJson(`${config.PEXELS_API_URL}?${p}`, { Authorization: key });
  const out = [];
  (j && Array.isArray(j.photos) ? j.photos : []).forEach((ph, i) => {
    const url = ph && ph.src && (ph.src.large || ph.src.large2x);
    if (!allowedUrl(url)) return;
    const who = cut(squash(ph.photographer, 60), 34);
    out.push({ url, credit: `${who ? who + ' · ' : ''}Pexels`, source: 'pexels', score: i });
  });
  return out;
}

const SOURCES = [searchCommons, searchPexels];

// ---------------------------------------------------------------- asosiy
/** Bitta nomzodni yuklab, baytlaridan tekshiradi. Yaroqsiz boʻlsa null. */
async function fetchCandidate(c) {
  const buf = await getImageBytes(c.url);
  const info = imageInfo(buf);
  if (!info || info.w < MIN_W || info.h < MIN_H || info.w > MAX_DIM || info.h > MAX_DIM) return null;
  const asp = info.w / info.h;
  if (asp < 0.8 || asp > 2.4) return null;
  return { url: c.url, credit: c.credit, source: c.source, buf, mime: info.mime, w: info.w, h: info.h };
}

/**
 * Soʻrov boʻyicha rasm topadi: avval Vikipediya, topilmasa Pexels. Topilmasa null.
 * exclude (Set): boshqa slaydlarda ishlatilgan manzillar; tanlangan manzil shu yerga qoʻshiladi.
 */
async function findImage(query, { exclude } = {}) {
  const q = cleanQuery(query);
  if (!q) return null;
  const key = q.toLowerCase();
  const hit = FOUND.get(key);
  if (hit && !(exclude && exclude.has(hit.url)) && BYTES.has(hit.url)) {
    if (exclude) exclude.add(hit.url);
    return { ...hit, ...BYTES.get(hit.url) };
  }
  const words = q.split(' ');
  const variants = [q];
  if (words.length > 3) variants.push(words.slice(0, 3).join(' '));
  for (const search of SOURCES) {
    for (const v of variants) {
      let list;
      try {
        list = await search(v);
      } catch {
        continue;
      }
      let tried = 0;
      for (const c of list) {
        if (tried >= 3) break;
        if (exclude && exclude.has(c.url)) continue;
        tried++;
        if (exclude) exclude.add(c.url);
        try {
          const r = await fetchCandidate(c);
          if (r) {
            cacheBytes(r.url, { buf: r.buf, mime: r.mime, w: r.w, h: r.h });
            cacheFound(key, { url: r.url, credit: r.credit, source: r.source });
            return r;
          }
        } catch {
          /* keyingisiga oʻtamiz */
        }
        if (exclude) exclude.delete(c.url);
      }
    }
  }
  return null;
}

/** photo slaydlariga rasm biriktiradi (slide.image = { url, w, h, credit }). Nechta slaydga topilganini qaytaradi. */
async function attach(deck, { deadlineMs } = {}) {
  if (!config.IMAGES || !deck || !Array.isArray(deck.slides)) return 0;
  const todo = deck.slides.filter((s) => s && s.layout === 'photo' && s.imageQuery && !validImage(s.image));
  if (!todo.length) return 0;
  const used = new Set(deck.slides.filter((s) => s && validImage(s.image)).map((s) => s.image.url));
  const end = Date.now() + (deadlineMs || config.IMAGES_DEADLINE_MS);
  let ok = 0;
  await mapLimit(todo, config.IMAGE_CONCURRENCY, async (s) => {
    const left = end - Date.now();
    if (left < 1000) return;
    try {
      const r = await withTimeout(findImage(s.imageQuery, { exclude: used }), left);
      if (r) {
        s.image = { url: r.url, w: r.w, h: r.h, credit: r.credit };
        ok++;
      }
    } catch {
      /* rasmsiz qoladi */
    }
  });
  return ok;
}

/** Chizish uchun baytlarni tayyorlaydi: Map(slayd indeksi -> { buf, mime, w, h, credit }). Yuklanmaganlar kirmaydi. */
async function load(deck, { deadlineMs } = {}) {
  const out = new Map();
  if (!config.IMAGES || !deck || !Array.isArray(deck.slides)) return out;
  const items = [];
  deck.slides.forEach((s, i) => {
    if (s && s.layout === 'photo' && validImage(s.image)) items.push([s, i]);
  });
  const end = Date.now() + (deadlineMs || config.IMAGES_DEADLINE_MS);
  await mapLimit(items, config.IMAGE_CONCURRENCY, async ([s, i]) => {
    const left = end - Date.now();
    if (left < 1000) return;
    try {
      let e = BYTES.get(s.image.url);
      if (!e) {
        const buf = await withTimeout(getImageBytes(s.image.url), left);
        const info = imageInfo(buf);
        if (!info || info.w < MIN_W || info.h < MIN_H || info.w > MAX_DIM || info.h > MAX_DIM) return;
        e = { buf, mime: info.mime, w: info.w, h: info.h };
        cacheBytes(s.image.url, e);
      }
      out.set(i, { buf: e.buf, mime: e.mime, w: e.w, h: e.h, credit: s.image.credit });
    } catch {
      /* slayd rasmsiz chiqadi */
    }
  });
  return out;
}

module.exports = { attach, load, findImage, searchCommons, searchPexels, imageInfo, allowedUrl, licenseOk, cleanQuery, validImage, clearCache };
