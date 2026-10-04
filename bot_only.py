# -*- coding: utf-8 -*-
"""
FinApp Telegram Bot — 24/7
"""
import json, os, re, time, logging
from datetime import datetime, date, timedelta
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder, ContextTypes,
    ConversationHandler, CommandHandler,
    MessageHandler, CallbackQueryHandler, filters,
)

TOKEN = os.environ.get("BOT_TOKEN", "")
if not TOKEN:
    for line in open(".env") if os.path.exists(".env") else []:
        if line.startswith("BOT_TOKEN="):
            TOKEN = line.split("=",1)[1].strip().strip('"').strip("'")

DATA_DIR = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH", os.path.dirname(os.path.abspath(__file__)))
DB_FILE  = os.path.join(DATA_DIR, "fin_db.json")

logging.basicConfig(format="%(asctime)s %(message)s", level=logging.INFO)
log = logging.getLogger(__name__)

# States
(ST_AUTH, ST_REG_U, ST_REG_P, ST_REG_P2,
 ST_LOG_U, ST_LOG_P, ST_MAIN,
 ST_EN, ST_EA, ST_EC, ST_ENOTE,
 ST_DT, ST_DW, ST_DA, ST_DP, ST_DD, ST_DNOTE) = range(17)

CATS = [("food","🍔","Ovqat"),("transport","🚌","Transport"),
        ("entertainment","🎮","Dam"),("health","💊","Sog'liq"),
        ("shopping","🛍️","Xarid"),("education","📚","Ta'lim"),
        ("utilities","💡","Kommunal"),("other","📌","Boshqa")]
CAT_DICT = {k:(e,n) for k,e,n in CATS}

# DB
def load():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE,"r",encoding="utf-8") as f: return json.load(f)
        except: pass
    return {"users":[]}

def save(db):
    with open(DB_FILE,"w",encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)

def _hash(pw):
    h=0
    for ch in pw:
        h=((31*h)+ord(ch))&0xFFFFFFFF
        if h>0x7FFFFFFF: h-=0x100000000
    return "h"+format(abs(h),"x")

def mkuid(): return format(int(time.time()*1000),"x")+format(int(time.time()*1000)%9999,"x")
def today(): return date.today().isoformat()
def fmt(n):
    try: return f"{int(n):,}".replace(","," ")+" so'm"
    except: return str(n)

def parse_amt(txt):
    txt=re.sub(r"[\s,]","",txt.strip()); mul=1
    if re.search(r"ming|min|k\b",txt,re.I): mul=1000; txt=re.sub(r"[^\d.]","",txt)
    elif re.search(r"mln|million",txt,re.I): mul=1000000; txt=re.sub(r"[^\d.]","",txt)
    else: txt=re.sub(r"[^\d.]","",txt)
    try: n=float(txt)*mul; return n if n>0 else None
    except: return None

def find_user(u): return next((x for x in load().get("users",[]) if x["username"]==u.lower()),None)

def do_register(username,password):
    username=username.strip().lower()
    if len(username)<3: return None,"Username kamida 3 ta belgi"
    if len(password)<4: return None,"Parol kamida 4 ta belgi"
    db=load()
    if any(x["username"]==username for x in db.get("users",[])):
        return None,"Bu username band"
    user={"id":"u_"+username,"username":username,
          "displayName":username[0].upper()+username[1:],
          "passwordHash":_hash(password),
          "createdAt":datetime.utcnow().isoformat()+"Z"}
    db.setdefault("users",[]).append(user); save(db)
    return user,None

def do_login(username,password):
    u=find_user(username)
    if not u: return None,"Foydalanuvchi topilmadi"
    if u.get("passwordHash")!=_hash(password): return None,"Parol noto'g'ri"
    return u,None

def get_exp(uid): return load().get(uid+"_expenses",[])
def get_debt(uid): return load().get(uid+"_debts",[])

