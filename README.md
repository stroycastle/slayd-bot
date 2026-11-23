# Prezentatsiya bot

Telegram bot: foydalanuvchi mavzu, til, rang va 20 xil koʻrinishdan birini tanlaydi (xohlasa maʼruza matni va adabiyotlarini yuboradi), bot AI yordamida slaydlarni yozib, tayyor **.pptx** va **PDF** qaytaradi.

- Taqdimot: 8–20 slayd **5 000 soʻm**, 21–30 slayd **7 000 soʻm**, tahrir: **3 000 soʻm** (`.env` dagi `PRICE_DECK`, `PRICE_DECK_LARGE`, `DECK_LARGE_FROM`, `PRICE_EDIT` dan oʻzgartiriladi; `PRICE_DECK_LARGE=0` boʻlsa hamma uchun bir xil narx, `PRICE_DECK=0` boʻlsa slayd boshiga `PRICE_SLIDE` olinadi)
- Tillar: oʻzbek (lotin), oʻzbek (kirill), rus, qoraqalpoq (lotin). Qoraqalpoq tilida AI matnini tilni biladigan odam albatta koʻrib chiqsin
- 6 ta rang x **20 xil koʻrinish** (shrift, fon, karta shakli, sarlavha, bezak, titul slaydi har xil: Klassik, Minimal, Zamonaviy, Tungi, Gazeta, Kompaniya, Texno, Yumshoq, Geometrik, Akademik, Jasur, Nafis, Yarim tun, Pastel, Blok, Jurnal, Oyna, Retro, Rasmiy, Tabiat yoki «Tasodifiy»), **18 xil slayd turi**: reja, taʼrif, kartalar, ikki ustun, jadval, jarayon, asosiy fikr, qatorlar, xulosa, adabiyotlar va yangilari: vaqt chizigʻi, markaziy tushuncha (hub), piramida, aylanma jarayon, taqqoslash (VS), katta raqamlar, rangli panel + izohlar, boʻlim sarlavhasi (16+ slaydli taqdimotlarda). AI mavzuga mosini oʻzi tanlaydi. Har slaydga nutq matni (speaker notes) ham yoziladi
- Toʻlov: foydalanuvchi **balansni toʻldiradi** (kartaga oʻtkazib chek yuboradi), siz botda ✅ bosib tasdiqlaysiz
- Xatolik boʻlsa yoki tahrir hech narsa oʻzgartirmasa, pul avtomatik qaytadi

## 1. Oʻrnatish

1. **Node.js 20 yoki yangisi** (nodejs.org, LTS) oʻrnating.
2. Shu papkada terminal oching va yozing: `npm install`
3. Telegramda **@BotFather** → `/newbot` → bot tokenini oling.
4. **AI kaliti.** Hozircha **openrouter.ai** → Keys → kalit yarating, **Credits** boʻlimida hisobni toʻldiring (pulsiz kalit ishlamaydi, bot "402" xatosini beradi). Keyin Claudening oʻz kaliti kerak boʻlsa: **console.anthropic.com** → API Keys.
5. `.env.example` faylini `.env` deb nusxalang va toʻldiring: `BOT_TOKEN`, `OPENROUTER_API_KEY`, `CARD_NUMBER`, `CARD_HOLDER`.
6. `ADMIN_IDS`: botni ishga tushirib, unga `/id` deb yozing, chiqqan raqamni `ADMIN_IDS=` ga qoʻying, botni qayta ishga tushiring. **Bu qilinmasa chekni tasdiqlovchi odam boʻlmaydi.**

### AI manbasini almashtirish

