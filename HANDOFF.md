# HANDOFF — Mini App + qoraqalpoq tili moduli (birlashtirilgan holat)

Bu hujjat ikkinchi dasturchi (yoki boshqa Claude) uchun: Mini App botga qanday ulangani, API shartnomasi va nimalarga tegmaslik kerakligi.
Asosiy qoida: **API shartnomasi (4-boʻlim) oʻzgarsa, bu hujjat ham yangilanadi.**

## 1. Birlashtirish natijasi (nima qanday ulangan)
- **Bitta server:** `src/server.js` (webhook) `src/web.js` dagi `createWebHandler` ni chaqiradi. Webhook yoʻli va `/healthz` ustuvor, qolgan hamma narsa (`/`, `/api/*`, `/previews/*`) Mini Appga ketadi. Polling va alohida `WEB_PORT` serveri faqat kompyuterda (webhook yoʻq) ishlaydi (`src/index.js`).
- **Ombor:** `src/store.js` — xotirada, oʻzgarishlar Supabasega yoziladi (`src/supabase.js`, SQL: `docs/supabase.sql`). Supabase berilmasa fayl. Mini App `store` usullaridan foydalanadi, massivga toʻgʻridan-toʻgʻri murojaat faqat oʻqish uchun (`store.db.orders|payments|ledger`).
- **Bir vaqtda bitta buyurtma:** `store.hasProcessing(userId)` — bot ham, Mini App ham shuni tekshiradi (avvalgi «ikkita buyurtma» cheklovi yoʻq).
- **Narx va qaytarim:** `config.deckPrice(slides)` (butun taqdimot 5 000, slayd soniga bogʻliq emas) va `service.shortfallRefund(order, finalSlides)` — bot ham, Mini App ham shuni ishlatadi. Tahrir faqat botda (3 000).
- **Qoraqalpoq tili:** botda ichki kod `kaa`; AI toʻgʻridan-toʻgʻri qoraqalpoqcha yozadi (`LANG_RULES.kaa`), keyin `src/qq.js` imlo tuzatadi (`a'` → `á`) va qolib ketgan oʻzbekcha belgi/kirill boʻlsa bir marta qayta yozdiradi. **Tarjima + lugʻat usuli (`translateDeckToQq`, `glossary.js`) olinmadi** (egasi toʻgʻridan-toʻgʻri usulni tanladi). API tashqarisida til kodi **`qq`** boʻlib qoladi (Mini App oʻzgarishsiz ishlaydi), server ichida `kaa` ga oʻtkaziladi (`src/orders.js`: `toInternalLang`/`toPublicLang`).
- **Koʻrinish (20 xil):** Mini App 2-bosqichida tanlanadi (`style`), namunalar rasmi `/previews/<rang>.jpg`.
- Boshqa tuzatishlar: chek adminga yetmasa toʻlov «pending» da qotib qolmaydi (502, qayta yuborish mumkin); chek rasmi sarlavhasi tekshiriladi; fayl yuklash 4 MB va bir vaqtda bittadan; buzuq `%` manzil 404; 413 javobi.

## 2. Fayllar
| Fayl | Vazifasi |
|---|---|
| `src/web.js` | `/api/*` va statik fayllar. `createWebHandler({store, bot})` → `(req,res)`; `createWebServer` (kompyuter uchun) |
| `src/orders.js` | Buyurtma: tekshiruv, pul yechish, fonda yaratish, qaytarish, chatga yuborish |
| `src/webauth.js` | Telegram `initData` imzosini tekshirish |
| `miniapp/` | Interfeys (oddiy JS, qurish bosqichi yoʻq): `index.html`, `app.js`, `style.css` |
| `src/qq.js` | Qoraqalpoq imlo tuzatish va begona belgi tekshiruvi |
| `src/supabase.js`, `docs/supabase.sql` | Doimiy ombor |
| `scripts/test-*.js` | `test:web`, `test:ui`, `test:qq`, `test:store`, `test`, `test:webhook`, `test:layouts`, `test:research` |

## 3. Ombor va buyurtma maydonlari
Foydalanuvchi, buyurtma, toʻlov, daftar yozuvlari `bot_docs (kind, id, data jsonb)` jadvalida. Usullar: `ensureUser, getUser, setProfile, charge, credit, refund, addOrder, updateOrder, getOrder, addPayment, getPayment, updatePayment, approvePayment, rejectPayment, hasProcessing`. Yozuvni oʻzgartirgan har bir usul `_mark` chaqiradi — **ombor ichidagi obyektlarni `store.js` dan tashqarida oʻzgartirmang**, aks holda Supabasega yozilmaydi.