def add_exp(uid,desc,amt,cat,note=""):
    db=load(); key=uid+"_expenses"; lst=db.get(key,[])
    item={"id":mkuid(),"userId":uid,"description":desc,"amount":amt,
          "category":cat,"note":note,"date":today(),
          "createdAt":datetime.utcnow().isoformat()+"Z","source":"telegram"}
    lst.insert(0,item); db[key]=lst; save(db); return item

def add_debt(uid,dtype,desc,amt,person="",days=0,note=""):
    db=load(); key=uid+"_debts"; lst=db.get(key,[])
    dl=(date.today()+timedelta(days=days)).isoformat() if days>0 else ""
    item={"id":mkuid(),"userId":uid,"type":dtype,"description":desc,
          "amount":amt,"person":person,"deadline":dl,"daysCount":days,
          "note":note,"date":today(),"createdAt":datetime.utcnow().isoformat()+"Z",
          "paid":False,"source":"telegram"}
    lst.insert(0,item); db[key]=lst; save(db); return item

# Keyboards
def kb_auth(): return InlineKeyboardMarkup([[InlineKeyboardButton("🔐 Kirish",callback_data="do_login")],[InlineKeyboardButton("📝 Ro'yxatdan o'tish",callback_data="do_reg")]])
def kb_main(): return InlineKeyboardMarkup([[InlineKeyboardButton("💸 Xarajat",callback_data="m_exp"),InlineKeyboardButton("🤝 Qarz",callback_data="m_debt")],[InlineKeyboardButton("📊 Dashboard",callback_data="m_dash"),InlineKeyboardButton("🔔 Eslatmalar",callback_data="m_notif")],[InlineKeyboardButton("📋 Xarajatlar",callback_data="m_explist"),InlineKeyboardButton("📋 Qarzlar",callback_data="m_debtlist")],[InlineKeyboardButton("🚪 Chiqish",callback_data="m_logout")]])
def kb_cats():
    rows,row=[],[]
    for k,e,n in CATS:
        row.append(InlineKeyboardButton(f"{e} {n}",callback_data=f"cat_{k}"))
        if len(row)==2: rows.append(row); row=[]
    if row: rows.append(row)
    return InlineKeyboardMarkup(rows)
def kb_debt_type(): return InlineKeyboardMarkup([[InlineKeyboardButton("🤝 Men BERDIM (u qaytaradi)",callback_data="dt_out")],[InlineKeyboardButton("💰 Men OLDIM (men qaytaraman)",callback_data="dt_in")]])
def kb_skip(l="⏩ O'tkazish"): return InlineKeyboardMarkup([[InlineKeyboardButton(l,callback_data="skip")]])

# Handlers
async def cmd_start(update:Update,ctx:ContextTypes.DEFAULT_TYPE):
    ctx.user_data.clear()
    name=update.effective_user.first_name or "Salom"
    await update.message.reply_text(
        f"👋 Xush kelibsiz, <b>{name}</b>!\n\n💰 <b>FinApp</b> — Moliya boshqaruvi\n\n"
        f"Kirish yoki ro'yxatdan o'ting:",
        parse_mode="HTML",reply_markup=kb_auth())
    return ST_AUTH

async def on_auth(u,c):
    q=u.callback_query; await q.answer()
    if q.data=="do_login": await q.message.edit_text("🔐 Username kiriting:",parse_mode="HTML"); return ST_LOG_U
    await q.message.edit_text("📝 Username tanlang (3+ belgi):",parse_mode="HTML"); return ST_REG_U

async def reg_u(u,c):
    un=u.message.text.strip().lower()
    if len(un)<3: await u.message.reply_text("❗ 3+ belgi:"); return ST_REG_U
    db=load()
    if any(x["username"]==un for x in db.get("users",[])):
        await u.message.reply_text(f"❌ <b>{un}</b> band. Boshqa nom:",parse_mode="HTML"); return ST_REG_U
    c.user_data["ru"]=un
    await u.message.reply_text(f"✅ <b>{un}</b>\n\n🔐 Parol (4+ belgi):",parse_mode="HTML"); return ST_REG_P

