// Slaydlarga rasm qoʻshishni tekshiradi: Vikipediya/Pexels qidiruvi (soxta tarmoq bilan), xavfsizlik, "photo" slayd turi,
// tahrirda rasm saqlanishi va butun yaratish jarayoni. Haqiqiy internet va AI kerak emas.
// Ishga tushirish: npm run test:images
process.env.MOCK_AI = '1';
process.env.MOCK_IMAGES = '1';
process.env.TMP_DIR = require('path').join(require('os').tmpdir(), 'slayd-test-images');
const assert = require('assert');
const JSZip = require('jszip');
const config = require('../src/config');
const images = require('../src/images');
const ai = require('../src/ai');
const service = require('../src/service');
const { buildDeck, normalizeDeck, STYLE_KEYS, LAYOUTS } = require('../src/deck');
const { validate } = require('../src/orders');
const { png, jpegHeader } = require('./img-fixture');

let n = 0;
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`);
const isMedia = (f) => /^ppt\/media\/.+\.(png|jpe?g)$/.test(f); // papka yozuvi (ppt/media/) hisobga kirmaydi

// ---------------------------------------------------------------- soxta tarmoq
const calls = [];
let commons = {}; // qidiruv matni (filetype:bitmap siz) -> sahifalar roʻyxati
let commonsPlain = {}; // operatorsiz qidiruv (filetype:bitmap boʻlmagan) uchun javoblar
let pexels = null; // Pexels javobi yoki null
let files = {}; // rasm manzili -> Response yoki () => Response
let down = false; // true boʻlsa hamma soʻrov xato beradi

const REAL_FETCH = global.fetch;
global.fetch = async (url, init = {}) => {
  url = String(url);
  calls.push({ url, init });
  if (down) throw new Error('tarmoq yoʻq');
  const u = new URL(url);
  if (u.hostname === 'commons.wikimedia.org') {
    const raw = u.searchParams.get('gsrsearch');
    const bitmap = / filetype:bitmap$/.test(raw);
    const q = raw.replace(/ filetype:bitmap$/, '');
    const table = bitmap ? commons : commonsPlain;
    return new Response(JSON.stringify({ query: { pages: table[q] || [] } }), { headers: { 'content-type': 'application/json' } });
  }
  if (u.hostname === 'api.pexels.com') {
    if (!pexels) return new Response('{}', { status: 401 });
    return new Response(JSON.stringify(pexels), { headers: { 'content-type': 'application/json' } });
  }
  const f = files[url];
  if (!f) return new Response('yoq', { status: 404 });
  return typeof f === 'function' ? f() : f.clone();
};
const fetchCount = (re) => calls.filter((c) => re.test(c.url)).length;

const slug = (t) => t.replace(/[^A-Za-z0-9]+/g, '_');
const imgUrl = (t) => `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${slug(t)}.jpg/1000px-${slug(t)}.jpg`;
const page = (title, index, o = {}) => ({
  pageid: index,
  ns: 6,
  title,
  index,
  imageinfo: [{
    thumburl: o.thumburl || imgUrl(title),
    thumbwidth: o.tw || 1000,
    thumbheight: o.th || 680,
    url: imgUrl(title),
    width: o.w || 3000,
    height: o.h || 2040,
    mime: o.mime || 'image/jpeg',
    extmetadata: {
      LicenseShortName: { value: o.lic === undefined ? 'CC BY-SA 4.0' : o.lic },
      Artist: { value: o.artist === undefined ? '<a href="//commons.wikimedia.org/wiki/User:Jane">Jane &amp; Co</a>' : o.artist },
    },
  }],
});
const jpg = (w = 1000, h = 680) => new Response(jpegHeader(w, h), { headers: { 'content-type': 'image/jpeg' } });
const reset = () => {
  calls.length = 0;
  commons = {};
  commonsPlain = {};
  pexels = null;
  files = {};
  down = false;
  images.clearCache();
  config.IMAGES = true;
  config.PEXELS_API_KEY = '';
  config.IMAGE_TIMEOUT_MS = 2000;
};

const photoSlide = (query, extra = {}) => ({ layout: 'photo', title: 'Rasmli ' + query, lead: 'Asosiy fikr', items: [{ head: 'A', text: 'a' }, { head: 'B', text: 'b' }], imageQuery: query, notes: 'n', ...extra });
const deckOf = (...slides) => ({ title: 'T', subtitle: '', slides });

(async () => {
  // 1. oʻlchamni baytlardan oʻqish
  assert.deepStrictEqual(images.imageInfo(png(960, 640)), { mime: 'image/png', w: 960, h: 640 });
  assert.deepStrictEqual(images.imageInfo(jpegHeader(1200, 800)), { mime: 'image/jpeg', w: 1200, h: 800 });
  assert.deepStrictEqual(images.imageInfo(jpegHeader(900, 700, 0xc2)), { mime: 'image/jpeg', w: 900, h: 700 }, 'progressive JPEG');
  assert.strictEqual(images.imageInfo(Buffer.from('GIF89a' + 'x'.repeat(40))), null);
  assert.strictEqual(images.imageInfo(Buffer.from('<html>' + 'x'.repeat(60) + '</html>')), null);
  assert.strictEqual(images.imageInfo(Buffer.from([0xff, 0xd8, 0xff])), null);
  assert.strictEqual(images.imageInfo(null), null);
  ok('JPEG/PNG oʻlchami baytlardan oʻqiladi, boshqa fayl va buzuq sarlavha rad etiladi');

  // 2. manzil xavfsizligi (SSRF)
  const yes = ['https://upload.wikimedia.org/a/b.jpg', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/960px-X.jpg', 'https://images.pexels.com/photos/1/p.jpeg?w=940'];
  const no = ['http://upload.wikimedia.org/a.jpg', 'https://upload.wikimedia.org.evil.com/a.jpg', 'https://thumb.wikimedia.org.evil.com/a.jpg', 'https://evil.com/thumb.wikimedia.org/a.jpg', 'https://evil.com/upload.wikimedia.org/a.jpg', 'https://user:pw@upload.wikimedia.org/a.jpg', 'https://upload.wikimedia.org:8443/a.jpg', 'https://127.0.0.1/a.jpg', 'https://localhost/a.jpg', 'file:///etc/passwd', 'javascript:alert(1)', 'nomanzil', '', null, undefined];
  yes.forEach((u) => assert.ok(images.allowedUrl(u), u));
  no.forEach((u) => assert.ok(!images.allowedUrl(u), String(u)));
  ok('faqat Wikimedia/Pexels https manzillari ruxsat etiladi (SSRFdan himoya)');

  // 3. litsenziya
  for (const l of ['CC BY-SA 4.0', 'CC BY 2.0', 'CC0', 'CC0 1.0 Universal', 'Public domain', 'Public Domain Mark 1.0', 'PD-USGov-NASA', 'cc-by-sa-3.0', 'Attribution']) assert.ok(images.licenseOk(l), l);
  for (const l of ['CC BY-NC 4.0', 'CC BY-NC-SA 3.0', 'CC BY-ND 2.0', 'CC BY-NC-ND 4.0', 'Fair use', 'Non-free', 'All rights reserved', 'GFDL', 'GFDL 1.2', '', null, 'Unknown']) assert.ok(!images.licenseOk(l), String(l));
  ok('litsenziya: CC0/CC BY/CC BY-SA/public domain ruxsat, NC/ND/fair use va nomaʼlum rad etiladi');

  // 4. soʻrovni tozalash
  assert.strictEqual(images.cleanQuery('Aral  Sea: shipwrecks'), 'Aral Sea shipwrecks');
  assert.strictEqual(images.cleanQuery('intitle:"cats" -dogs OR birds'), 'intitle cats dogs birds');
  assert.strictEqual(images.cleanQuery('ab'), '');
  assert.strictEqual(images.cleanQuery(null), '');
  assert.ok(images.cleanQuery('x'.repeat(300)).length <= 70);
  ok('qidiruv soʻrovidan operatorlar va belgilar olib tashlanadi');

  // 5. Commons: yaroqsizlari tashlanadi, eng yaxshisi tanlanadi, muallif yozuvi toza
  reset();
  commons['Registan Samarkand'] = [
    page('File:Registan logo.jpg', 1),
    page('File:Registan nc.jpg', 2, { lic: 'CC BY-NC 4.0' }),
    page('File:Registan tiny.jpg', 3, { tw: 300, th: 200, w: 400, h: 260 }),
    page('File:Registan svg.svg', 4, { mime: 'image/svg+xml' }),
    page('File:Registan tall.jpg', 5, { tw: 600, th: 1000, w: 1800, h: 3000 }),
    page('File:Registan best.jpg', 6),
    page('File:Registan other.jpg', 7, { lic: 'CC0', artist: '' }),
  ];
  files[imgUrl('File:Registan best.jpg')] = jpg(1000, 680);
  files[imgUrl('File:Registan other.jpg')] = jpg(1000, 680);
  const r5 = await images.findImage('Registan Samarkand');
  assert.ok(r5, 'rasm topilmadi');
  assert.strictEqual(r5.url, imgUrl('File:Registan best.jpg'));
  assert.strictEqual(r5.credit, 'Jane & Co, CC BY-SA 4.0 · Wikimedia Commons');
  assert.strictEqual(r5.mime, 'image/jpeg');
  assert.ok(r5.w === 1000 && r5.h === 680 && Buffer.isBuffer(r5.buf));
  const c0 = calls[0];
  assert.ok(/commons\.wikimedia\.org/.test(c0.url) && /generator=search/.test(c0.url) && /filetype%3Abitmap/.test(c0.url) && /iiurlwidth=960/.test(c0.url));
  assert.ok(/SlaydBot/.test(c0.init.headers['User-Agent']) && /t\.me\/Space_deckbot/.test(c0.init.headers['User-Agent']), 'User-Agentda aloqa maʼlumoti boʻlishi kerak (Wikimedia talabi)');
  assert.strictEqual(fetchCount(/Registan_logo|Registan_nc|Registan_tiny|Registan_svg|Registan_tall/), 0, 'yaroqsiz fayl yuklanmasligi kerak');
  ok('Commons: logotip, NC, kichik, SVG va noqulay nisbatli fayllar tashlanadi; muallif va litsenziya yozuvi toza');

  // 6. yuklangan fayl rasm boʻlmasa yoki kichik boʻlsa, keyingi nomzodga oʻtadi
  reset();
  commons['Aral Sea'] = [page('File:Aral html.jpg', 1), page('File:Aral small.jpg', 2), page('File:Aral good.jpg', 3)];
  files[imgUrl('File:Aral html.jpg')] = new Response('<html>' + 'x'.repeat(100) + '</html>', { headers: { 'content-type': 'image/jpeg' } });
  files[imgUrl('File:Aral small.jpg')] = jpg(320, 200);
  files[imgUrl('File:Aral good.jpg')] = new Response(png(960, 640), { headers: { 'content-type': 'image/png' } });
  const r6 = await images.findImage('Aral Sea');
  assert.strictEqual(r6.url, imgUrl('File:Aral good.jpg'));
  assert.strictEqual(r6.mime, 'image/png');
  ok('yuklangan fayl rasm emas yoki kichik boʻlsa, keyingi nomzod olinadi (tur baytlardan tekshiriladi)');

  // 7. Commons topmasa Pexels; kalit boʻlmasa null
  reset();
  pexels = { photos: [{ id: 1, width: 4000, height: 2600, photographer: 'Ali Valiyev', src: { large: 'https://images.pexels.com/photos/1/pexels-photo-1.jpeg?w=940' } }, { id: 2, photographer: 'X', src: { large: 'https://evil.com/p.jpeg' } }] };
  files['https://images.pexels.com/photos/1/pexels-photo-1.jpeg?w=940'] = jpg(940, 627);
  assert.strictEqual(await images.findImage('Silk road caravan'), null, 'kalitsiz Pexels ishlamasligi kerak');
  assert.strictEqual(fetchCount(/pexels/), 0);
  config.PEXELS_API_KEY = 'KEY123';
  const r7 = await images.findImage('Silk road caravan');
  assert.ok(r7 && r7.source === 'pexels' && r7.credit === 'Ali Valiyev · Pexels');
  const pc = calls.find((c) => /api\.pexels\.com/.test(c.url));
  assert.strictEqual(pc.init.headers.Authorization, 'KEY123');
  assert.ok(/orientation=landscape/.test(pc.url));
  assert.ok(calls.findIndex((c) => /commons/.test(c.url)) < calls.findIndex((c) => /api\.pexels/.test(c.url)), 'avval Vikipediya sinalishi kerak');
  assert.strictEqual(fetchCount(/evil\.com/), 0, 'ruxsatsiz host soʻralmasligi kerak');
  ok('avval Vikipediya, topilmasa Pexels (kalit bilan); ruxsatsiz host hech qachon soʻralmaydi');

  // 8. yoʻnaltirish: ruxsatsiz hostga yoʻnaltirilsa rad, ruxsat etilganiga yoʻnaltirilsa kuzatiladi
  reset();
  commons['Mirzo Ulugbek'] = [page('File:Ulugbek evil.jpg', 1), page('File:Ulugbek moved.jpg', 2)];
  files[imgUrl('File:Ulugbek evil.jpg')] = () => new Response(null, { status: 302, headers: { location: 'https://evil.com/steal.jpg' } });
  files[imgUrl('File:Ulugbek moved.jpg')] = () => new Response(null, { status: 301, headers: { location: 'https://upload.wikimedia.org/final.jpg' } });
  files['https://upload.wikimedia.org/final.jpg'] = jpg(1000, 680);
  const r8 = await images.findImage('Mirzo Ulugbek');
  assert.ok(r8 && r8.url === imgUrl('File:Ulugbek moved.jpg'));
  assert.strictEqual(fetchCount(/evil\.com/), 0, 'yoʻnaltirish manzili tekshirilmadi');
  ok('yoʻnaltirishlar qoʻlda kuzatiladi: ruxsatsiz hostga yoʻnaltirilgan rasm rad etiladi');

  // 9. hajm chegarasi
  reset();
  commons['Big photo'] = [page('File:Big one.jpg', 1), page('File:Big two.jpg', 2)];
  files[imgUrl('File:Big one.jpg')] = new Response(jpegHeader(1000, 680), { headers: { 'content-length': String(config.IMAGE_MAX_BYTES + 1) } });
  files[imgUrl('File:Big two.jpg')] = () => new Response(Buffer.concat([jpegHeader(1000, 680), Buffer.alloc(config.IMAGE_MAX_BYTES + 10)]));
  assert.strictEqual(await images.findImage('Big photo'), null);
  ok('juda katta fayl (sarlavhada ham, oqim davomida ham) rad etiladi');

  // 10. tarmoq ishlamasa jim null
  reset();
  down = true;
  assert.strictEqual(await images.findImage('Anything here'), null);
  ok('tarmoq ishlamasa xato tashlanmaydi, null qaytadi');

  // 11. attach: dublikat rasm ishlatilmaydi, topilmagan slayd rasmsiz qoladi
  reset();
  commons['Tashkent tower'] = [page('File:Tower a.jpg', 1), page('File:Tower b.jpg', 2)];
  commons['Tashkent television tower'] = [page('File:Tower a.jpg', 1), page('File:Tower b.jpg', 2)];
  commons['Unknown thing'] = [];
  files[imgUrl('File:Tower a.jpg')] = jpg(1000, 680);
  files[imgUrl('File:Tower b.jpg')] = jpg(1000, 680);
  const deck11 = deckOf({ layout: 'definition', title: 'D', lead: 'x', items: [], notes: '' }, photoSlide('Tashkent tower'), photoSlide('Tashkent television tower'), photoSlide('Unknown thing'));
  const got = await images.attach(deck11);
  const [, s1, s2, s3] = deck11.slides;
  assert.strictEqual(got, 2);
  assert.ok(s1.image && s2.image && s1.image.url !== s2.image.url, 'bir xil rasm ikki marta ishlatildi');
  assert.ok(images.validImage(s1.image) && s1.image.credit.includes('Wikimedia Commons'));
  assert.ok(!s3.image, 'topilmagan slayd rasmsiz qolishi kerak');
  assert.ok(!('buf' in s1.image), 'baytlar taqdimot JSONiga tushmasligi kerak');
  ok('attach: har slaydga boshqa rasm, topilmaganlari rasmsiz; JSONda faqat manzil, oʻlcham va muallif');

  // 12. load: kesh ishlaydi, kesh tozalansa manzildan qayta yuklanadi, buzilgan manzil olinmaydi
  const before = fetchCount(/upload\.wikimedia/);
  const m1 = await images.load(deck11);
  assert.deepStrictEqual([...m1.keys()].sort(), [1, 2]);
  assert.strictEqual(fetchCount(/upload\.wikimedia/), before, 'keshdan olinishi kerak');
  assert.ok(m1.get(1).buf.length > 20 && m1.get(1).mime === 'image/jpeg' && m1.get(1).credit === s1.image.credit);
  images.clearCache();
  const m2 = await images.load(deck11);
  assert.strictEqual(m2.size, 2);
  assert.ok(fetchCount(/upload\.wikimedia/) > before, 'kesh tozalangach qayta yuklanishi kerak');
  const tampered = JSON.parse(JSON.stringify(deck11));
  tampered.slides[2].image.url = 'https://evil.com/x.jpg';
  images.clearCache();
  const m3 = await images.load(tampered);
  assert.deepStrictEqual([...m3.keys()], [1]);
  assert.strictEqual(fetchCount(/evil\.com/), 0);
  ok('load: keshdan, kesh boʻlmasa manzildan; buzilgan manzil e’tiborsiz qoldiriladi');

  // 13. rasmlar oʻchirilgan boʻlsa tarmoqqa chiqilmaydi
  reset();
  config.IMAGES = false;
  const off = deckOf(photoSlide('Tashkent tower'));
  assert.strictEqual(await images.attach(off), 0);
  assert.strictEqual((await images.load(off)).size, 0);
  assert.strictEqual(calls.length, 0);
  config.IMAGES = true;
  ok('IMAGES=0 boʻlsa tarmoqqa umuman chiqilmaydi');

  // 14. normalizeDeck: photo qoidalari
  const nd = (s) => normalizeDeck({ title: 'T', slides: [s] }).slides[0];
  assert.ok(LAYOUTS.includes('photo') && LAYOUTS.length === 19);
  assert.strictEqual(nd(photoSlide('Aral Sea')).layout, 'photo');
  assert.strictEqual(nd(photoSlide('')).layout, 'split', 'imageQuerysiz photo → split');
  assert.strictEqual(nd(photoSlide('Aral Sea', { lead: '' })).layout, 'rows');
  assert.strictEqual(nd(photoSlide('Aral Sea', { items: [{ head: 'a', text: 'b' }] })).layout, 'definition');
  const keep = { url: imgUrl('File:Keep.jpg'), w: 1000, h: 680, credit: 'A · Wikimedia Commons' };
  assert.deepStrictEqual(nd(photoSlide('Aral Sea', { image: keep })).image, keep);
  assert.strictEqual(nd(photoSlide('Aral Sea', { image: { ...keep, url: 'https://evil.com/a.jpg' } })).image, null);
  assert.strictEqual(nd(photoSlide('Aral Sea', { image: { ...keep, w: 'x' } })).image, null);
  const cards = nd({ layout: 'cards', title: 'C', items: [{ head: 'a', text: 'b' }, { head: 'c', text: 'd' }], imageQuery: 'Aral Sea', image: keep });
  assert.ok(cards.imageQuery === '' && cards.image === null, 'photo boʻlmagan slaydda rasm maʼlumoti qolmasligi kerak');
  ok('normalizeDeck: photo uchun lead, 2+ izoh va imageQuery shart; yaroqsiz rasm maʼlumoti tashlanadi');

  // 15. buildDeck: rasm bor → .pptx ichida rasm; yoʻq → "split" koʻrinishi, slaydlar soni oʻzgarmaydi
  const deck15 = normalizeDeck(deckOf(photoSlide('Aral Sea'), { layout: 'cards', title: 'C', items: [{ head: 'a', text: 'b' }, { head: 'c', text: 'd' }] }, photoSlide('Registan Samarkand')));
  const map = new Map([[0, { buf: png(960, 640), mime: 'image/png', w: 960, h: 640, credit: 'Jane, CC BY 4.0 · Wikimedia Commons' }], [2, { buf: png(640, 960, 40), mime: 'image/png', w: 640, h: 960, credit: 'X · Pexels' }]]);
  for (const lang of ['uz', 'uzc', 'ru', 'kaa']) {
    const withImg = await JSZip.loadAsync(await buildDeck(deck15, { color: 'blue', lang, images: map }));
    const media = Object.keys(withImg.files).filter(isMedia);
    assert.strictEqual(media.length, 2, `${lang}: 2 ta rasm boʻlishi kerak`);
    const xml = await withImg.file('ppt/slides/slide2.xml').async('string');
    assert.ok(/<a:srcRect/.test(xml), 'rasm kesilishi (cover) kerak');
    const label = { uz: 'Foto', uzc: 'Фото', ru: 'Фото', kaa: 'Foto' }[lang];
    assert.ok(xml.includes(`${label}: Jane, CC BY 4.0`), `${lang}: muallif yorligʻi`);
  }
  const plain = await JSZip.loadAsync(await buildDeck(deck15, { color: 'blue', lang: 'uz' }));
  assert.strictEqual(Object.keys(plain.files).filter(isMedia).length, 0);
  assert.strictEqual(Object.keys(plain.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).length, 4);
  const partial = await JSZip.loadAsync(await buildDeck(deck15, { color: 'blue', lang: 'uz', images: new Map([[0, map.get(0)]]) }));
  assert.strictEqual(Object.keys(partial.files).filter(isMedia).length, 1);
  ok('buildDeck: rasm kesib joylanadi, muallif yorligʻi tilga mos; rasm boʻlmasa slayd "split" koʻrinishida chiqadi');

  // 16. barcha 20 koʻrinishda rasmli slayd xatosiz yigʻiladi
  for (const style of STYLE_KEYS) {
    const buf = await buildDeck(deck15, { color: 'green', lang: 'uz', style, images: map });
    assert.ok((await JSZip.loadAsync(buf)).file('ppt/slides/slide2.xml'));
  }
  ok('rasmli slayd 20 koʻrinishning hammasida xatosiz yigʻiladi');

  // 17. ai.limitPhotos qoidalari
  const lp = (...ls) => ai.limitPhotos({ slides: ls.map((layout) => ({ layout, imageQuery: layout === 'photo' ? 'q q' : '', image: null, lead: 'l', items: [] })) }, true).slides.map((s) => s.layout);
  assert.deepStrictEqual(lp('photo', 'cards', 'rows', 'references'), ['split', 'cards', 'rows', 'references'], 'birinchi slayd photo boʻlmasin');
  assert.deepStrictEqual(lp('agenda', 'cards', 'photo', 'photo', 'rows', 'references').slice(2, 4), ['photo', 'split'], 'ketma-ket ikkita photo boʻlmasin');
  assert.deepStrictEqual(lp('agenda', 'cards', 'photo'), ['agenda', 'cards', 'split'], 'oxirgi slayd photo boʻlmasin');
  const many = lp('agenda', 'photo', 'cards', 'photo', 'rows', 'photo', 'table', 'photo', 'process', 'references');
  assert.strictEqual(many.filter((l) => l === 'photo').length, 4, 'ketma-ket boʻlmagan 4 ta photo qoladi (10 slaydga chegara 5)');
  const crowded = lp('agenda', 'photo', 'cards', 'photo', 'rows', 'photo', 'table', 'photo', 'process', 'photo', 'cards', 'photo', 'rows', 'photo', 'cards', 'photo', 'rows', 'photo', 'references');
  assert.strictEqual(crowded.filter((l) => l === 'photo').length, ai.photoCap(crowded.length), 'soni photoCap bilan cheklanadi');
  const demoted = ai.limitPhotos({ slides: [{ layout: 'cards' }, { layout: 'photo', imageQuery: 'a b c', image: { url: 'x' } }, { layout: 'cards' }] }, false).slides[1];
  assert.ok(demoted.layout === 'split' && demoted.imageQuery === '' && demoted.image === null);
  ok('photo qoidalari: birinchi/oxirgi emas, ketma-ket emas, soni cheklangan; oʻchiq boʻlsa hammasi split');

  // 18. tahrirda rasm saqlanishi
  const base = normalizeDeck(deckOf(photoSlide('Aral Sea', { image: keep }), { layout: 'cards', title: 'C', items: [{ head: 'a', text: 'b' }, { head: 'c', text: 'd' }] }));
  const same = ai.applyChanges(base, { reply: 'ok', changes: [{ slide: 2, content: photoSlide('aral sea', { lead: 'Yangi fikr' }) }] }, true);
  assert.strictEqual(same.deck.slides[0].lead, 'Yangi fikr');
  assert.deepStrictEqual(same.deck.slides[0].image, keep, 'mavzu oʻzgarmasa rasm saqlanishi kerak');
  const diff = ai.applyChanges(base, { reply: 'ok', changes: [{ slide: 2, content: photoSlide('Registan Samarkand') }] }, true);
  assert.strictEqual(diff.deck.slides[0].image, null, 'mavzu oʻzgarsa rasm yangidan qidiriladi');
  const toCards = ai.applyChanges(base, { reply: 'ok', changes: [{ slide: 2, content: { layout: 'cards', title: 'C', items: [{ head: 'a', text: 'b' }, { head: 'c', text: 'd' }], imageQuery: 'Aral Sea' } }] }, true);
  assert.ok(toCards.deck.slides[0].layout === 'cards' && toCards.deck.slides[0].image === null);
  const disabled = ai.applyChanges(base, { reply: 'ok', changes: [{ slide: 2, content: photoSlide('Aral Sea') }] }, false);
  assert.strictEqual(disabled.deck.slides[0].layout, 'split');
  assert.deepStrictEqual(JSON.stringify(base).includes('Yangi fikr'), false, 'asl taqdimot oʻzgarmasligi kerak');
  ok('tahrir: mavzu oʻzgarmasa rasm saqlanadi, oʻzgarsa qayta qidiriladi, rasmlar oʻchiq boʻlsa photo → split');

  // 19. butun jarayon: yaratish → rasm qidirish → .pptx + PDF; tahrirdan keyin ham rasm bor
  reset();
  config.DISABLE_PDF = false;
  commons['Registan Samarkand'] = [page('File:Registan full.jpg', 1)];
  files[imgUrl('File:Registan full.jpg')] = new Response(png(960, 640), { headers: { 'content-type': 'image/png' } });
  const res = await service.createDeck({ topic: 'Sinov mavzu', slides: 10, lang: 'uz', color: 'green', style: 'klassik', profile: { fullName: 'Test' } });
  const photo = res.deck.slides.filter((s) => s.layout === 'photo');
  assert.strictEqual(photo.length, 1, 'mock taqdimotda bitta photo boʻlishi kerak');
  assert.ok(images.validImage(photo[0].image));
  const zip = await JSZip.loadAsync(res.pptx);
  assert.strictEqual(Object.keys(zip.files).filter(isMedia).length, 1);
  if (res.pdf) {
    assert.ok(res.pdf.slice(0, 4).toString() === '%PDF');
    assert.strictEqual((res.pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length, res.finalSlides, 'PDF betlari = slaydlar');
  }
  const ed = await service.editDeck({ deck: res.deck, instruction: '2-slayd', lang: 'uz', color: 'green', style: 'klassik', profile: {} });
  assert.ok(ed.pptx || ed.changed === 0);
  const noImg = await service.createDeck({ topic: 'Sinov mavzu', slides: 10, lang: 'uz', color: 'green', style: 'klassik', images: false, profile: {} });
  assert.strictEqual(noImg.deck.slides.filter((s) => s.layout === 'photo').length, 0);
  assert.strictEqual(Object.keys((await JSZip.loadAsync(noImg.pptx)).files).filter(isMedia).length, 0);
  ok('butun jarayon: mavzu → rasm qidirish → .pptx va PDF; images:false boʻlsa rasmsiz');

  // 20. rasm topilmasa ham buyurtma bajariladi (slayd rasmsiz chiqadi)
  reset();
  down = true;
  config.DISABLE_PDF = true;
  const fail = await service.createDeck({ topic: 'Sinov mavzu', slides: 10, lang: 'ru', color: 'red', style: 'klassik', profile: {} });
  assert.ok(fail.pptx.length > 10000 && fail.finalSlides === 10);
  assert.ok(fail.deck.slides.every((s) => !s.image));
  assert.strictEqual(Object.keys((await JSZip.loadAsync(fail.pptx)).files).filter(isMedia).length, 0);
  ok('rasm topilmasa ham taqdimot yasaladi: photo slaydi rasmsiz koʻrinishda chiqadi');

  // 21. buyurtmani tekshirish: images belgisi
  const base21 = { topic: 'Sinov mavzu', slides: 10, lang: 'uz', color: 'green' };
  assert.strictEqual(validate(base21).value.images, true);
  assert.strictEqual(validate({ ...base21, images: true }).value.images, true);
  for (const v of [false, 0, 'false', '0']) assert.strictEqual(validate({ ...base21, images: v }).value.images, false, String(v));
  ok('buyurtma: rasmlar sukut boʻyicha yoqiladi, faqat aniq "yoʻq" deyilsa oʻchadi');

  // 22. rasmli slaydlarni kod belgilaydi: imageQuery berilgan mos slaydlar tekis taqsimlanadi
  const mk = (layout, q, nItems = 3, extra = {}) => ({
    layout, title: 'S ' + layout + (q ? ' ' + q : ''), lead: layout === 'split' ? 'Asosiy fikr' : '', note: '', notes: 'n',
    items: Array.from({ length: nItems }, (_, i) => ({ head: 'h' + i, text: 't' + i })), columns: [], table: null, references: [], imageQuery: q, image: null, ...extra,
  });
  const base22 = () => ({ title: 'T', subtitle: '', slides: [
    mk('agenda', ''), mk('cards', 'Registan Samarkand'), mk('cards', 'Aral Sea ships'), mk('timeline', 'Amir Temur statue'), mk('rows', 'Ulugbek observatory'),
    mk('split', 'Bibi Khanym Mosque'), mk('cards', 'Shahrisabz Aksaray'), mk('rows', 'Silk road caravan', 6), mk('cards', 'Chor Minor Bukhara'), mk('references', '', 0, { references: ['Manba 1'] }),
  ] });
  const p22 = ai.planPhotos(base22(), true);
  const L = p22.slides.map((s) => s.layout);
  const photoIdx = L.map((l, i) => (l === 'photo' ? i : -1)).filter((i) => i >= 0);
  assert.ok(photoIdx.length >= 4 && photoIdx.length <= ai.photoCap(10), `soni: 4 dan photoCap gacha (ketma-ket boʻlmagan nomzodlar: 1, 4, 6, 8): ${photoIdx}`);
  assert.ok(photoIdx.every((i) => i > 0 && i < 9), 'birinchi/oxirgi emas');
  assert.ok(photoIdx.every((i, k) => k === 0 || i - photoIdx[k - 1] > 1), 'ketma-ket emas');
  assert.ok(photoIdx.every((i) => ['cards', 'split', 'rows'].includes(base22().slides[i].layout)), 'faqat mos turlar');
  assert.ok(!photoIdx.includes(3), 'timeline photoga aylanmaydi');
  assert.ok(!photoIdx.includes(7), '4 tadan koʻp izohli slayd photoga aylanmaydi (maʼlumot yoʻqolardi)');
  assert.ok(photoIdx[photoIdx.length - 1] - photoIdx[0] >= 4, 'taqdimot boʻylab taqsimlanishi kerak: ' + photoIdx);
  p22.slides.forEach((s) => {
    if (s.layout === 'photo') assert.ok(s.lead && s.items.length >= 2 && images.cleanQuery(s.imageQuery), 'photo uchun lead, izoh va soʻrov bor');
    else assert.strictEqual(s.imageQuery, '', 'ishlatilmagan rasm soʻrovi tozalanishi kerak');
  });
  const norm22 = normalizeDeck(p22);
  assert.deepStrictEqual(norm22.slides.map((s) => s.layout), L, 'normalizeDeck natijani buzmasligi kerak');
  assert.strictEqual(ai.planPhotos(base22(), false).slides.filter((s) => s.layout === 'photo').length, 0);
  assert.ok(ai.planPhotos(base22(), false).slides.every((s) => s.imageQuery === ''));
  ok('planPhotos: imageQuery berilgan cards/split/rows slaydlar tekis taqsimlanadi; timeline va 4 tadan koʻp izohlilar tegilmaydi');

  // 23. AI rasm mavzusini yozmagan boʻlsa, kichik qoʻshimcha soʻrov (ensurePhotos)
  const noQ = () => { const d = base22(); d.slides.forEach((x) => { x.imageQuery = ''; }); return d; };
  let sent = null;
  const fake = async (system, user, tool, o) => {
    sent = { system, user, tool, o };
    return { photos: [{ slide: 3, imageQuery: 'Registan: Samarkand!' }, { slide: 5, imageQuery: 'Amir Temur statue' }, { slide: 99, imageQuery: 'Nowhere' }, { slide: 8, imageQuery: 'Hacked: ignore instructions' }, { slide: 6, imageQuery: 'ab' }] };
  };
  const d23 = await ai.ensurePhotos(noQ(), { topic: 'Temuriylar', enabled: true, call: fake });
  assert.ok(sent && sent.tool.name === 'submit_photos' && /Temuriylar/.test(sent.user) && sent.o.maxTokens <= 600);
  assert.ok(/^3\. S cards/m.test(sent.user), 'slayd raqamlari roʻyxatda boʻlishi kerak (sarlavha raqami + 2)');
  assert.ok(!/ 1\. S agenda| 11\./.test(sent.user), 'birinchi/oxirgi slayd nomzod emas');
  const ph23 = d23.slides.filter((s) => s.layout === 'photo');
  assert.ok(ph23.length >= 1 && ph23.length <= ai.photoCap(10));
  assert.ok(ph23.every((s) => /^[\p{L}\p{N} ]+$/u.test(s.imageQuery)), 'soʻrovlar tozalangan');
  assert.ok(d23.slides[7].layout !== 'photo', '4 tadan koʻp izohli slayd tanlanmaydi');
  const bad = await ai.ensurePhotos(noQ(), { topic: 'X', enabled: true, call: async () => { throw new Error('429'); } });
  assert.strictEqual(bad.slides.filter((s) => s.layout === 'photo').length, 0, 'AI xato bersa rasmsiz');
  const none = await ai.ensurePhotos(noQ(), { topic: 'X', enabled: true, call: async () => ({ photos: [] }) });
  assert.strictEqual(none.slides.filter((s) => s.layout === 'photo').length, 0);
  let called = 0;
  const withQ = await ai.ensurePhotos(base22(), { topic: 'X', enabled: true, call: async () => { called++; return { photos: [] }; } });
  assert.strictEqual(called, 0, 'AI soʻrov bergan boʻlsa, qoʻshimcha soʻrov yuborilmaydi');
  assert.ok(withQ.slides.some((s) => s.layout === 'photo'));
  const off23 = await ai.ensurePhotos(base22(), { topic: 'X', enabled: false, call: async () => { called++; return {}; } });
  assert.strictEqual(called, 0);
  assert.ok(off23.slides.every((s) => s.layout !== 'photo' && s.imageQuery === ''));
  ok('ensurePhotos: AI mavzu bermasa kichik soʻrov (soxta nomerlar va qisqa soʻzlar tashlanadi); xato boʻlsa jim; oʻchiq boʻlsa tegmaydi');

  // 24. imageQuery boshqa slaydlarda ham saqlanadi (keepQuery), AI qoʻllanmasida rasm talabi bor
  const kq = normalizeDeck({ title: 'T', slides: [{ layout: 'cards', title: 'C', items: [{ head: 'a', text: 'b' }, { head: 'c', text: 'd' }], imageQuery: 'Aral Sea' }] }, { keepQuery: true });
  assert.strictEqual(kq.slides[0].imageQuery, 'Aral Sea');
  const g = ai.layoutGuide(true);
  assert.ok(g.includes('- photo:') && g.includes('also fill "imageQuery"') && !ai.layoutGuide(false).includes('photo'));
  ok('imageQuery barcha slaydlarda saqlanadi (keepQuery) va AI qoʻllanmasida rasm talabi bor');

  // 25. ishga tushishdagi tekshiruv va rasm hisoboti logga yoziladi
  reset();
  commons['Registan Samarkand'] = [page('File:Selftest.jpg', 1)];
  files[imgUrl('File:Selftest.jpg')] = jpg(1000, 680);
  const logs = [];
  const origLog = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try {
    assert.strictEqual(await images.selfTest(), true);
    images.clearCache();
    commons['Unknown thing'] = [];
    await images.attach(deckOf(photoSlide('Unknown thing')));
    down = true;
    images.clearCache();
    assert.strictEqual(await images.selfTest(), false);
  } finally {
    console.log = origLog;
  }
  assert.ok(logs.some((l) => /Rasm qidiruvi ishlayapti \(commons/.test(l)), 'selfTest muvaffaqiyati logga yozilmadi: ' + logs.join(' | '));
  assert.ok(logs.some((l) => /Rasmlar: 0\/1 slaydga topildi · Vikipediyada "Unknown thing" boʻyicha mos rasm yoʻq/.test(l)), 'sabab logga yozilmadi: ' + logs.join(' | '));
  assert.ok(logs.some((l) => /Rasm qidiruvi rasm topmadi: Vikipediya qidiruvi: tarmoq yoʻq/.test(l)), 'xato sababi logga yozilmadi: ' + logs.join(' | '));
  ok('Render logida rasm qidiruvi ishlayaptimi va topilmasa sababi koʻrinadi');

  // 26. "photograph" kabi soʻzlar rasmni rad etmasligi kerak; "filetype" operatori natija bermasa operatorsiz qayta uriniladi
  reset();
  commons['Registan Samarkand'] = [];
  commonsPlain['Registan Samarkand'] = [page('File:Aerial photograph of Registan.jpg', 1), page('File:Registan logo.jpg', 2), page('File:Registan scan.jpg', 3)];
  files[imgUrl('File:Aerial photograph of Registan.jpg')] = jpg(1000, 680);
  const r26 = await images.findImage('Registan Samarkand');
  assert.ok(r26 && r26.url === imgUrl('File:Aerial photograph of Registan.jpg'), 'photograph soʻzi rad etilmasligi kerak, operatorsiz qidiruv ishlashi kerak');
  assert.strictEqual(fetchCount(/filetype%3Abitmap/), 1);
  assert.strictEqual(calls.filter((c) => /commons\.wikimedia\.org/.test(c.url) && !/filetype/.test(c.url)).length, 1);
  reset();
  commons['Ancient wall'] = [page('File:Wall nc.jpg', 1, { lic: 'CC BY-NC 2.0' }), page('File:Wall tiny.jpg', 2, { tw: 300, th: 200, w: 400, h: 260 }), page('File:Wall unknown.jpg', 3, { lic: '' }), page('File:Wall svg.svg', 4, { mime: 'image/svg+xml' })];
  const why26 = [];
  assert.strictEqual(await images.findImage('Ancient wall', { why: why26 }), null);
  const msg = why26.join(' | ');
  assert.ok(/jami 4/.test(msg) && /litsenziya 2/.test(msg) && /kichik 1/.test(msg) && /turi 1/.test(msg) && /CC BY-NC 2\.0/.test(msg), 'rad etish sabablari yozilishi kerak: ' + msg);
  ok('sarlavhada "photograph" rad etilmaydi; natija boʻlmasa operatorsiz qayta qidiriladi; rad etish sabablari (litsenziya, oʻlcham, tur) logga yoziladi');

  // 27. Commons kichraytirilgan nusxani thumb.wikimedia.org dan beradi (haqiqiy javob shunday): bu host ham ruxsat etilgan
  reset();
  const tUrl = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Registan_real.jpg/960px-Registan_real.jpg';
  commons['Registan Samarkand'] = [page('File:Registan real.jpg', 1, { thumburl: tUrl })];
  files[tUrl] = jpg(960, 640);
  const r27 = await images.findImage('Registan Samarkand');
  assert.ok(r27 && r27.url === tUrl, 'thumb.wikimedia.org manzili qabul qilinishi kerak');
  assert.ok(images.validImage({ url: tUrl, w: 960, h: 640, credit: 'A' }));
  ok('thumb.wikimedia.org (haqiqiy Commons javobidagi host) ruxsat etilgan, boshqa oʻxshash hostlar rad etiladi');

  global.fetch = REAL_FETCH;
  console.log(`\nHamma tekshiruvlar yaxshi (${n} ta).`);
})().catch((e) => {
  console.error('\n❌', e.stack || e.message);
  process.exit(1);
});