Buyurtma: `id, userId, type:'deck', source:'miniapp', topic, slides, finalSlides, lang (ichkarida kaa), color, style, price, status('processing'|'done'|'failed'), deck, error, deliveryError, lastSentAt, createdAt`.
Toʻlov: `id, userId, amount, status('waiting_receipt'|'pending'|'approved'|'rejected'), kind:'photo', source:'miniapp', createdAt`.

## 4. API shartnomasi
Hamma soʻrov: `Authorization: tma <Telegram.WebApp.initData>` (faqat mahalliy sinashda `DEV_AUTH=1` bilan `x-dev-user: <id>`). Xato javobi: `{error, message, ...}`.
**Oʻzgargan/qoʻshilgan joylar qalin bilan:**

| Soʻrov | Tana | Javob |
|---|---|---|
| `GET /api/me` | — | `{user:{id,name,username,balance,profile,profileMissing}, config:{priceSlide,priceEdit,minTopup,maxTopup,minSlides,maxSlides,maxLecture,langs,colors[{key,label,hex,dark,soft,tint}], **flat, priceDeck, maxExtract, styles[{key,name}]**}}`. `flat=true` boʻlsa narx **`priceDeck`** (slayd soniga bogʻliq emas); `priceSlide` faqat `flat=false` da. |
| `PUT /api/profile` | `{fullName,group,university,faculty}` | `{user}` |
| `POST /api/extract` | `{name, data(base64)}` **≤ `config.maxExtract` (4 MB)** | `{text, clipped, chars}`; bir vaqtda bitta (429 `busy`) |
| `POST /api/orders` | `{topic,slides,lang(uz\|uzc\|ru\|qq),color,**style?**,lecture?,references?}` — **`style`**: `/api/me` dagi kalit yoki `"random"`, boʻsh boʻlsa `klassik` | `{orderId, price, balance}`; xatolar: 400 `invalid`/`profile`, 402 `balance`(`need`), 409 `busy`, 429 |
| `GET /api/orders` | — | `{orders:[{id,topic,slides,lang,color,**style**,status,price,createdAt,error?}], balance}` (`lang` — `qq`) |
| `POST /api/orders/:id/send` | — | `{ok:true}`, 429 agar <20s |
| `GET /api/payments` | — | `{payments, ledger, balance}` |
| `POST /api/topup` | `{amount}` | `{paymentId, amount, card, holder}` |
| `POST /api/payments/:id/receipt` | `{data: "data:image/(jpeg\|png\|webp);base64,..."}` ≤5MB | `{ok:true}`; **502 `send_failed`** (adminga yetmadi, qayta yuborish mumkin), **503 `no_admin`** |
| `GET /previews/<rang>.jpg` | — | 20 koʻrinish namunasi (statik rasm) |

Tasdiqlash botdagi mavjud `pay:ok:<id>` / `pay:no:<id>` callbacklari orqali: **ularning nomi va maʼnosini oʻzgartirmang.**

## 5. Maʼlum cheklovlar
- Tahrirlash (3 000) faqat botda; Mini Appda yoʻq.
- Qoraqalpoq tili sinov bosqichida: titul yorliqlari (`deck.js`, hozir «Reje», «Orınladı») va matn sifatini ona tili egasi tekshirishi kerak.
- Mini App interfeysi faqat oʻzbek tilida.
- Supabase yozuvlari "yozib-keyin" (write-behind): oʻzgarish ~50 ms ichida yoziladi, oʻchirishdan oldin `store.flush()` chaqiriladi. Faqat **bitta** nusxa (instance) ishlashi kerak.

## 6. Tekshirish
`npm install && npm run test:ui && npm run test:web && npm run test:qq && npm run test:store && npm test && npm run test:layouts && npm run test:research && npm run test:webhook` — hammasi oʻtishi kerak.

## 7. Qoidalar ikki tomon uchun
1. Bir vaqtda **bir xil faylni** tahrirlamang (ayniqsa `index.js`, `bot.js`, `store.js`, `miniapp/app.js`). Kim qaysi faylga tegishini oldindan kelishing.
2. Oʻzgarishlarni **git** orqali (har biri alohida branch) birlashtiring, zip almashish oʻrniga.
3. Kalit va tokenlarni (`.env`) hech qachon repoga yoki zipga qoʻshmang.
