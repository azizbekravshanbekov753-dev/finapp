# -*- coding: utf-8 -*-
"""
FinApp — Server + Bot bitta faylda
Railway da 1 ta servis sifatida ishlaydi
"""

import json, os, re, time, logging, threading, requests
from datetime import datetime, date, timedelta
from flask import Flask, request, jsonify
from flask_cors import CORS
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder, ContextTypes,
    ConversationHandler, CommandHandler,
    MessageHandler, CallbackQueryHandler, filters,
)

# ── Sozlamalar ────────────────────────────────────
TOKEN   = os.environ.get("BOT_TOKEN", "")
API_KEY = os.environ.get("API_KEY", "finapp2024secret")
PORT    = int(os.environ.get("PORT", 5000))

DATA_DIR = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH",
           os.path.dirname(os.path.abspath(__file__)))
DB_FILE  = os.path.join(DATA_DIR, "fin_db.json")

# Token .env dan
if not TOKEN:
    env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env_file):
        for line in open(env_file):
            line = line.strip()
            if line.startswith("BOT_TOKEN="):
                TOKEN = line.split("=",1)[1].strip().strip('"').strip("'")

logging.basicConfig(format="%(asctime)s [%(levelname)s] %(message)s", level=logging.INFO)
log = logging.getLogger(__name__)

# ════════════════════════════════════════════════
# FLASK APP
# ════════════════════════════════════════════════
app = Flask(__name__)
CORS(app)

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

def mkuid():
    return format(int(time.time()*1000),"x")+format(int(time.time()*1000)%9999,"x")

def today(): return date.today().isoformat()

def chk():
    k = request.headers.get("X-API-Key") or request.args.get("key")
    if k != API_KEY: return jsonify({"ok":False,"error":"Unauthorized"}),401
    return None

@app.route("/", methods=["GET"])
def root(): return jsonify({"ok":True,"app":"FinApp","status":"running"})

@app.route("/api/health", methods=["GET"])
def health():
    db=load()
    return jsonify({"ok":True,"users":len(db.get("users",[])),"time":datetime.utcnow().isoformat()})

@app.route("/api/register", methods=["POST"])
def register():
    e=chk()
    if e: return e
    d=request.json or {}
    u=d.get("username","").strip().lower()
    p=d.get("password","").strip()
    if len(u)<3: return jsonify({"ok":False,"error":"Username kamida 3 ta belgi"})
    if len(p)<4: return jsonify({"ok":False,"error":"Parol kamida 4 ta belgi"})
    db=load()
    if any(x["username"]==u for x in db.get("users",[])):
        return jsonify({"ok":False,"error":"Bu username band"})
    user={"id":"u_"+u,"username":u,"displayName":u[0].upper()+u[1:],
          "passwordHash":_hash(p),"createdAt":datetime.utcnow().isoformat()+"Z"}
    db.setdefault("users",[]).append(user)
    save(db)
    return jsonify({"ok":True,"user":{"id":user["id"],"username":u,"displayName":user["displayName"]}})

@app.route("/api/login", methods=["POST"])
def login():
    e=chk()
    if e: return e
    d=request.json or {}
    u=d.get("username","").strip().lower()
    p=d.get("password","").strip()
    db=load()
    user=next((x for x in db.get("users",[]) if x["username"]==u),None)
    if not user: return jsonify({"ok":False,"error":"Foydalanuvchi topilmadi"})
    if user.get("passwordHash")!=_hash(p): return jsonify({"ok":False,"error":"Parol noto'g'ri"})
    return jsonify({"ok":True,"user":{"id":user["id"],"username":u,"displayName":user["displayName"]}})

@app.route("/api/expenses", methods=["GET"])
def get_exp():
    e=chk()
    if e: return e
    uid=request.args.get("userId")
    db=load()
    return jsonify({"ok":True,"data":db.get(uid+"_expenses",[])})