- **Bir nechta OpenRouter kaliti:** `OPENROUTER_API_KEY` ga asosiy kalitni, `OPENROUTER_API_KEYS` ga qolganlarini (vergul bilan) yozing. Birinchi kalitning puli tugasa (402), kalit oʻchsa (401/403) yoki limitga yetsa (429), bot soʻrovni foydalanuvchiga sezdirmasdan keyingi kalit bilan takrorlaydi va adminga xabar yuboradi. Ishlamagan kalit 10 daqiqa (notoʻgʻri kalit 6 soat) chetda turadi, keyin qayta tekshiriladi; hamma kalit ishlamasa, baribir hammasi sinab koʻriladi. Adminlar `/ai` buyrugʻi bilan har bir kalit holati va qoldigʻini koʻradi.
- **Zaxira modellar:** `OPENROUTER_FALLBACK_MODELS` ga modellarni vergul bilan yozing. Asosiy model band (429), xato yoki tushunarsiz javob bersa, bot kutib oʻtirmasdan keyingisiga oʻtadi. Bepul (`:free`) modellar tez-tez band boʻladi, shuning uchun ularda foydali. Kalit/hisob xatolari (401/402/403) modelni almashtirmaydi.
- **Yangi maʼlumot:** AI xotirasi eskirgan (masalan 2024-yilgacha), shuning uchun promptga bugungi sana beriladi va har raqam yili bilan yozilishi talab qilinadi. Maʼruza matni berilmagan boʻlsa, taqdimotdan oldin mavzu boʻyicha yangi manbalar olinadi (kalitsiz Vikipediya; `TAVILY_API_KEY` yozilsa, tavily.com veb-qidiruvi: oyiga 1000 ta bepul) va AIga beriladi. AI ularni adabiyotlar roʻyxatiga ham yozishi mumkin (murojaat sanasi bilan). Oʻchirish: `WEB_RESEARCH=0`. Qidiruv ishlamasa, taqdimot baribir yoziladi. Haqiqiy veb-qidiruv (Tavily) Vikipediyadan ancha yangi raqamlar beradi. Log da `🔎 N ta yangi manba` qatori koʻrinadi.
- Bot qaysi AI ishlatayotganini ishga tushganda yozadi: `🤖 AI: OpenRouter, model ...`
- `OPENROUTER_MODEL` ni oʻzgartirib modelni almashtirasiz. `anthropic/claude-sonnet-5.5` sifatli; `google/gemini-3.8-flash` arzonroq, lekin sifati va oʻzbekcha matni pastroq boʻlishi mumkin, avval sinab koʻring.
- Claudening oʻz kaliti kelganda `.env` ga `ANTHROPIC_API_KEY=...` yozing va botni qayta ishga tushiring: bot avtomatik Claudega oʻtadi, kodga tegish shart emas. Majburlash uchun `AI_PROVIDER=openrouter` yoki `anthropic`.
- Taxminiy xarajat (Sonnet 5.5, OpenRouter): bitta 15 slaydli taqdimot taxminan 0,05–0,10 dollar. Narxlar oʻzgarib turadi, openrouter.ai/models dan tekshiring.

## 2. Sinab koʻrish (pulsiz)

`.env` da `MOCK_AI=1` qiling va `npm start` ni bosing. Bot haqiqiy AI ishlatmasdan namuna matn bilan ishlaydi, shu bilan butun oqimni (buyurtma, toʻlov, tahrir) tekshirib koʻrasiz. Tayyor boʻlgach `MOCK_AI=0` qilib, kalitni qoʻying.

Qoʻshimcha: `npm test` (butun oqimni Telegramsiz tekshiradi), `npm run test:ai` (OpenRouter bilan ishlash qismini soxta server bilan tekshiradi), `npm run sample` (6 xil rang/til namunasini `out/` papkasiga chiqaradi). `npm run test:layouts` (barcha slayd turlarini 4 til va 6 rangda yigʻib tekshiradi). `npm run test:research` (sana va yangi manba qismini soxta serverlar bilan tekshiradi). `node scripts/make-previews.js` (koʻrinish tanlash rasmlarini `assets/previews/` ga qayta yasaydi; LibreOffice, pdftoppm va Pillow kerak; koʻrinishlar oʻzgargandagina).

**Haqiqiy AI bilan birinchi sinov:** `MOCK_AI=0` qilib botni ishga tushiring, Telegramda oʻzingiz balans toʻldiring (`/qosh` bilan oʻzingizga pul qoʻshish mumkin) va 8 slaydli kichik taqdimot buyurting. Matn oʻzbekchada yaxshi chiqayotganini, adabiyotlarda toqqa chiqarilgan manbalar yoʻqligini koʻzdan kechiring.