async def reg_p(u,c):
    pw=u.message.text.strip()
    if len(pw)<4: await u.message.reply_text("❗ 4+ belgi:"); return ST_REG_P
    c.user_data["rp"]=pw
    await u.message.reply_text("🔐 Parolni tasdiqlang:"); return ST_REG_P2

async def reg_p2(u,c):
    if u.message.text.strip()!=c.user_data.get("rp"):
        await u.message.reply_text("❌ Mos kelmadi. Qayta:"); return ST_REG_P
    user,err=do_register(c.user_data["ru"],c.user_data["rp"])
    if err: await u.message.reply_text(f"❌ {err}"); return ST_REG_U
    c.user_data["user"]=user
    await u.message.reply_text(
        f"🎉 <b>Muvaffaqiyatli!</b>\n👤 <code>{user['username']}</code>\n\nAsosiy menyu 👇",
        parse_mode="HTML",reply_markup=kb_main()); return ST_MAIN

async def log_u(u,c): c.user_data["lu"]=u.message.text.strip().lower(); await u.message.reply_text("🔐 Parol:"); return ST_LOG_P

async def log_p(u,c):
    user,err=do_login(c.user_data["lu"],u.message.text.strip())
    if err: await u.message.reply_text(f"❌ {err}",reply_markup=kb_auth()); return ST_AUTH
    c.user_data["user"]=user
    exps=get_exp(user["id"]); debts=get_debt(user["id"])
    await u.message.reply_text(
        f"✅ Xush kelibsiz, <b>{user['displayName']}</b>!\n"
        f"💸 {len(exps)} xarajat | 🤝 {len(debts)} qarz",
        parse_mode="HTML",reply_markup=kb_main()); return ST_MAIN

async def on_main(u,c):
    q=u.callback_query; await q.answer()
    user=c.user_data.get("user")
    if q.data=="back":
        await q.message.edit_text(f"🏠 <b>{user['displayName']}</b>",parse_mode="HTML",reply_markup=kb_main()); return ST_MAIN
    if not user:
        await q.message.edit_text("❌ Kiring!",reply_markup=kb_auth()); return ST_AUTH
    if q.data=="m_exp":
        await q.message.edit_text("💸 <b>XARAJAT QO'SHISH</b>\n━━━━━━━━━━\n1️⃣ Nima uchun xarajat qildingiz?\n\nMisol: <i>Tushlik, Taksi, Kino...</i>",parse_mode="HTML"); return ST_EN
    if q.data=="m_debt":
        await q.message.edit_text("🤝 <b>QARZ QO'SHISH</b>\n━━━━━━━━━━\nQarz turini tanlang:",parse_mode="HTML",reply_markup=kb_debt_type()); return ST_DT
    if q.data=="m_dash": await show_dash(q.message,c); return ST_MAIN
    if q.data=="m_notif": await show_notif(q.message,c); return ST_MAIN
    if q.data=="m_explist": await show_exps(q.message,c); return ST_MAIN
    if q.data=="m_debtlist": await show_debts(q.message,c); return ST_MAIN
    if q.data=="m_logout":
        name=user["displayName"]; c.user_data.clear()
        await q.message.edit_text(f"👋 Xayr, <b>{name}</b>!\n/start",parse_mode="HTML"); return ST_AUTH
    return ST_MAIN

# Xarajat steps
async def en(u,c): c.user_data["en"]=u.message.text.strip(); await u.message.reply_text(f"💸 <b>{c.user_data['en']}</b>\n━━━━━━━━━━\n2️⃣ Qancha pul sarfladingiz?\n\nMisol: <i>15000</i> yoki <i>35 ming</i>",parse_mode="HTML"); return ST_EA
async def ea(u,c):
    amt=parse_amt(u.message.text)
    if not amt: await u.message.reply_text("❗ To'g'ri summa kiriting:"); return ST_EA
    c.user_data["ea"]=amt
    await u.message.reply_text(f"💵 {fmt(amt)}\n━━━━━━━━━━\n3️⃣ Kategoriya tanlang:",reply_markup=kb_cats()); return ST_EC