@app.route("/api/expenses", methods=["POST"])
def add_exp():
    e=chk()
    if e: return e
    d=request.json or {}
    uid=d.get("userId")
    db=load()
    key=uid+"_expenses"
    lst=db.get(key,[])
    item={"id":d.get("id") or mkuid(),"userId":uid,"description":d.get("description",""),
          "amount":float(d.get("amount",0)),"category":d.get("category","other"),
          "note":d.get("note",""),"date":d.get("date") or today(),
          "createdAt":d.get("createdAt") or datetime.utcnow().isoformat()+"Z","source":d.get("source","web")}
    if not any(x["id"]==item["id"] for x in lst):
        lst.insert(0,item); db[key]=lst; save(db)
    return jsonify({"ok":True,"item":item})

@app.route("/api/expenses/<iid>", methods=["DELETE"])
def del_exp(iid):
    e=chk()
    if e: return e
    uid=request.args.get("userId")
    db=load(); db[uid+"_expenses"]=[x for x in db.get(uid+"_expenses",[]) if x["id"]!=iid]; save(db)
    return jsonify({"ok":True})

@app.route("/api/debts", methods=["GET"])
def get_debt():
    e=chk()
    if e: return e
    uid=request.args.get("userId")
    db=load()
    return jsonify({"ok":True,"data":db.get(uid+"_debts",[])})

@app.route("/api/debts", methods=["POST"])
def add_debt():
    e=chk()
    if e: return e
    d=request.json or {}
    uid=d.get("userId")
    db=load()
    key=uid+"_debts"
    lst=db.get(key,[])
    days=int(d.get("daysCount",0))
    deadline=d.get("deadline","") or ((date.today()+timedelta(days=days)).isoformat() if days>0 else "")
    item={"id":d.get("id") or mkuid(),"userId":uid,"type":d.get("type","debt_out"),
          "description":d.get("description",""),"amount":float(d.get("amount",0)),
          "person":d.get("person",""),"deadline":deadline,"daysCount":days,
          "note":d.get("note",""),"date":d.get("date") or today(),
          "createdAt":d.get("createdAt") or datetime.utcnow().isoformat()+"Z",
          "paid":bool(d.get("paid",False)),"source":d.get("source","web")}
    if not any(x["id"]==item["id"] for x in lst):
        lst.insert(0,item); db[key]=lst; save(db)
    return jsonify({"ok":True,"item":item})

@app.route("/api/debts/<iid>", methods=["PATCH"])
def upd_debt(iid):
    e=chk()
    if e: return e
    uid=request.args.get("userId")
    d=request.json or {}
    db=load()
    key=uid+"_debts"
    lst=db.get(key,[])
    for x in lst:
        if x["id"]==iid: x.update(d); break
    db[key]=lst; save(db)
    return jsonify({"ok":True})

@app.route("/api/debts/<iid>", methods=["DELETE"])
def del_debt(iid):
    e=chk()
    if e: return e
    uid=request.args.get("userId")
    db=load(); db[uid+"_debts"]=[x for x in db.get(uid+"_debts",[]) if x["id"]!=iid]; save(db)
    return jsonify({"ok":True})

@app.route("/api/sync", methods=["POST"])
def sync():
    e=chk()
    if e: return e
    d=request.json or {}
    uid=d.get("userId")
    db=load()
    if "expenses" in d:
        key=uid+"_expenses"
        ex={x["id"] for x in db.get(key,[])}
        lst=db.get(key,[])
        for x in d["expenses"]:
            if x.get("id") and x["id"] not in ex:
                lst.insert(0,x); ex.add(x["id"])
        db[key]=lst
    if "debts" in d:
        key=uid+"_debts"
        ex={x["id"] for x in db.get(key,[])}
        lst=db.get(key,[])
        for x in d["debts"]:
            if x.get("id") and x["id"] not in ex:
                lst.insert(0,x); ex.add(x["id"])
        db[key]=lst
    save(db)
    return jsonify({"ok":True,"expenses":db.get(uid+"_expenses",[]),"debts":db.get(uid+"_debts",[])})

