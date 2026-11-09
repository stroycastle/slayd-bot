# Prezentatsiya bot

Telegram bot: foydalanuvchi mavzu, til, rang va 20 xil koʻrinishdan birini tanlaydi (xohlasa maʼruza matni va adabiyotlarini yuboradi), bot AI yordamida slaydlarni yozib, tayyor **.pptx** va **PDF** qaytaradi.

- Taqdimot: **5 000 soʻm** (8 ta ham, 30 ta ham bir xil narx), tahrir: **3 000 soʻm** (`.env` dagi `PRICE_DECK`, `PRICE_EDIT` dan oʻzgartiriladi; `PRICE_DECK=0` boʻlsa slayd boshiga `PRICE_SLIDE` olinadi)
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
- Ubuntu server: `sudo apt install -y libreoffice-impress fonts-crosextra-carlito fonts-crosextra-caladea fonts-dejavu`

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

## 5. Kundalik ish

- Foydalanuvchi chek yuborsa, sizga rasm va ✅/❌ tugmalari keladi. Pulni kartangizda tekshirib, ✅ bosasiz.
- `/stat`: foydalanuvchilar, taqdimotlar, tushum. `/qosh <id> <summa>`: balansga qoʻlda pul qoʻshish.
- Xatolik boʻlsa sizga ham xabar keladi.

## 5a. Mini App (veb-ilova)
Bot bilan bir xil serverda ishlaydi (`src/web.js`, `miniapp/`): profil, 3 bosqichli buyurtma (mavzu → til/rang/**20 xil koʻrinish** → maʼruza), tarix, balans va chek yuborish.
- Renderda alohida sozlash shart emas: manzil `RENDER_EXTERNAL_URL`, bot menyusiga «Ilova» tugmasi oʻzi qoʻyiladi.
- Telegram `initData` imzosi har soʻrovda tekshiriladi (`src/webauth.js`). `DEV_AUTH=1` faqat kompyuterda; hostingda bot shunda ishga tushmaydi.
- Pul va buyurtma qoidalari botdagi bilan bir xil (`src/service.js`, `src/store.js` umumiy). Bot va ilovadan bir vaqtda ikkinchi buyurtma berib boʻlmaydi.
- Kompyuterda: `WEB_PORT=3000`, `DEV_AUTH=1`, soʻng `http://localhost:3000/?dev=<telegram-id>`.
- Testlar: `npm run test:web` (API), `npm run test:ui` (interfeys, jsdom).

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
- Rasmlar hozircha yoʻq (slaydlar rasmsiz, vektor shakllar bilan). Rasm qoʻshish uchun alohida rasm manbai (AI rasm yoki stok) kerak.

## Muhim eslatmalar

- **Kalitlarni himoya qiling.** `.env` ichida bot tokeni va AI kaliti bor: uni hech kimga yubormang, chatga tashlamang. Kalit tasodifan oshkor boʻlsa: Telegramda @BotFather → `/revoke`, OpenRouterda kalitni oʻchirib yangisini yarating.
- **AI-detektordan oʻtishga kafolat bermang.** Bot matnni oddiy talaba uslubida yozishga sozlangan, lekin hech qanday detektordan oʻtishni va'da qilib boʻlmaydi. Foydalanuvchilarga ham shunday deb ayting (botning yordam matnida ham shunday yozilgan).
- Adabiyotlar roʻyxati: foydalanuvchi bermasa, AI faqat aniq biladigan mashhur manbalarni yozadi, baribir foydalanuvchi tekshirib olishi kerak. Bot buni eslatadi.
- Bu birinchi versiya: maʼlumot JSON faylda (kichik oqim uchun yetadi, mijoz koʻpaysa PostgreSQL ga oʻtkazish kerak), Click/Payme avtomatik toʻlovi hali yoʻq.