async def ec(u,c):
    q=u.callback_query; await q.answer()
    c.user_data["ec"]=q.data.replace("cat_","")
    cat=CAT_DICT.get(c.user_data["ec"],("📌","Boshqa"))
    await q.message.edit_text(f"{cat[0]} {cat[1]}\n━━━━━━━━━━\n4️⃣ Izoh? (ixtiyoriy)",reply_markup=kb_skip("⏩ Izoqsiz saqlash")); return ST_ENOTE

async def enote_txt(u,c): return await _sexp(u.message,c,u.message.text.strip(),False)
async def enote_skip(u,c):
    q=u.callback_query; await q.answer(); return await _sexp(q.message,c,"",True)

async def _sexp(msg,c,note,edit):
    user=c.user_data["user"]
    e=add_exp(user["id"],c.user_data["en"],c.user_data["ea"],c.user_data["ec"],note)
    cat=CAT_DICT.get(e["category"],("📌","Boshqa"))
    text=(f"✅ <b>XARAJAT SAQLANDI!</b>\n━━━━━━━━━━\n"
          f"📝 Nima:      <b>{e['description']}</b>\n"
          f"💵 Summa:     <b>{fmt(e['amount'])}</b>\n"
          f"{cat[0]} Kategoriya: <b>{cat[1]}</b>\n"
          f"📅 Sana:      <b>{e['date']}</b>"
          +(f"\n📎 Izoh: <i>{note}</i>" if note else ""))
    fn=msg.edit_text if edit else msg.reply_text
    await fn(text,parse_mode="HTML",reply_markup=kb_main()); return ST_MAIN

# Qarz steps
async def dt(u,c):
    q=u.callback_query; await q.answer()
    c.user_data["dt"]="debt_out" if q.data=="dt_out" else "debt_in"
    lbl="🤝 MEN BERDIM" if c.user_data["dt"]=="debt_out" else "💰 MEN OLDIM"
    await q.message.edit_text(f"🤝 <b>QARZ — {lbl}</b>\n━━━━━━━━━━\n2️⃣ Nima uchun?\n\nMisol: <i>Uy uchun, Oziq-ovqat...</i>",parse_mode="HTML"); return ST_DW

async def dw(u,c): c.user_data["dw"]=u.message.text.strip(); await u.message.reply_text(f"📝 <b>{c.user_data['dw']}</b>\n━━━━━━━━━━\n3️⃣ Qancha?\n\nMisol: <i>50000</i> yoki <i>100 ming</i>",parse_mode="HTML"); return ST_DA

async def da(u,c):
    amt=parse_amt(u.message.text)
    if not amt: await u.message.reply_text("❗ Summa kiriting:"); return ST_DA
    c.user_data["da"]=amt
    q2="Kimga berdingiz?" if c.user_data["dt"]=="debt_out" else "Kimdan oldingiz?"
    await u.message.reply_text(f"💵 {fmt(amt)}\n━━━━━━━━━━\n4️⃣ {q2}",reply_markup=kb_skip("⏩ Ismni yozmaslik")); return ST_DP

async def dp_txt(u,c): c.user_data["dp"]=u.message.text.strip(); await u.message.reply_text("━━━━━━━━━━\n5️⃣ Necha kunda qaytaradi?\n\nMisol: <i>5</i> yoki <i>14</i>",parse_mode="HTML",reply_markup=kb_skip("⏩ Muddat belgilashmaslik")); return ST_DD
async def dp_skip(u,c):
    q=u.callback_query; await q.answer(); c.user_data["dp"]=""
    await q.message.edit_text("━━━━━━━━━━\n5️⃣ Necha kunda qaytaradi?",reply_markup=kb_skip("⏩ Muddat belgilashmaslik")); return ST_DD

async def dd_txt(u,c):
    try: c.user_data["dd"]=int(re.sub(r"[^\d]","",u.message.text))
    except: c.user_data["dd"]=0
    await u.message.reply_text("━━━━━━━━━━\n6️⃣ Izoh? (ixtiyoriy)",reply_markup=kb_skip("⏩ Izoqsiz saqlash")); return ST_DNOTE