# ════════════════════════════════════════════════
# TELEGRAM BOT
# ════════════════════════════════════════════════
CATS=[("food","🍔","Ovqat"),("transport","🚌","Transport"),("entertainment","🎮","Dam"),
      ("health","💊","Sog'liq"),("shopping","🛍️","Xarid"),("education","📚","Ta'lim"),
      ("utilities","💡","Kommunal"),("other","📌","Boshqa")]
CAT_DICT={k:(e,n) for k,e,n in CATS}

(ST_AUTH,ST_REG_U,ST_REG_P,ST_REG_P2,ST_LOG_U,ST_LOG_P,ST_MAIN,
 ST_EN,ST_EA,ST_EC,ST_ENOTE,ST_DT,ST_DW,ST_DA,ST_DP,ST_DD,ST_DNOTE)=range(17)

def fmt(n):
    try: return f"{int(n):,}".replace(","," ")+" so'm"
    except: return str(n)+" so'm"

def parse_amt(txt):
    txt=re.sub(r"[\s,]","",txt.strip())
    mul=1
    if re.search(r"ming|min|k\b",txt,re.I): mul=1000; txt=re.sub(r"[^\d.]","",txt)
    elif re.search(r"mln|million",txt,re.I): mul=1000000; txt=re.sub(r"[^\d.]","",txt)
    else: txt=re.sub(r"[^\d.]","",txt)
    try: n=float(txt)*mul; return n if n>0 else None
    except: return None

def kb_auth():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🔐 Kirish",callback_data="do_login")],
        [InlineKeyboardButton("📝 Ro'yxatdan o'tish",callback_data="do_reg")]])

def kb_main():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("💸 Xarajat",callback_data="m_exp"),
         InlineKeyboardButton("🤝 Qarz",callback_data="m_debt")],
        [InlineKeyboardButton("📊 Dashboard",callback_data="m_dash"),
         InlineKeyboardButton("🔔 Eslatmalar",callback_data="m_notif")],
        [InlineKeyboardButton("📋 Xarajatlar",callback_data="m_explist"),
         InlineKeyboardButton("📋 Qarzlar",callback_data="m_debtlist")],
        [InlineKeyboardButton("🚪 Chiqish",callback_data="m_logout")]])

def kb_cats():
    rows,row=[],[]
    for k,e,n in CATS:
        row.append(InlineKeyboardButton(f"{e} {n}",callback_data=f"cat_{k}"))
        if len(row)==2: rows.append(row); row=[]
    if row: rows.append(row)
    return InlineKeyboardMarkup(rows)

def kb_debt_type():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🤝 Men BERDIM",callback_data="dt_out")],
        [InlineKeyboardButton("💰 Men OLDIM",callback_data="dt_in")]])

def kb_skip(l="⏩ O'tkazish"):
    return InlineKeyboardMarkup([[InlineKeyboardButton(l,callback_data="skip")]])

# Bot DB funksiyalari — to'g'ridan load/save ishlatadi
def b_get_exp(uid): return load().get(uid+"_expenses",[])
def b_get_debt(uid): return load().get(uid+"_debts",[])

def b_add_exp(uid,desc,amt,cat,note=""):
    db=load(); key=uid+"_expenses"; lst=db.get(key,[])
    item={"id":mkuid(),"userId":uid,"description":desc,"amount":amt,"category":cat,
          "note":note,"date":today(),"createdAt":datetime.utcnow().isoformat()+"Z","source":"telegram"}
    lst.insert(0,item); db[key]=lst; save(db); return item

def b_add_debt(uid,dtype,desc,amt,person="",days=0,note=""):
    db=load(); key=uid+"_debts"; lst=db.get(key,[])
    dl=(date.today()+timedelta(days=days)).isoformat() if days>0 else ""
    item={"id":mkuid(),"userId":uid,"type":dtype,"description":desc,"amount":amt,
          "person":person,"deadline":dl,"daysCount":days,"note":note,
          "date":today(),"createdAt":datetime.utcnow().isoformat()+"Z","paid":False,"source":"telegram"}
    lst.insert(0,item); db[key]=lst; save(db); return item