## 3. PDF uchun LibreOffice

PDF yasash uchun serverda/kompyuterda **LibreOffice** boʻlishi kerak. Boʻlmasa, bot faqat .pptx yuboradi.
- Windows/Mac: libreoffice.org dan oʻrnating, bot oʻzi topadi (topolmasa `.env` da `SOFFICE_PATH` yozing).
- Ubuntu server: `sudo apt install -y libreoffice-impress libreoffice-writer fonts-crosextra-carlito fonts-crosextra-caladea fonts-dejavu fonts-liberation` (referat/kurs ishi PDFi uchun `libreoffice-writer` va Times New Roman oʻrniga `fonts-liberation` kerak)

## 4. Serverga qoʻyish (Ubuntu VPS)

```
npm install
npm install -g pm2
pm2 start src/index.js --name slayd-bot
pm2 save
pm2 startup
```

### Render (kompyutersiz, GitHub orqali)

Repoda `Dockerfile` bor (Node + LibreOffice). Render uni oʻzi quradi.
- Muhit oʻzgaruvchilari (Renderning Environment boʻlimida, kodda emas): `BOT_TOKEN`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `ADMIN_IDS`, `CARD_NUMBER`, `CARD_HOLDER`. `RENDER_EXTERNAL_URL` ni Render oʻzi beradi, bot shuning uchun avtomatik **webhook** rejimiga oʻtadi (`WEBHOOK_URL` yozish shart emas).
- **Bepul reja faqat sinash uchun:** 15 daqiqa jim tursa uxlaydi (birinchi xabarga ~1 daqiqa kech javob beradi), fayllar har qayta ishga tushganda oʻchadi, yaʼni **balans va buyurtmalar yoʻqoladi**. Haqiqiy mijozlarga pul tashlatmang.
- Xotira kichik boʻlsa PDF yasash jarayonni oʻchirib qoʻyishi mumkin: shunda `DISABLE_PDF=1` qoʻying (faqat .pptx boradi).
- **Haqiqiy ish uchun pullik reja** (Starter) va **Disk**: Disk Mount Path `/data` (bot maʼlumotni shu yerda saqlaydi). Disk ulangach balanslar saqlanib qoladi.

Bot oʻchib-yonib turishi uchun pm2 kerak. **`data/` papkasini muntazam zaxiralang**: balanslar va buyurtmalar shu yerda (`data/db.json`).

### Bot uxlab qolmasligi (Render bepul rejasi)
Render bepul rejasida xizmat 15 daqiqa **tashqaridan** HTTP soʻrov kelmasa uxlaydi, keyingi foydalanuvchi 30–60 soniya kutadi. Botning Telegramga yuborgan xabari bunga yordam bermaydi (u chiqish trafigi), shuning uchun bot har 5 daqiqada **oʻz manziliga** (`/healthz`) yengil soʻrov yuboradi (`src/keepalive.js`, `KEEP_ALIVE_MIN=5`, 0 — oʻchirish).
- Bu faqat uygʻoq xizmatni uygʻoq saqlaydi. Agar xizmat baribir uxlab qolsa (masalan, Render qayta ishga tushirsa), uni Telegram xabari uygʻotadi. Qoʻshimcha ishonch uchun tashqi bepul kuzatuvchi (UptimeRobot, 5 daqiqalik HTTP monitor, manzil `…/healthz`) qoʻyish mumkin: u ham uygʻotadi, ham bot oʻchib qolsa xabar beradi.
- Bepul reja oyiga 750 soat beradi (bitta xizmat 24/7 ishlasa ~720–744 soat). Shu hisobda boshqa bepul xizmat boʻlmasligi kerak.
- Sinov: `npm run test:keepalive`.

## 5. Kundalik ish