async def dd_skip(u,c):
    q=u.callback_query; await q.answer(); c.user_data["dd"]=0
    await q.message.edit_text("━━━━━━━━━━\n6️⃣ Izoh?",reply_markup=kb_skip("⏩ Izoqsiz saqlash")); return ST_DNOTE

async def dnote_txt(u,c): return await _sdebt(u.message,c,u.message.text.strip(),False)
async def dnote_skip(u,c):
    q=u.callback_query; await q.answer(); return await _sdebt(q.message,c,"",True)

async def _sdebt(msg,c,note,edit):
    user=c.user_data["user"]
    d=add_debt(user["id"],c.user_data["dt"],c.user_data["dw"],
               c.user_data["da"],c.user_data.get("dp",""),c.user_data.get("dd",0),note)
    lbl="🤝 Men BERDIM" if d["type"]=="debt_out" else "💰 Men OLDIM"
    text=(f"✅ <b>QARZ SAQLANDI!</b>\n━━━━━━━━━━\n"
          f"🔖 Tur:    <b>{lbl}</b>\n"
          f"📝 Sabab:  <b>{d['description']}</b>\n"
          f"💵 Summa:  <b>{fmt(d['amount'])}</b>"
          +(f"\n👤 Kim:    <b>{d['person']}</b>" if d.get("person") else "")
          +(f"\n📅 Muddat: <b>{d['deadline']}</b>" if d.get("deadline") else ""))
    fn=msg.edit_text if edit else msg.reply_text
    await fn(text,parse_mode="HTML",reply_markup=kb_main()); return ST_MAIN

# Ko'rsatish
async def show_dash(msg,c):
    user=c.user_data["user"]; uid=user["id"]
    exps=get_exp(uid); debts=get_debt(uid)
    td=today(); mo=td[:7]
    tt=sum(e["amount"] for e in exps if e.get("date")==td)
    tm=sum(e["amount"] for e in exps if e.get("date","").startswith(mo))
    ta=sum(e["amount"] for e in exps)
    do=sum(d["amount"] for d in debts if not d.get("paid") and d.get("type")=="debt_out")
    di=sum(d["amount"] for d in debts if not d.get("paid") and d.get("type")=="debt_in")
    ov=[d for d in debts if not d.get("paid") and d.get("deadline") and d["deadline"]<td]
    await msg.edit_text(
        f"📊 <b>DASHBOARD — {user['displayName']}</b>\n━━━━━━━━━━\n"
        f"💸 Bugun:  <b>{fmt(tt)}</b>\n"
        f"🗓 Bu oy:  <b>{fmt(tm)}</b>\n"
        f"📋 Jami:   <b>{fmt(ta)}</b> ({len(exps)} ta)\n\n"
        f"📤 Berganlarim: <b>{fmt(do)}</b>\n"
        f"📥 Olganlarim:  <b>{fmt(di)}</b>"
        +(f"\n\n⚠️ Muddati o'tgan: <b>{len(ov)} ta!</b>" if ov else ""),
        parse_mode="HTML",reply_markup=kb_main())

async def show_notif(msg,c):
    debts=get_debt(c.user_data["user"]["id"])
    alerts=[]
    for d in debts:
        if d.get("paid") or not d.get("deadline"): continue
        try: diff=(date.fromisoformat(d["deadline"])-date.today()).days
        except: continue
        if diff<0: alerts.append(f"🚨 <b>{d['description']}</b> — {fmt(d['amount'])} — {abs(diff)} kun kechikdi!")
        elif diff==0: alerts.append(f"⚠️ <b>{d['description']}</b> — {fmt(d['amount'])} — Bugun muddat!")
        elif diff<=3: alerts.append(f"📅 <b>{d['description']}</b> — {fmt(d['amount'])} — {diff} kun qoldi")
    txt="🔔 <b>ESLATMALAR</b>\n━━━━━━━━━━\n"+("\n".join(alerts) if alerts else "✅ Hamma narsa tartibda!")
    await msg.edit_text(txt,parse_mode="HTML",reply_markup=kb_main())