def b_find_user(username):
    return next((u for u in load().get("users",[]) if u["username"]==username.lower()),None)

def b_register(username,password):
    username=username.strip().lower()
    if len(username)<3: return None,"Username kamida 3 ta belgi"
    if len(password)<4: return None,"Parol kamida 4 ta belgi"
    db=load()
    if any(u["username"]==username for u in db.get("users",[])):
        return None,"Bu username band"
    user={"id":"u_"+username,"username":username,"displayName":username[0].upper()+username[1:],
          "passwordHash":_hash(password),"createdAt":datetime.utcnow().isoformat()+"Z"}
    db.setdefault("users",[]).append(user); save(db)
    return user,None

def b_login(username,password):
    u=b_find_user(username)
    if not u: return None,"Foydalanuvchi topilmadi"
    if u.get("passwordHash")!=_hash(password): return None,"Parol noto'g'ri"
    return u,None

async def cmd_start(update:Update,ctx:ContextTypes.DEFAULT_TYPE):
    ctx.user_data.clear()
    name=update.effective_user.first_name or "Salom"
    await update.message.reply_text(
        f"👋 Xush kelibsiz, <b>{name}</b>!\n\n💰 <b>FinApp</b>\n\n"
        f"🌐 Saytda akkount ochgan bo'lsangiz — <b>Kirish</b>\n"
        f"🆕 Yangi foydalanuvchimisiz — <b>Ro'yxatdan o'ting</b>",
        parse_mode="HTML",reply_markup=kb_auth())
    return ST_AUTH

async def on_auth(update:Update,ctx:ContextTypes.DEFAULT_TYPE):
    q=update.callback_query; await q.answer()
    if q.data=="do_login":
        await q.message.edit_text("🔐 <b>Kirish</b>\n\nUsername kiriting:",parse_mode="HTML")
        return ST_LOG_U
    await q.message.edit_text("📝 <b>Ro'yxatdan o'tish</b>\n\nUsername tanlang (kamida 3 belgi):",parse_mode="HTML")
    return ST_REG_U

async def reg_u(update:Update,ctx:ContextTypes.DEFAULT_TYPE):
    u=update.message.text.strip().lower()
    if len(u)<3: await update.message.reply_text("❗ Kamida 3 ta belgi:"); return ST_REG_U
    db=load()
    if any(x["username"]==u for x in db.get("users",[])):
        await update.message.reply_text(f"❌ <b>{u}</b> band. Boshqa nom:",parse_mode="HTML"); return ST_REG_U
    ctx.user_data["ru"]=u
    await update.message.reply_text(f"✅ <b>{u}</b>\n\n🔐 Parol kiriting (kamida 4 belgi):",parse_mode="HTML")
    return ST_REG_P

async def reg_p(update:Update,ctx:ContextTypes.DEFAULT_TYPE):
    pw=update.message.text.strip()
    if len(pw)<4: await update.message.reply_text("❗ Kamida 4 ta belgi:"); return ST_REG_P
    ctx.user_data["rp"]=pw
    await update.message.reply_text("🔐 Parolni tasdiqlang:")
    return ST_REG_P2

async def reg_p2(update:Update,ctx:ContextTypes.DEFAULT_TYPE):
    if update.message.text.strip()!=ctx.user_data.get("rp"):
        await update.message.reply_text("❌ Parollar mos kelmadi. Qayta:"); return ST_REG_P
    user,err=b_register(ctx.user_data["ru"],ctx.user_data["rp"])
    if err: await update.message.reply_text(f"❌ {err}"); return ST_REG_U
    ctx.user_data["user"]=user
    await update.message.reply_text(
        f"🎉 <b>Muvaffaqiyatli!</b>\n👤 <code>{user['username']}</code>\n\n"
        f"🌐 Saytda ham shu username+parol bilan kiring!",
        parse_mode="HTML",reply_markup=kb_main())
    return ST_MAIN

