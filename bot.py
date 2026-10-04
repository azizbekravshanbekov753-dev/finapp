# -*- coding: utf-8 -*-
"""
FinApp Telegram Bot — API orqali ishlaydi
server.py bilan bir xil ma'lumotlar bazasidan foydalanadi
"""

import os, re, time, logging, requests
from datetime import datetime, date, timedelta
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder, ContextTypes,
    ConversationHandler, CommandHandler,
    MessageHandler, CallbackQueryHandler, filters,
)

# ── Sozlamalar ────────────────────────────────────
TOKEN    = os.environ.get("BOT_TOKEN", "")
API_URL  = os.environ.get("API_URL", "").rstrip("/")
API_KEY  = os.environ.get("API_KEY", "finapp2024secret")

# Token tekshirish
if not TOKEN:
    env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env_file):
        for line in open(env_file):
            line = line.strip()
            if line.startswith("BOT_TOKEN="):
                TOKEN = line.split("=", 1)[1].strip().strip('"').strip("'")
            if line.startswith("API_URL="):
                API_URL = line.split("=", 1)[1].strip().strip('"').strip("'").rstrip("/")
            if line.startswith("API_KEY="):
                API_KEY = line.split("=", 1)[1].strip().strip('"').strip("'")

if not TOKEN:
    print("❌ BOT_TOKEN topilmadi! .env faylga yozing: BOT_TOKEN=tokeningiz")
    exit(1)

if not API_URL:
    print("❌ API_URL topilmadi! .env faylga yozing: API_URL=https://sizning-railway-url.railway.app")
    exit(1)

logging.basicConfig(format="%(asctime)s [%(levelname)s] %(message)s", level=logging.INFO)
log = logging.getLogger(__name__)

# ── Conversation states ───────────────────────────
(
    ST_AUTH_CHOOSE,
    ST_REG_USER, ST_REG_PASS, ST_REG_PASS2,
    ST_LOG_USER, ST_LOG_PASS,
    ST_MAIN,
    ST_EXP_NAME, ST_EXP_AMT, ST_EXP_CAT, ST_EXP_NOTE,
    ST_DEBT_TYPE, ST_DEBT_WHY, ST_DEBT_AMT,
    ST_DEBT_PERSON, ST_DEBT_DAYS, ST_DEBT_NOTE,
) = range(17)

# ── Kategoriyalar ─────────────────────────────────
CATS = [
    ("food","🍔","Ovqat"), ("transport","🚌","Transport"),
    ("entertainment","🎮","Dam olish"), ("health","💊","Sog'liq"),
    ("shopping","🛍️","Xarid"), ("education","📚","Ta'lim"),
    ("utilities","💡","Kommunal"), ("other","📌","Boshqa"),
]
CAT_DICT = {k:(e,n) for k,e,n in CATS}

# ════════════════════════════════════════════════
# API QATLAMI
# ════════════════════════════════════════════════
HEADERS = {"X-API-Key": API_KEY, "Content-Type": "application/json"}

def api(method, path, **kwargs):
    """API ga so'rov yuborish"""
    url = f"{API_URL}{path}"
    try:
        r = getattr(requests, method)(url, headers=HEADERS, timeout=10, **kwargs)
        return r.json()
    except Exception as e:
        log.error(f"API xato: {e}")
        return {"ok": False, "error": str(e)}

def api_register(username, password):
    return api("post", "/api/register", json={"username": username, "password": password})

def api_login(username, password):
    return api("post", "/api/login", json={"username": username, "password": password})

def api_get_expenses(uid):
    return api("get", f"/api/expenses?userId={uid}")

def api_add_expense(uid, desc, amount, cat, note=""):
    return api("post", "/api/expenses", json={
        "userId": uid, "description": desc,
        "amount": amount, "category": cat,
        "note": note, "source": "telegram",
    })

def api_del_expense(uid, item_id):
    return api("delete", f"/api/expenses/{item_id}?userId={uid}")

def api_get_debts(uid):
    return api("get", f"/api/debts?userId={uid}")

