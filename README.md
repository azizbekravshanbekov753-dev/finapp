# 💰 FinApp — Shaxsiy Moliya va Qarz Boshqaruv Ilovasi

Ovozli va matnli kiritish orqali xarajatlar, qarzlar, byudjet va ko'p narsalarni boshqaruvchi veb-ilova + Telegram bot.

---

## 🚀 Ishga tushirish

### 1. Saytni ochish
`finance_dashboard.html` faylini brauzerda oching — shunday oddiy.

Yoki localhost da ishlash uchun:
```
start_server.bat — ikki marta bosing
```
Brauzer avtomatik ochiladi: `http://localhost:8080`

---

### 2. Telegram Botni ishga tushirish

**Birinchi marta:**

1. [@BotFather](https://t.me/BotFather) ga boring → `/newbot` yozing → bot yarating → token oling

2. `.env` fayl yarating (`.env.example` asosida):
```
BOT_TOKEN=sizning_tokeningiz_bu_yerga
```

3. `start_bot.bat` ga ikki marta bosing — bot ishga tushadi!

---

### 3. Sayt + Bot bir akkount

- Saytda ro'yxatdan o'ting
- Botda ham **xuddi shu username va parol** bilan kiring
- Ikkalasida ma'lumotlar sinxron ko'rinadi

---

## ✨ Funksiyalar

| Bo'lim | Tavsif |
|--------|--------|
| 💸 Xarajatlar | Ovoz yoki matn bilan kiritish, kategoriyalar |
| 🤝 Qarzlar | Berilgan/olingan, muddat, eslatmalar |
| 🎯 Maqsadlar | Jamg'arma kopilkasi |
| 💳 Hamyonlar | Naqd, karta, elektron |
| 📊 Byudjet | Oylik limit va nazorat |
| 📈 Analitika | Grafiklar, trend, bashorat |
| 🔄 Takrorlanuvchi | Avtomatik oylik xarajatlar |
| 👥 Guruh bo'lish | Xarajatni do'stlar bilan bo'lish |
| 🤖 Telegram Bot | Sayt bilan sinxron |
| 🌙 Dark/Light | Tema almashtirish |
| 📱 Responsive | Telefon, planshet, kompyuter |

---

## 🛠 Texnologiyalar

- **Frontend:** HTML5, CSS3, JavaScript (vanilla)
- **Ma'lumotlar:** localStorage (brauzer)
- **Bot:** Python, python-telegram-bot
- **Ovoz:** Web Speech API

---

## 📦 Bot uchun kerakli paketlar

```
pip install python-telegram-bot==20.7
```

---

## 🌐 Botni 24/7 ishlatish (Railway)

1. [railway.app](https://railway.app) ga kiring
2. GitHub repo ni ulang
3. Environment Variables ga `BOT_TOKEN` qo'shing
4. Deploy — tayyor!

---

## 📁 Fayl tuzilishi

```
finapp/
├── finance_dashboard.html    # Asosiy sahifa
├── finance_expenses.html     # Xarajatlar
├── finance_debts.html        # Qarzlar
├── finance_budget.html       # Byudjet
├── finance_analytics.html    # Analitika
├── finance_goals.html        # Maqsadlar
├── finance_wallets.html      # Hamyonlar
├── finance_split.html        # Guruh bo'lish
├── finance_settings.html     # Sozlamalar
├── finance_auth.html         # Kirish/Ro'yxat
├── app.js                    # Asosiy JavaScript
├── finance.css               # Stillar
├── bot.py                    # Telegram bot
├── requirements.txt          # Python paketlar
├── .env.example              # Token namunasi
└── start_bot.bat             # Botni ishga tushirish (Windows)
```

---

> ⚠️ **Muhim:** `.env` faylini GitHub ga yuklamang — unda tokeningiz bor!
> `.gitignore` avtomatik bloklaydi.