async def log_u(update:Update,ctx:ContextTypes.DEFAULT_TYPE):
    ctx.user_data["lu"]=update.message.text.strip().lower()
    await update.message.reply_text("🔐 Parolni kiriting:")
    return ST_LOG_P

async def log_p(update:Update,ctx:ContextTypes.DEFAULT_TYPE):
    user,err=b_login(ctx.user_data["lu"],update.message.text.strip())
    if err:
        await update.message.reply_text(f"❌ {err}",reply_markup=kb_auth()); return ST_AUTH
    ctx.user_data["user"]=user
    exps=b_get_exp(user["id"]); debts=b_get_debt(user["id"])
    await update.message.reply_text(
        f"✅ Xush kelibsiz, <b>{user['displayName']}</b>!\n"
        f"💸 Xarajatlar: {len(exps)} ta | 🤝 Qarzlar: {len(debts)} ta",
        parse_mode="HTML",reply_markup=kb_main())
    return ST_MAIN

async def on_main(update:Update,ctx:ContextTypes.DEFAULT_TYPE):
    q=update.callback_query; await q.answer()
    user=ctx.user_data.get("user")
    if q.data=="back":
        await q.message.edit_text(f"🏠 <b>{user['displayName']}</b>",parse_mode="HTML",reply_markup=kb_main()); return ST_MAIN
    if not user:
        await q.message.edit_text("❌ Kiring!",reply_markup=kb_auth()); return ST_AUTH
    if q.data=="m_exp":
        await q.message.edit_text("💸 <b>XARAJAT</b>\n━━━━━━━━━━\n1️⃣ Nima uchun?",parse_mode="HTML"); return ST_EN
    if q.data=="m_debt":
        await q.message.edit_text("🤝 <b>QARZ</b>\n━━━━━━━━━━\nQarz turini tanlang:",parse_mode="HTML",reply_markup=kb_debt_type()); return ST_DT
    if q.data=="m_dash": await show_dash(q.message,ctx); return ST_MAIN
    if q.data=="m_notif": await show_notif(q.message,ctx); return ST_MAIN
    if q.data=="m_explist": await show_exps(q.message,ctx); return ST_MAIN
    if q.data=="m_debtlist": await show_debts(q.message,ctx); return ST_MAIN
    if q.data=="m_logout":
        name=user["displayName"]; ctx.user_data.clear()
        await q.message.edit_text(f"👋 Xayr, <b>{name}</b>!\n/start",parse_mode="HTML"); return ST_AUTH
    return ST_MAIN

async def en(u,c): c.user_data["en"]=u.message.text.strip(); await u.message.reply_text(f"💸 {c.user_data['en']}\n2️⃣ Qancha?"); return ST_EA
async def ea(update,ctx):
    amt=parse_amt(update.message.text)
    if not amt: await update.message.reply_text("❗ Summa:"); return ST_EA
    ctx.user_data["ea"]=amt
    await update.message.reply_text(f"💵 {fmt(amt)}\n3️⃣ Kategoriya:",reply_markup=kb_cats()); return ST_EC
async def ec(update,ctx):
    q=update.callback_query; await q.answer()
    ctx.user_data["ec"]=q.data.replace("cat_","")
    cat=CAT_DICT.get(ctx.user_data["ec"],("📌","Boshqa"))
    await q.message.edit_text(f"{cat[0]} {cat[1]}\n4️⃣ Izoh?",reply_markup=kb_skip("⏩ Izoqsiz")); return ST_ENOTE
async def enote_txt(u,c): return await _sexp(u.message,c,u.message.text.strip(),False)
async def enote_skip(update,ctx):
    q=update.callback_query; await q.answer(); return await _sexp(q.message,ctx,"",True)