def api_add_debt(uid, dtype, desc, amount, person="", days=0, note=""):
    deadline = (date.today() + timedelta(days=days)).isoformat() if days > 0 else ""
    return api("post", "/api/debts", json={
        "userId": uid, "type": dtype, "description": desc,
        "amount": amount, "person": person,
        "deadline": deadline, "daysCount": days,
        "note": note, "source": "telegram",
    })

def api_mark_paid(uid, item_id):
    return api("patch", f"/api/debts/{item_id}?userId={uid}",
               json={"paid": True, "paidAt": datetime.utcnow().isoformat()+"Z"})

# ════════════════════════════════════════════════
# YORDAMCHILAR
# ════════════════════════════════════════════════
def fmt(n):
    try: return f"{int(n):,}".replace(",", " ") + " so'm"
    except: return str(n) + " so'm"

def parse_amount(txt):
    txt = re.sub(r"[\s,]", "", txt.strip())
    mul = 1
    if re.search(r"ming|min|k\b", txt, re.I): mul = 1000; txt = re.sub(r"[^\d.]","",txt)
    elif re.search(r"mln|million", txt, re.I): mul = 1000000; txt = re.sub(r"[^\d.]","",txt)
    else: txt = re.sub(r"[^\d.]","",txt)
    try:
        n = float(txt) * mul
        return n if n > 0 else None
    except: return None

# ════════════════════════════════════════════════
# KLAVIATURALAR
# ════════════════════════════════════════════════
def kb_auth():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🔐 Kirish (akkount bor)",       callback_data="do_login")],
        [InlineKeyboardButton("📝 Ro'yxatdan o'tish (yangi)", callback_data="do_reg")],
    ])

def kb_main():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("💸 Xarajat qo'shish",  callback_data="m_exp"),
         InlineKeyboardButton("🤝 Qarz qo'shish",     callback_data="m_debt")],
        [InlineKeyboardButton("📊 Dashboard",          callback_data="m_dash"),
         InlineKeyboardButton("🔔 Bildirishnomalar",   callback_data="m_notif")],
        [InlineKeyboardButton("📋 Xarajatlar",         callback_data="m_explist"),
         InlineKeyboardButton("📋 Qarzlar",            callback_data="m_debtlist")],
        [InlineKeyboardButton("⚙️ Sozlamalar",          callback_data="m_settings"),
         InlineKeyboardButton("🚪 Chiqish",            callback_data="m_logout")],
    ])

def kb_cats():
    rows, row = [], []
    for k,e,n in CATS:
        row.append(InlineKeyboardButton(f"{e} {n}", callback_data=f"cat_{k}"))
        if len(row)==2: rows.append(row); row=[]
    if row: rows.append(row)
    return InlineKeyboardMarkup(rows)

def kb_debt_type():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🤝 Men BERDIM  (u menga qaytaradi)", callback_data="dt_out")],
        [InlineKeyboardButton("💰 Men OLDIM   (men qaytaraman)",    callback_data="dt_in")],
    ])

def kb_skip(label="⏩ O'tkazib yuborish"):
    return InlineKeyboardMarkup([[InlineKeyboardButton(label, callback_data="skip")]])

# ════════════════════════════════════════════════
# /start
# ════════════════════════════════════════════════
async def cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    ctx.user_data.clear()
    name = update.effective_user.first_name or "Salom"
    await update.message.reply_text(
        f"👋 Xush kelibsiz, <b>{name}</b>!\n\n"
        f"💰 <b>FinApp</b> — Shaxsiy moliya boshqaruvi\n\n"
        f"🌐 Saytda akkountingiz bo'lsa → <b>Kirish</b>\n"
        f"   Saytdagi barcha ma'lumotlar botda ham ko'rinadi!\n\n"
        f"🆕 Yangi foydalanuvchimisiz → <b>Ro'yxatdan o'ting</b>",
        parse_mode="HTML", reply_markup=kb_auth()
    )
    return ST_AUTH_CHOOSE