async def show_exps(msg,c):
    exps=get_exp(c.user_data["user"]["id"])[:10]
    if not exps: await msg.edit_text("📋 Hali xarajat yo'q.",reply_markup=kb_main()); return
    lines="".join(f"  {CAT_DICT.get(e.get('category','other'),('📌',''))[0]} <b>{e['description']}</b> — {fmt(e['amount'])} ({e.get('date','')})\n" for e in exps)
    await msg.edit_text(f"📋 <b>XARAJATLAR</b>\n━━━━━━━━━━\n{lines}",parse_mode="HTML",reply_markup=kb_main())

async def show_debts(msg,c):
    debts=get_debt(c.user_data["user"]["id"])[:10]
    if not debts: await msg.edit_text("📋 Hali qarz yo'q.",reply_markup=kb_main()); return
    lines="".join(f"  {'📤' if d.get('type')=='debt_out' else '📥'}{'✅' if d.get('paid') else '⏳'} <b>{d['description']}</b>{(' · '+d['person']) if d.get('person') else ''} — {fmt(d['amount'])}\n" for d in debts)
    await msg.edit_text(f"📋 <b>QARZLAR</b>\n━━━━━━━━━━\n{lines}",parse_mode="HTML",reply_markup=kb_main())

async def cmd_cancel(u,c):
    await u.message.reply_text("❌ Bekor. /start"); c.user_data.clear(); return ConversationHandler.END

def main():
    if not TOKEN:
        print("❌ BOT_TOKEN topilmadi!"); return
    tgapp=ApplicationBuilder().token(TOKEN).concurrent_updates(True).build()
    conv=ConversationHandler(
        entry_points=[CommandHandler("start",cmd_start)],
        states={
            ST_AUTH:[CallbackQueryHandler(on_auth,pattern="^(do_login|do_reg)$")],
            ST_REG_U:[MessageHandler(filters.TEXT&~filters.COMMAND,reg_u)],
            ST_REG_P:[MessageHandler(filters.TEXT&~filters.COMMAND,reg_p)],
            ST_REG_P2:[MessageHandler(filters.TEXT&~filters.COMMAND,reg_p2)],
            ST_LOG_U:[MessageHandler(filters.TEXT&~filters.COMMAND,log_u)],
            ST_LOG_P:[MessageHandler(filters.TEXT&~filters.COMMAND,log_p)],
            ST_MAIN:[CallbackQueryHandler(on_main)],
            ST_EN:[MessageHandler(filters.TEXT&~filters.COMMAND,en)],
            ST_EA:[MessageHandler(filters.TEXT&~filters.COMMAND,ea)],
            ST_EC:[CallbackQueryHandler(ec,pattern="^cat_")],
            ST_ENOTE:[CallbackQueryHandler(enote_skip,pattern="^skip$"),MessageHandler(filters.TEXT&~filters.COMMAND,enote_txt)],
            ST_DT:[CallbackQueryHandler(dt,pattern="^dt_")],
            ST_DW:[MessageHandler(filters.TEXT&~filters.COMMAND,dw)],
            ST_DA:[MessageHandler(filters.TEXT&~filters.COMMAND,da)],
            ST_DP:[CallbackQueryHandler(dp_skip,pattern="^skip$"),MessageHandler(filters.TEXT&~filters.COMMAND,dp_txt)],
            ST_DD:[CallbackQueryHandler(dd_skip,pattern="^skip$"),MessageHandler(filters.TEXT&~filters.COMMAND,dd_txt)],
            ST_DNOTE:[CallbackQueryHandler(dnote_skip,pattern="^skip$"),MessageHandler(filters.TEXT&~filters.COMMAND,dnote_txt)],
        },
        fallbacks=[CommandHandler("cancel",cmd_cancel),CommandHandler("start",cmd_start),CallbackQueryHandler(on_main,pattern="^back$")],
        allow_reentry=True, per_chat=True,
    )
    tgapp.add_handler(conv)
    log.info("🚀 FinApp Bot ishga tushdi!")
    tgapp.run_polling(drop_pending_updates=True)

if __name__=="__main__":
    main()