async def _sexp(msg,ctx,note,edit):
    user=ctx.user_data["user"]
    e=b_add_exp(user["id"],ctx.user_data["en"],ctx.user_data["ea"],ctx.user_data["ec"],note)
    cat=CAT_DICT.get(e["category"],("📌","Boshqa"))
    text=f"✅ <b>SAQLANDI!</b>\n📝 {e['description']}\n💵 {fmt(e['amount'])}\n{cat[0]} {cat[1]}\n📅 {e['date']}"
    fn=msg.edit_text if edit else msg.reply_text
    await fn(text,parse_mode="HTML",reply_markup=kb_main()); return ST_MAIN

async def dt(update,ctx):
    q=update.callback_query; await q.answer()
    ctx.user_data["dt"]="debt_out" if q.data=="dt_out" else "debt_in"
    lbl="🤝 MEN BERDIM" if ctx.user_data["dt"]=="debt_out" else "💰 MEN OLDIM"
    await q.message.edit_text(f"🤝 <b>{lbl}</b>\n2️⃣ Nima uchun?",parse_mode="HTML"); return ST_DW
async def dw(u,c): c.user_data["dw"]=u.message.text.strip(); await u.message.reply_text(f"📝 {c.user_data['dw']}\n3️⃣ Qancha?"); return ST_DA
async def da(update,ctx):
    amt=parse_amt(update.message.text)
    if not amt: await update.message.reply_text("❗ Summa:"); return ST_DA
    ctx.user_data["da"]=amt
    q="Kimga?" if ctx.user_data["dt"]=="debt_out" else "Kimdan?"
    await update.message.reply_text(f"💵 {fmt(amt)}\n4️⃣ {q}",reply_markup=kb_skip("⏩ O'tkazish")); return ST_DP
async def dp_txt(u,c): c.user_data["dp"]=u.message.text.strip(); await u.message.reply_text("5️⃣ Necha kunda?",reply_markup=kb_skip("⏩ O'tkazish")); return ST_DD
async def dp_skip(update,ctx):
    q=update.callback_query; await q.answer(); ctx.user_data["dp"]=""
    await q.message.edit_text("5️⃣ Necha kunda?",reply_markup=kb_skip("⏩ O'tkazish")); return ST_DD
async def dd_txt(u,c):
    try: c.user_data["dd"]=int(re.sub(r"[^\d]","",u.message.text))
    except: c.user_data["dd"]=0
    await u.message.reply_text("6️⃣ Izoh?",reply_markup=kb_skip("⏩ Izoqsiz")); return ST_DNOTE
async def dd_skip(update,ctx):
    q=update.callback_query; await q.answer(); ctx.user_data["dd"]=0
    await q.message.edit_text("6️⃣ Izoh?",reply_markup=kb_skip("⏩ Izoqsiz")); return ST_DNOTE
async def dnote_txt(u,c): return await _sdebt(u.message,c,u.message.text.strip(),False)
async def dnote_skip(update,ctx):
    q=update.callback_query; await q.answer(); return await _sdebt(q.message,ctx,"",True)
async def _sdebt(msg,ctx,note,edit):
    user=ctx.user_data["user"]
    d=b_add_debt(user["id"],ctx.user_data["dt"],ctx.user_data["dw"],
                 ctx.user_data["da"],ctx.user_data.get("dp",""),ctx.user_data.get("dd",0),note)
    lbl="🤝 BERDIM" if d["type"]=="debt_out" else "💰 OLDIM"
    text=(f"✅ <b>QARZ SAQLANDI!</b>\n{lbl}\n📝 {d['description']}\n💵 {fmt(d['amount'])}"
          +(f"\n👤 {d['person']}" if d.get("person") else "")
          +(f"\n📅 Muddat: {d['deadline']}" if d.get("deadline") else ""))
    fn=msg.edit_text if edit else msg.reply_text
    await fn(text,parse_mode="HTML",reply_markup=kb_main()); return ST_MAIN