# ════════════════════════════════════════════════
# AUTH
# ════════════════════════════════════════════════
async def on_auth(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    if q.data == "do_login":
        await q.message.edit_text(
            "🔐 <b>Kirish</b>\n\nUsername kiriting:",
            parse_mode="HTML"
        )
        return ST_LOG_USER
    else:
        await q.message.edit_text(
            "📝 <b>Ro'yxatdan o'tish</b>\n\n"
            "Username tanlang (kamida 3 ta belgi):",
            parse_mode="HTML"
        )
        return ST_REG_USER

# ── Register ──────────────────────────────────────
async def reg_user(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    u = update.message.text.strip().lower()
    if len(u) < 3:
        await update.message.reply_text("❗ Kamida 3 ta belgi. Qayta kiriting:")
        return ST_REG_USER
    ctx.user_data["ru"] = u
    await update.message.reply_text(
        f"✅ <b>{u}</b>\n\n🔐 Parol kiriting (kamida 4 ta belgi):",
        parse_mode="HTML"
    )
    return ST_REG_PASS

async def reg_pass(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    pw = update.message.text.strip()
    if len(pw) < 4:
        await update.message.reply_text("❗ Kamida 4 ta belgi:")
        return ST_REG_PASS
    ctx.user_data["rp"] = pw
    await update.message.reply_text("🔐 Parolni tasdiqlang:")
    return ST_REG_PASS2

async def reg_pass2(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if update.message.text.strip() != ctx.user_data.get("rp"):
        await update.message.reply_text("❌ Parollar mos kelmadi. Qayta kiriting:")
        return ST_REG_PASS
    res = api_register(ctx.user_data["ru"], ctx.user_data["rp"])
    if not res.get("ok"):
        await update.message.reply_text(f"❌ {res.get('error')}\n\nQayta username kiriting:")
        return ST_REG_USER
    ctx.user_data["user"] = res["user"]
    await update.message.reply_text(
        f"🎉 <b>Muvaffaqiyatli ro'yxatdan o'tdingiz!</b>\n\n"
        f"👤 Username: <code>{res['user']['username']}</code>\n\n"
        f"🌐 Saytda ham shu username + parol bilan kiring!\n\n"
        f"Asosiy menyu 👇",
        parse_mode="HTML", reply_markup=kb_main()
    )
    return ST_MAIN

# ── Login ─────────────────────────────────────────
async def log_user(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    ctx.user_data["lu"] = update.message.text.strip().lower()
    await update.message.reply_text("🔐 Parolni kiriting:")
    return ST_LOG_PASS

async def log_pass(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    res = api_login(ctx.user_data["lu"], update.message.text.strip())
    if not res.get("ok"):
        await update.message.reply_text(
            f"❌ {res.get('error')}",
            reply_markup=kb_auth()
        )
        return ST_AUTH_CHOOSE
    ctx.user_data["user"] = res["user"]
    uid = res["user"]["id"]
    exp_r  = api_get_expenses(uid)
    debt_r = api_get_debts(uid)
    exp_c  = len(exp_r.get("data", []))
    debt_c = len(debt_r.get("data", []))
    await update.message.reply_text(
        f"✅ Xush kelibsiz, <b>{res['user']['displayName']}</b>!\n\n"
        f"📊 Sizning ma'lumotlaringiz:\n"
        f"   💸 Xarajatlar: <b>{exp_c} ta</b>\n"
        f"   🤝 Qarzlar: <b>{debt_c} ta</b>\n\n"
        f"Asosiy menyu 👇",
        parse_mode="HTML", reply_markup=kb_main()
    )
    return ST_MAIN

# ════════════════════════════════════════════════
# ASOSIY MENYU
# ════════════════════════════════════════════════
async def on_main(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    user = ctx.user_data.get("user")

    if q.data == "back":
        await q.message.edit_text(
            f"🏠 <b>{user['displayName']}</b> — Asosiy menyu",
            parse_mode="HTML", reply_markup=kb_main()
        )
        return ST_MAIN

    if not user:
        await q.message.edit_text("❌ Iltimos avval kiring!", reply_markup=kb_auth())
        return ST_AUTH_CHOOSE

    if q.data == "m_exp":
        await q.message.edit_text(
            "💸 <b>XARAJAT QO'SHISH</b>\n━━━━━━━━━━━━━━━━━━━\n"
            "1️⃣  <b>Nima uchun xarajat qildingiz?</b>\n\n"
            "Misol: <i>Tushlik, Taksi, Kino, Dori...</i>",
            parse_mode="HTML"
        )
        return ST_EXP_NAME

    if q.data == "m_debt":
        await q.message.edit_text(
            "🤝 <b>QARZ QO'SHISH</b>\n━━━━━━━━━━━━━━━━━━━\n"
            "<b>Qarz turini tanlang:</b>",
            parse_mode="HTML", reply_markup=kb_debt_type()
        )
        return ST_DEBT_TYPE

    if q.data == "m_dash":
        await show_dashboard(q.message, ctx); return ST_MAIN
    if q.data == "m_notif":
        await show_notifs(q.message, ctx); return ST_MAIN
    if q.data == "m_explist":
        await show_exp_list(q.message, ctx); return ST_MAIN
    if q.data == "m_debtlist":
        await show_debt_list(q.message, ctx); return ST_MAIN
    if q.data == "m_settings":
        await show_settings(q.message, ctx); return ST_MAIN
    if q.data == "m_logout":
        name = user["displayName"]
        ctx.user_data.clear()
        await q.message.edit_text(
            f"👋 Xayr, <b>{name}</b>!\n\n/start — qayta kirish",
            parse_mode="HTML"
        )
        return ST_AUTH_CHOOSE

    return ST_MAIN

# ════════════════════════════════════════════════
# XARAJAT — step by step
# ════════════════════════════════════════════════
async def exp_name(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    ctx.user_data["en"] = update.message.text.strip()
    await update.message.reply_text(
        f"💸 <b>XARAJAT</b>: {ctx.user_data['en']}\n━━━━━━━━━━━━━━━━━━━\n"
        f"2️⃣  <b>Qancha pul sarfladingiz?</b>\n\nMisol: <i>15000</i> yoki <i>35 ming</i>",
        parse_mode="HTML"
    )
    return ST_EXP_AMT

async def exp_amt(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    amt = parse_amount(update.message.text)
    if not amt:
        await update.message.reply_text("❗ To'g'ri summa kiriting. Masalan: <b>15000</b>", parse_mode="HTML")
        return ST_EXP_AMT
    ctx.user_data["ea"] = amt
    await update.message.reply_text(
        f"💸 <b>XARAJAT</b>: {ctx.user_data['en']} — {fmt(amt)}\n━━━━━━━━━━━━━━━━━━━\n"
        f"3️⃣  <b>Kategoriyani tanlang:</b>",
        parse_mode="HTML", reply_markup=kb_cats()
    )
    return ST_EXP_CAT

async def exp_cat(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    ctx.user_data["ec"] = q.data.replace("cat_","")
    cat = CAT_DICT.get(ctx.user_data["ec"], ("📌","Boshqa"))
    await q.message.edit_text(
        f"💸 <b>XARAJAT</b>: {ctx.user_data['en']} — {fmt(ctx.user_data['ea'])}\n"
        f"   {cat[0]} {cat[1]}\n━━━━━━━━━━━━━━━━━━━\n"
        f"4️⃣  <b>Izoh?</b> (ixtiyoriy)",
        parse_mode="HTML", reply_markup=kb_skip("⏩ Izoqsiz saqlash")
    )
    return ST_EXP_NOTE

async def exp_note_txt(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    return await _save_exp(update.message, ctx, update.message.text.strip(), edit=False)

async def exp_note_skip(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    return await _save_exp(q.message, ctx, "", edit=True)

async def _save_exp(msg, ctx, note, edit=False):
    user = ctx.user_data["user"]
    res  = api_add_expense(user["id"], ctx.user_data["en"],
                           ctx.user_data["ea"], ctx.user_data["ec"], note)
    if not res.get("ok"):
        text = f"❌ Xatolik: {res.get('error')}"
    else:
        e   = res["item"]
        cat = CAT_DICT.get(e["category"], ("📌","Boshqa"))
        text = (
            f"✅ <b>XARAJAT SAQLANDI!</b>\n━━━━━━━━━━━━━━━━━━━\n"
            f"📝 Nima:      <b>{e['description']}</b>\n"
            f"💵 Summa:     <b>{fmt(e['amount'])}</b>\n"
            f"{cat[0]} Kategoriya: <b>{cat[1]}</b>\n"
            f"📅 Sana:      <b>{e['date']}</b>\n"
            + (f"📎 Izoh:      <i>{note}</i>\n" if note else "") +
            f"\n🌐 Saytda ham ko'rinadi!"
        )
    fn = msg.edit_text if edit else msg.reply_text
    await fn(text, parse_mode="HTML", reply_markup=kb_main())
    return ST_MAIN

# ════════════════════════════════════════════════
# QARZ — step by step
# ════════════════════════════════════════════════
async def debt_type(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    ctx.user_data["dt"] = "debt_out" if q.data=="dt_out" else "debt_in"
    lbl = "🤝 MEN BERDIM" if ctx.user_data["dt"]=="debt_out" else "💰 MEN OLDIM"
    await q.message.edit_text(
        f"🤝 <b>QARZ — {lbl}</b>\n━━━━━━━━━━━━━━━━━━━\n"
        f"2️⃣  <b>Nima uchun?</b>\n\nMisol: <i>Uy uchun, Oziq-ovqat...</i>",
        parse_mode="HTML"
    )
    return ST_DEBT_WHY

async def debt_why(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    ctx.user_data["dw"] = update.message.text.strip()
    await update.message.reply_text(
        f"🤝 <b>QARZ</b>: {ctx.user_data['dw']}\n━━━━━━━━━━━━━━━━━━━\n"
        f"3️⃣  <b>Qancha?</b>\n\nMisol: <i>50000</i> yoki <i>100 ming</i>",
        parse_mode="HTML"
    )
    return ST_DEBT_AMT

async def debt_amt(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    amt = parse_amount(update.message.text)
    if not amt:
        await update.message.reply_text("❗ To'g'ri summa kiriting:")
        return ST_DEBT_AMT
    ctx.user_data["da"] = amt
    q = "Kimga berdingiz?" if ctx.user_data["dt"]=="debt_out" else "Kimdan oldingiz?"
    await update.message.reply_text(
        f"🤝 <b>QARZ</b>: {ctx.user_data['dw']} — {fmt(amt)}\n━━━━━━━━━━━━━━━━━━━\n"
        f"4️⃣  <b>{q}</b>\n\nMisol: <i>Karim, Aka, Do'stim...</i>",
        parse_mode="HTML", reply_markup=kb_skip("⏩ Ismni yozmaslik")
    )
    return ST_DEBT_PERSON

async def debt_person_txt(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    ctx.user_data["dp"] = update.message.text.strip()
    return await _ask_days(update.message, ctx, edit=False)

async def debt_person_skip(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    ctx.user_data["dp"] = ""
    return await _ask_days(q.message, ctx, edit=True)

async def _ask_days(msg, ctx, edit=False):
    q2 = "qaytarishi" if ctx.user_data["dt"]=="debt_out" else "qaytarishingiz"
    text = (
        f"🤝 <b>QARZ</b>: {ctx.user_data['dw']} — {fmt(ctx.user_data['da'])}\n"
        + (f"   👤 {ctx.user_data['dp']}\n" if ctx.user_data.get("dp") else "") +
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"5️⃣  <b>Necha kunda {q2} kerak?</b>\n\nMisol: <i>5</i> yoki <i>14</i>"
    )
    fn = msg.edit_text if edit else msg.reply_text
    await fn(text, parse_mode="HTML", reply_markup=kb_skip("⏩ Muddat belgilashmaslik"))
    return ST_DEBT_DAYS

async def debt_days_txt(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    try: ctx.user_data["dd"] = int(re.sub(r"[^\d]","",update.message.text))
    except: ctx.user_data["dd"] = 0
    return await _ask_note(update.message, ctx, edit=False)

async def debt_days_skip(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    ctx.user_data["dd"] = 0
    return await _ask_note(q.message, ctx, edit=True)

async def _ask_note(msg, ctx, edit=False):
    days = ctx.user_data.get("dd",0)
    dl   = (date.today()+timedelta(days=days)).isoformat() if days>0 else ""
    text = (
        f"🤝 <b>QARZ</b>: {ctx.user_data['dw']} — {fmt(ctx.user_data['da'])}\n"
        + (f"   👤 {ctx.user_data['dp']}\n" if ctx.user_data.get("dp") else "")
        + (f"   📅 Muddat: {dl}\n" if dl else "") +
        f"━━━━━━━━━━━━━━━━━━━\n6️⃣  <b>Izoh?</b> (ixtiyoriy)"
    )
    fn = msg.edit_text if edit else msg.reply_text
    await fn(text, parse_mode="HTML", reply_markup=kb_skip("⏩ Izoqsiz saqlash"))
    return ST_DEBT_NOTE

async def debt_note_txt(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    return await _save_debt(update.message, ctx, update.message.text.strip(), edit=False)

async def debt_note_skip(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    return await _save_debt(q.message, ctx, "", edit=True)

async def _save_debt(msg, ctx, note, edit=False):
    user = ctx.user_data["user"]
    res  = api_add_debt(user["id"], ctx.user_data["dt"],
                        ctx.user_data["dw"], ctx.user_data["da"],
                        ctx.user_data.get("dp",""), ctx.user_data.get("dd",0), note)
    if not res.get("ok"):
        text = f"❌ Xatolik: {res.get('error')}"
    else:
        d   = res["item"]
        lbl = "🤝 Men BERDIM" if d["type"]=="debt_out" else "💰 Men OLDIM"
        text = (
            f"✅ <b>QARZ SAQLANDI!</b>\n━━━━━━━━━━━━━━━━━━━\n"
            f"🔖 Tur:         <b>{lbl}</b>\n"
            f"📝 Nima uchun:  <b>{d['description']}</b>\n"
            f"💵 Summa:       <b>{fmt(d['amount'])}</b>\n"
            + (f"👤 Kim:         <b>{d['person']}</b>\n" if d.get("person") else "")
            + (f"📅 Muddat:      <b>{d['deadline']}</b>\n" if d.get("deadline") else "") +
            f"📅 Sana:        <b>{d['date']}</b>\n"
            + (f"📎 Izoh:        <i>{note}</i>\n" if note else "") +
            f"\n🌐 Saytda ham ko'rinadi!"
        )
    fn = msg.edit_text if edit else msg.reply_text
    await fn(text, parse_mode="HTML", reply_markup=kb_main())
    return ST_MAIN

# ════════════════════════════════════════════════
# KO'RSATISH FUNKSIYALARI
# ════════════════════════════════════════════════
async def show_dashboard(msg, ctx):
    user  = ctx.user_data["user"]
    uid   = user["id"]
    exps  = api_get_expenses(uid).get("data", [])
    debts = api_get_debts(uid).get("data", [])
    td = date.today().isoformat(); mo = td[:7]

    t_today = sum(e["amount"] for e in exps if e.get("date")==td)
    t_month = sum(e["amount"] for e in exps if e.get("date","").startswith(mo))
    t_all   = sum(e["amount"] for e in exps)
    d_out   = [d for d in debts if not d.get("paid") and d.get("type")=="debt_out"]
    d_in    = [d for d in debts if not d.get("paid") and d.get("type")=="debt_in"]
    overdue = [d for d in debts if not d.get("paid") and d.get("deadline") and
               d["deadline"] < td]

    cats = {}
    for e in exps: cats[e.get("category","other")] = cats.get(e.get("category","other"),0)+e["amount"]
    top = sorted(cats.items(), key=lambda x:-x[1])[:3]
    top_txt = "\n".join(
        f"   {CAT_DICT.get(c,('📌','Boshqa'))[0]} {CAT_DICT.get(c,('📌','Boshqa'))[1]}: {fmt(v)}"
        for c,v in top
    ) or "   Hali ma'lumot yo'q"

    await msg.edit_text(
        f"📊 <b>DASHBOARD — {user['displayName']}</b>\n━━━━━━━━━━━━━━━━━━━\n"
        f"💸 <b>Xarajatlar:</b>\n"
        f"   📆 Bugun:  <b>{fmt(t_today)}</b>\n"
        f"   🗓 Bu oy:  <b>{fmt(t_month)}</b>\n"
        f"   📋 Jami:   <b>{fmt(t_all)}</b> ({len(exps)} ta)\n\n"
        f"🤝 <b>Qarzlar:</b>\n"
        f"   📤 Berganlarim: <b>{fmt(sum(d['amount'] for d in d_out))}</b> ({len(d_out)} ta)\n"
        f"   📥 Olganlarim:  <b>{fmt(sum(d['amount'] for d in d_in))}</b> ({len(d_in)} ta)\n"
        + (f"\n⚠️ <b>Muddati o'tgan:</b> {len(overdue)} ta!\n" if overdue else "") +
        f"\n🏆 <b>Top kategoriyalar:</b>\n{top_txt}",
        parse_mode="HTML", reply_markup=kb_main()
    )

async def show_exp_list(msg, ctx):
    exps = api_get_expenses(ctx.user_data["user"]["id"]).get("data", [])[:15]
    if not exps:
        await msg.edit_text("📋 <b>Xarajatlar</b>\n\nHali xarajat yo'q.", parse_mode="HTML", reply_markup=kb_main())
        return
    lines = "".join(
        f"  {CAT_DICT.get(e.get('category','other'),('📌',''))[0]} <b>{e['description']}</b> — {fmt(e['amount'])} <i>({e.get('date','')})</i>\n"
        for e in exps
    )
    await msg.edit_text(f"📋 <b>Xarajatlar ({len(exps)} ta)</b>\n━━━━━━━━━━━━━━━━━━━\n{lines}", parse_mode="HTML", reply_markup=kb_main())

async def show_debt_list(msg, ctx):
    debts = api_get_debts(ctx.user_data["user"]["id"]).get("data", [])[:15]
    if not debts:
        await msg.edit_text("📋 <b>Qarzlar</b>\n\nHali qarz yo'q.", parse_mode="HTML", reply_markup=kb_main())
        return
    lines = "".join(
        f"  {'📤' if d.get('type')=='debt_out' else '📥'}{'✅' if d.get('paid') else '⏳'} "
        f"<b>{d['description']}</b>{(' · '+d['person']) if d.get('person') else ''} — {fmt(d['amount'])}"
        f"{(' · Muddat: '+d['deadline']) if d.get('deadline') and not d.get('paid') else ''}\n"
        for d in debts
    )
    await msg.edit_text(f"📋 <b>Qarzlar ({len(debts)} ta)</b>\n━━━━━━━━━━━━━━━━━━━\n{lines}", parse_mode="HTML", reply_markup=kb_main())

async def show_notifs(msg, ctx):
    debts = api_get_debts(ctx.user_data["user"]["id"]).get("data", [])
    td    = date.today().isoformat()
    alerts = []
    for d in debts:
        if d.get("paid") or not d.get("deadline"): continue
        try: diff = (date.fromisoformat(d["deadline"]) - date.today()).days
        except: continue
        if diff < 0:    alerts.append(f"🚨 <b>{d['description']}</b> — {fmt(d['amount'])} — {abs(diff)} kun kechikdi!")
        elif diff == 0: alerts.append(f"⚠️ <b>{d['description']}</b> — {fmt(d['amount'])} — Bugun muddat!")
        elif diff <= 3: alerts.append(f"📅 <b>{d['description']}</b> — {fmt(d['amount'])} — {diff} kun qoldi")
    txt = "🔔 <b>BILDIRISHNOMALAR</b>\n━━━━━━━━━━━━━━━━━━━\n"
    txt += ("\n".join(alerts) if alerts else "✅ Hamma narsa tartibda!")
    await msg.edit_text(txt, parse_mode="HTML", reply_markup=kb_main())

async def show_settings(msg, ctx):
    user  = ctx.user_data["user"]
    uid   = user["id"]
    exp_c  = len(api_get_expenses(uid).get("data",[]))
    debt_c = len(api_get_debts(uid).get("data",[]))
    await msg.edit_text(
        f"⚙️ <b>SOZLAMALAR</b>\n━━━━━━━━━━━━━━━━━━━\n"
        f"👤 Ism: <b>{user['displayName']}</b>\n"
        f"🔑 Username: <code>{user['username']}</code>\n\n"
        f"📊 Ma'lumotlar:\n"
        f"   💸 Xarajatlar: <b>{exp_c} ta</b>\n"
        f"   🤝 Qarzlar: <b>{debt_c} ta</b>\n\n"
        f"🌐 Sayt bilan sinxron: ✅\n"
        f"   Saytda ham shu akkount bilan kiring",
        parse_mode="HTML", reply_markup=kb_main()
    )

# ════════════════════════════════════════════════
# CANCEL
# ════════════════════════════════════════════════
async def cmd_cancel(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("❌ Bekor qilindi. /start — qayta boshlash")
    ctx.user_data.clear()
    return ConversationHandler.END

# ════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════
def main():
    app = ApplicationBuilder().token(TOKEN).concurrent_updates(True).build()
    conv = ConversationHandler(
        entry_points=[CommandHandler("start", cmd_start)],
        states={
            ST_AUTH_CHOOSE: [CallbackQueryHandler(on_auth, pattern="^(do_login|do_reg)$")],
            ST_REG_USER:  [MessageHandler(filters.TEXT & ~filters.COMMAND, reg_user)],
            ST_REG_PASS:  [MessageHandler(filters.TEXT & ~filters.COMMAND, reg_pass)],
            ST_REG_PASS2: [MessageHandler(filters.TEXT & ~filters.COMMAND, reg_pass2)],
            ST_LOG_USER:  [MessageHandler(filters.TEXT & ~filters.COMMAND, log_user)],
            ST_LOG_PASS:  [MessageHandler(filters.TEXT & ~filters.COMMAND, log_pass)],
            ST_MAIN:      [CallbackQueryHandler(on_main)],
            ST_EXP_NAME:  [MessageHandler(filters.TEXT & ~filters.COMMAND, exp_name)],
            ST_EXP_AMT:   [MessageHandler(filters.TEXT & ~filters.COMMAND, exp_amt)],
            ST_EXP_CAT:   [CallbackQueryHandler(exp_cat, pattern="^cat_")],
            ST_EXP_NOTE:  [
                CallbackQueryHandler(exp_note_skip, pattern="^skip$"),
                MessageHandler(filters.TEXT & ~filters.COMMAND, exp_note_txt),
            ],
            ST_DEBT_TYPE:   [CallbackQueryHandler(debt_type, pattern="^dt_")],
            ST_DEBT_WHY:    [MessageHandler(filters.TEXT & ~filters.COMMAND, debt_why)],
            ST_DEBT_AMT:    [MessageHandler(filters.TEXT & ~filters.COMMAND, debt_amt)],
            ST_DEBT_PERSON: [
                CallbackQueryHandler(debt_person_skip, pattern="^skip$"),
                MessageHandler(filters.TEXT & ~filters.COMMAND, debt_person_txt),
            ],
            ST_DEBT_DAYS: [
                CallbackQueryHandler(debt_days_skip, pattern="^skip$"),
                MessageHandler(filters.TEXT & ~filters.COMMAND, debt_days_txt),
            ],
            ST_DEBT_NOTE: [
                CallbackQueryHandler(debt_note_skip, pattern="^skip$"),
                MessageHandler(filters.TEXT & ~filters.COMMAND, debt_note_txt),
            ],
        },
        fallbacks=[
            CommandHandler("cancel", cmd_cancel),
            CommandHandler("start",  cmd_start),
            CallbackQueryHandler(on_main, pattern="^back$"),
        ],
        allow_reentry=True,
        per_chat=True,
    )
    app.add_handler(conv)
    log.info("="*50)
    log.info("🚀 FinApp Bot ishga tushdi!")
    log.info(f"🌐 API: {API_URL}")
    log.info("="*50)
    app.run_polling(drop_pending_updates=True)

if __name__ == "__main__":
    main()