- Foydalanuvchi chek yuborsa, sizga rasm va ✅/❌ tugmalari keladi. Pulni kartangizda tekshirib, ✅ bosasiz.
- `/stat`: foydalanuvchilar, taqdimotlar, tushum, bugun/7/30 kunlik daromad. `/qosh <id> <summa> [izoh]` va `/ayir <id> <summa> [izoh]`: balansni qoʻlda oshirish/kamaytirish (foydalanuvchiga xabar boradi, balans manfiy boʻlmaydi). `/user <id yoki @username>`: foydalanuvchi qisqacha. 
- **Admin paneli (Mini App):** `ADMIN_IDS` dagi foydalanuvchiga Bosh sahifada «Admin paneli» kartasi chiqadi: daromad (bugun/7/30 kun/hammasi), kartaga tushgan toʻlovlar, balanslardagi qoldiq, foydalanuvchilar roʻyxati (qidiruv, saralash), foydalanuvchi sahifasi (harakatlar, buyurtmalar, toʻlovlar) va balansni qoʻshish/ayirish (tasdiq bilan). Daromad = mijozlar sarflagan − qaytarilgan; admin qoʻshgan va referal bonuslari haqiqiy pul emas, alohida koʻrsatiladi. API: `/api/admin/*` (faqat admin, boshqalarga 403).
- Xatolik boʻlsa sizga ham xabar keladi.