async def show_dash(msg,ctx):
    user=ctx.user_data["user"]; uid=user["id"]
    exps=b_get_exp(uid); debts=b_get_debt(uid)
    td=today(); mo=td[:7]
    tt=sum(e["amount"] for e in exps if e.get("date")==td)
    tm=sum(e["amount"] for e in exps if e.get("date","").startswith(mo))
    ta=sum(e["amount"] for e in exps)
    do=sum(d["amount"] for d in debts if not d.get("paid") and d.get("type")=="debt_out")
    di=sum(d["amount"] for d in debts if not d.get("paid") and d.get("type")=="debt_in")
    await msg.edit_text(
        f"📊 <b>DASHBOARD — {user['displayName']}</b>\n━━━━━━━━━━\n"
        f"💸 Bugun: <b>{fmt(tt)}</b>\n🗓 Bu oy: <b>{fmt(tm)}</b>\n📋 Jami: <b>{fmt(ta)}</b>\n\n"
        f"📤 Berganlarim: <b>{fmt(do)}</b>\n📥 Olganlarim: <b>{fmt(di)}</b>",
        parse_mode="HTML",reply_markup=kb_main())

async def show_notif(msg,ctx):
    debts=b_get_debt(ctx.user_data["user"]["id"]); td=today()
    alerts=[]
    for d in debts:
        if d.get("paid") or not d.get("deadline"): continue
        try: diff=(date.fromisoformat(d["deadline"])-date.today()).days
        except: continue
        if diff<0: alerts.append(f"🚨 {d['description']} — {fmt(d['amount'])} — {abs(diff)} kun kechikdi!")
        elif diff==0: alerts.append(f"⚠️ {d['description']} — {fmt(d['amount'])} — Bugun!")
        elif diff<=3: alerts.append(f"📅 {d['description']} — {fmt(d['amount'])} — {diff} kun")
    await msg.edit_text("🔔 <b>ESLATMALAR</b>\n━━━━━━━━━━\n"+("\n".join(alerts) if alerts else "✅ Hammasi tartibda!"),parse_mode="HTML",reply_markup=kb_main())

async def show_exps(msg,ctx):
    exps=b_get_exp(ctx.user_data["user"]["id"])[:10]
    if not exps: await msg.edit_text("📋 Xarajat yo'q",reply_markup=kb_main()); return
    lines="".join(f"  {CAT_DICT.get(e.get('category','other'),('📌',''))[0]} <b>{e['description']}</b> — {fmt(e['amount'])}\n" for e in exps)
    await msg.edit_text(f"📋 <b>Xarajatlar</b>\n━━━━━━━━━━\n{lines}",parse_mode="HTML",reply_markup=kb_main())

async def show_debts(msg,ctx):
    debts=b_get_debt(ctx.user_data["user"]["id"])[:10]
    if not debts: await msg.edit_text("📋 Qarz yo'q",reply_markup=kb_main()); return
    lines="".join(f"  {'📤' if d.get('type')=='debt_out' else '📥'}{'✅' if d.get('paid') else '⏳'} <b>{d['description']}</b> — {fmt(d['amount'])}\n" for d in debts)
    await msg.edit_text(f"📋 <b>Qarzlar</b>\n━━━━━━━━━━\n{lines}",parse_mode="HTML",reply_markup=kb_main())

async def cmd_cancel(u,c):
    await u.message.reply_text("❌ Bekor. /start"); c.user_data.clear(); return ConversationHandler.END

def run_bot():
    if not TOKEN: log.error("BOT_TOKEN yo'q!"); return
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
        allow_reentry=True,per_chat=True,
    )
    tgapp.add_handler(conv)
    log.info("🤖 Bot ishga tushdi!")
    tgapp.run_polling(drop_pending_updates=True)

# ════════════════════════════════════════════════
# MAIN — Server + Bot bitta jarayonda
# ════════════════════════════════════════════════
if __name__=="__main__":
    log.info("🚀 FinApp ishga tushmoqda...")
    # Bot alohida thread da
    bot_thread=threading.Thread(target=run_bot,daemon=True)
    bot_thread.start()
    log.info(f"🌐 Flask server port {PORT} da ishlamoqda...")
    app.run(host="0.0.0.0", port=PORT)