## 5a. Mini App (veb-ilova)
Bot bilan bir xil serverda ishlaydi (`src/web.js`, `miniapp/`): profil, 3 bosqichli buyurtma (mavzu → til/rang/**20 xil koʻrinish** → maʼruza), tarix, balans va chek yuborish.
- Renderda alohida sozlash shart emas: manzil `RENDER_EXTERNAL_URL`, bot menyusiga «Ilova» tugmasi oʻzi qoʻyiladi.
- Telegram `initData` imzosi har soʻrovda tekshiriladi (`src/webauth.js`). `DEV_AUTH=1` faqat kompyuterda; hostingda bot shunda ishga tushmaydi.
- Pul va buyurtma qoidalari botdagi bilan bir xil (`src/service.js`, `src/store.js` umumiy). Bot va ilovadan bir vaqtda ikkinchi buyurtma berib boʻlmaydi.
- Kompyuterda: `WEB_PORT=3000`, `DEV_AUTH=1`, soʻng `http://localhost:3000/?dev=<telegram-id>`.
- **Referal dasturi:** har bir foydalanuvchining havolasi `https://t.me/<bot>?start=ref_<id>` (botda «🎁 Doʻst taklif qilish» yoki `/referal`, Ilovada Bosh sahifadagi karta). Havola orqali kelgan yangi odam taklif qilganga bogʻlanadi (faqat xizmatdan hali foydalanmagan, oʻzini va doirani taqiqlaydi). U balansini toʻldirib, admin tasdiqlagach, taklif qilganga summaning `REFERRAL_PERCENT` foizi (10, 0 — oʻchiq) bonus boʻlib tushadi, har tasdiqlangan toʻlovdan. Bonus faqat haqiqiy toʻlovdan keyin beriladi.
- **Promo-kod:** foydalanuvchi botda `/promo KOD` yoki Ilovada Balans sahifasidagi «Promo-kod» maydoniga kodni yozadi va balansiga bonus (odatda `PROMO_AMOUNT`=3000 soʻm) tushadi. Har foydalanuvchi butun umri davomida faqat bitta promo-kod ishlata oladi; avtomatik «xush kelibsiz» bonusi yoʻq. Admin kod yaratadi: botda `/yangipromo [KOD] [summa] [limit]` (kod boʻsh qolsa tasodifiy, limit 0 — cheksiz, 1 — bir martalik kod), `/promolar`, `/promooff KOD`, `/promoon KOD`; yoki Admin panelidagi «Promo» tabida. Kod tanlab topilmasligi uchun 5 ta xato urinishdan keyin foydalanuvchi 15 daqiqaga bloklanadi. **Kod egasi (hamkor):** `/promoegasi KOD ID [bonus]` — kod orqali kirgan har bir yangi foydalanuvchi uchun egasining balansiga bonus (odatda `PROMO_OWNER_BONUS`=10000 soʻm) qoʻshiladi va unga «1 users have been added through your KOD promo code…» xabari boradi; ID oʻrniga 0 — olib tashlash. Egasi oʻz kodini ishlatsa, bonus berilmaydi.
- **Baholash (1–5 ⭐):** taqdimot/tahrir tayyor boʻlgach bot «Natija qanday chiqdi?» deb 1–5 yulduz tugmalarini yuboradi; Ilovada Tarix sahifasida ham baholash va oʻzgartirish mumkin. 1–2 yulduz adminga darhol xabar boʻlib boradi. Admin panelida: oʻrtacha baho, 1–5 boʻyicha taqsimot (davrlar boʻyicha) va soʻnggi past baholar.
- **Maxfiylik siyosati:** `miniapp/privacy.html` → `https://<xizmat>/privacy.html` (oʻzbekcha va ruscha). URLni @BotFather da botga ulang. Foydalanuvchi murojaati/oʻchirish soʻrovi: botda `/murojaat <matn>` (adminga boradi).
- **Referat va kurs ishi:** botdagi «📄 Referat / Kurs ishi» tugmasi (yoki `/referat`) Ilovani ochadi. Referat 8–20 bet (`PRICE_REFERAT`, 8 000 soʻm), kurs ishi 20–40 bet (`PRICE_KURS`, 20 000 soʻm); narx betlar soniga bogʻliq emas. Natija .docx va PDF: titul varagʻi (profilingizdan), mundarija (haqiqiy bet raqamlari bilan), kirish, boblar/paragraflar, xulosa, adabiyotlar; A4, Times New Roman 14, 1,5 oraliq, chekkalar chap 3 / oʻng 1,5 / tepa-past 2 sm. Matn ketma-ket yoziladi: reja → har bir band alohida AI soʻrovi (`DOC_CONCURRENCY`) → adabiyotlar. Foydalanuvchi maʼruza matni va oʻz adabiyotlarini bersa, shular ishlatiladi. Matnda havola raqamlari ([1]) yoʻq; AI adabiyotlari faqat aniq mavjud manbalar bilan cheklangan, baribir foydalanuvchi tekshirishi kerak. AI vaqtincha band (429) yoki javobi uzilib qolsa, har bir band 3 martagacha, kutib (`DOC_RETRY_MS`, sukut 8 soniya), qayta uriniladi. Xato boʻlsa pul toʻliq qaytadi; matn rejaning 75 foizidan kam chiqsa, yetishmagan ulushi qaytariladi. Tayyorlanish: referat ~3–8, kurs ishi ~6–15 daqiqa. Bepul OpenRouter kalitida kunlik soʻrov chegarasi tez tugaydi (kurs ishi ~10–15 soʻrov): haqiqiy mijozlar boʻlganda hisobga ~10 dollar qoʻying.
- **Himoyaga tayyorgarlik:** tayyor taqdimot uchun oʻqituvchi beradigan savollar (`DEFENSE_QUESTIONS`, 12 ta), namunaviy javoblar va mashq rejimi. Ilovada «Tarix» → taqdimot ostidagi «Himoya savollari» tugmasi; narxi `PRICE_DEFENSE` (2 000 soʻm, 0 — bepul). Xato boʻlsa yoki bot oʻchib qolsa pul qaytariladi; tayyor boʻlgach botdan «🎓 Ochish» tugmali xabar keladi. Savollar buyurtma bilan birga omborda saqlanadi, qayta koʻrish bepul.
- **Narx pogʻonalari:** taqdimot 8–20 slayd — `PRICE_DECK` (5 000 soʻm), 21–30 slayd — `PRICE_DECK_LARGE` (7 000 soʻm, `DECK_LARGE_FROM`=21 dan). `PRICE_DECK_LARGE=0` — hamma uchun bir xil narx; `PRICE_DECK=0` — slayd boshiga (`PRICE_SLIDE`). Bot va Ilovada narx slayd soniga qarab koʻrsatiladi; pulni qaytarish qoidasi yangi narxdan hisoblanadi.
- **Admin nazorati (`src/watchdog.js`):** (1) chek yuborilgan, lekin admin hali tasdiqlamagan toʻlov boʻlsa, `PAY_REMIND_MIN` (2) daqiqadan keyin va har 2 daqiqada adminga chek rasmi bilan «✅ Tasdiqlash / ❌ Rad etish» tugmali eslatma boradi (eskisi oʻchadi; `PAY_REMIND_UNTIL_MIN`=30 daqiqadan keyin toʻxtaydi; hal boʻlgach tugmalar olib tashlanadi). (2) OpenRouter hisobida qoldiq `LOW_CREDIT_USD` ($2) dan tushsa ogohlantirish (12 soatda 1 marta, `CREDIT_CHECK_MIN`=60 daqiqada tekshiriladi; 0 — oʻchiq). (3) Har kuni `BACKUP_HOUR` (03:00, `TZ_OFFSET_H`=5 vaqti) dan keyin butun baza `.json.gz` fayl sifatida ADMIN_IDS ga yuboriladi (`BACKUP=0` — oʻchiq); hozir kerak boʻlsa, admin botda `/backup` deydi. Fayl juda katta (>40 MB) boʻlsa, tayyor ish matnlarisiz «yengil» nusxa yuboriladi. Faylni xavfsiz joyda saqlang: unda foydalanuvchilar maʼlumoti bor.
- **Namuna:** `/start` dan keyin «🖼 Namuna koʻrish» tugmasi chiqadi (yoki `/namuna`): `assets/previews/` dagi koʻrinishlar rasmlari (3 rang) albom qilib yuboriladi. Bepul, bonussiz; ketma-ket bosishdan 8 soniyalik himoya bor.
- **Matn sifati (`src/uzfix.js`, `completeDeck` in `src/ai.js`):** oʻzbekcha (lotin) matnda AI yozgan oddiy apostrof avtomatik rasmiy imloga keltiriladi (o'zbek → oʻzbek, ma'no → maʼno; taqdimot, tahrir, himoya savollari, referat/kurs ishi). AI soʻralganidan 2 va undan koʻp slayd kam yozsa yoki javobi kesilsa (xulosa va adabiyotlarsiz), yetishmayotgani qoʻshimcha soʻrov bilan toʻldiriladi (`DECK_COMPLETE=0` — oʻchiq). Rasmli slaydlar taxminan har ikkinchi slayd (ketma-ket emas, 8 tagacha). Kartalardagi matn katta harfda yoziladi (uzun matn oldingidek oʻzi kichrayadi).
- Testlar: `npm run test:web` (API), `npm run test:ui` (interfeys, jsdom), `npm run test:docs` (referat/kurs ishi: matn, .docx/PDF, pul qoidalari, Ilova), `npm run test:defense` (himoya savollari AI qismi), `npm run test:admin` (admin paneli, referal, maxfiylik sahifasi), `npm run test:promo` (promo-kodlar va yulduzcha baholash), `npm run test:watchdog` (narx pogʻonalari, chek eslatmasi, hisob ogohlantirishi, baza nusxasi, namuna), `npm run test:quality` (oʻzbekcha imlo, kam chiqqan slaydlarni toʻldirish, rasmli slaydlar soni).

## 5b. Doimiy ombor (Supabase)
Renderning bepul rejasida disk vaqtinchalik: restartda balanslar, profillar va tarix oʻchadi. Supabase buni hal qiladi.
1. supabase.com → yangi loyiha. **SQL Editor** ga `docs/supabase.sql` ni qoʻyib *Run* bosing (jadval `bot_docs`, ochiq kalitdan yopilgan).
2. **Project Settings → API Keys** dan *Project URL* va **secret** (yoki `service_role`) kalitini oling.
3. Renderda `SUPABASE_URL` va `SUPABASE_SERVICE_KEY` qoʻshing. Boshqa hech narsa kerak emas.
Kalit faqat serverda turadi, mini ilovaga berilmaydi. Bot yoqilganda hamma maʼlumotni oʻqiydi; oʻqiy olmasa, boʻsh ombor bilan ishga tushmaydi (balanslar ustiga yozilib ketmasligi uchun). Oʻzgarishlar darhol yoziladi, oʻchirishdan oldin ham saqlanadi.
Sinov: `npm run test:store`. Supabase bepul loyihasi uzoq vaqt ishlatilmasa pauza boʻladi; bot har kuni ishlasa muammo yoʻq.

## 6. Moslash

- Narxlar, karta: `.env`
- Matn uslubi va "insoniy" yozish qoidalari: `src/ai.js` (`STYLE_RULES`)
- Ranglar: `src/deck.js` (`PALETTES`), slayd koʻrinishi ham shu faylda
- Yangi koʻrinish qoʻshish: `src/styles.js` dagi `STYLES` roʻyxatiga bir qator (shrift, fon, karta, belgi, sarlavha, bezak, pastki qator, titul); yangi karta/belgi/bezak/titul shakli kerak boʻlsa `src/deck.js` dagi `CARDS`, `badge`, `DECO`, `COVERS`. Keyin `npm run test:layouts` va `node scripts/make-previews.js`.
- Yangi slayd turi qoʻshish: `src/deck.js` da chizish funksiyasi + `LAYOUTS` + `DRAW` + `normalizeDeck` dagi zaxira qoida, `src/ai.js` dagi `LAYOUT_GUIDE`; keyin `npm run test:layouts`.
- **Slaydlarga rasm:** AI taxminan har uchinchi slaydni «photo» turida yozadi (joy, bino, shaxs, hayvon kabi aniq suratga olinadigan mavzu) va inglizcha qidiruv soʻzi (`imageQuery`) beradi. Rasmli slaydlarni AI emas, kod belgilaydi: AI har slaydga ixtiyoriy `imageQuery` yozadi, boʻlmasa kichik qoʻshimcha soʻrov bilan olinadi; mos (2–4 izohli) slaydlar taqdimot boʻylab tekis taqsimlanib rasmli turga oʻtadi (taxminan har uchinchisi, 6 tagacha). Bot avval Vikipediya (Wikimedia Commons, kalitsiz) dan rasm qidiradi; ixtiyoriy zaxira — Pexels (`PEXELS_API_KEY`; hozir Pexels yangi bepul kalit bermayapti, kalitsiz ham ishlayveradi). Bot ishga tushganda logda `🖼 Rasm qidiruvi ishlayapti` yoki sababi bilan ogohlantirish chiqadi, har buyurtmadan keyin `🖼 Rasmlar: N/M slaydga topildi`. Faqat CC0, CC BY, CC BY-SA va public domain litsenziyali fayllar olinadi (NC/ND olinmaydi); muallif va litsenziya slaydda rasm ostida yoziladi. Rasm topilmasa yoki yuklanmasa, slayd oddiy (rasmsiz) koʻrinishda chiqadi va buyurtma baribir bajariladi; narx oʻzgarmaydi. Mini Appda «Slaydlarga rasm qoʻshish» tugmasi (sukut boʻyicha yoqiq); botdagi buyurtmalarda rasmlar yoqiq. Oʻchirish: `IMAGES=0`. Xavfsizlik: faqat `upload.wikimedia.org` va `images.pexels.com` dan https orqali yuklanadi, yoʻnaltirishlar tekshiriladi, hajmi 4 MB gacha, turi baytlardan tekshiriladi. Sinov rejimida (`MOCK_AI=1`) tarmoqqa chiqilmaydi (`MOCK_IMAGES=1` bilan yoqiladi). Tekshiruv: `npm run test:images`.

## Muhim eslatmalar

- **Kalitlarni himoya qiling.** `.env` ichida bot tokeni va AI kaliti bor: uni hech kimga yubormang, chatga tashlamang. Kalit tasodifan oshkor boʻlsa: Telegramda @BotFather → `/revoke`, OpenRouterda kalitni oʻchirib yangisini yarating.
- **AI-detektordan oʻtishga kafolat bermang.** Bot matnni oddiy talaba uslubida yozishga sozlangan, lekin hech qanday detektordan oʻtishni va'da qilib boʻlmaydi. Foydalanuvchilarga ham shunday deb ayting (botning yordam matnida ham shunday yozilgan).
- Adabiyotlar roʻyxati: foydalanuvchi bermasa, AI faqat aniq biladigan mashhur manbalarni yozadi, baribir foydalanuvchi tekshirib olishi kerak. Bot buni eslatadi.
- Bu birinchi versiya: maʼlumot JSON faylda (kichik oqim uchun yetadi, mijoz koʻpaysa PostgreSQL ga oʻtkazish kerak), Click/Payme avtomatik toʻlovi hali yoʻq.
