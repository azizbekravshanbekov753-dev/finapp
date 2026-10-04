# -*- coding: utf-8 -*-
"""
FinApp API Server — Flask
Sayt va Telegram bot uchun umumiy backend
"""

import json, os, time, hashlib
from datetime import datetime, date, timedelta
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Saytdan so'rov yuborish uchun

# ── DB fayl ──────────────────────────────────────
DATA_DIR = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH",
           os.path.dirname(os.path.abspath(__file__)))
DB_FILE  = os.path.join(DATA_DIR, "fin_db.json")

# ── API kalit (himoya uchun) ─────────────────────
API_KEY = os.environ.get("API_KEY", "finapp2024secret")

# ════════════════════════════════════════════════
# DB FUNKSIYALAR
# ════════════════════════════════════════════════
def load():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except: pass
    return {"users": []}

def save(db):
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)

def _hash(pw):
    h = 0
    for ch in pw:
        h = ((31 * h) + ord(ch)) & 0xFFFFFFFF
        if h > 0x7FFFFFFF: h -= 0x100000000
    return "h" + format(abs(h), "x")

def uid():
    return format(int(time.time()*1000), "x") + format(int(time.time()*1000)%9999,"x")

def today():
    return date.today().isoformat()

# ════════════════════════════════════════════════
# MIDDLEWARE — API key tekshirish
# ════════════════════════════════════════════════
def check_key():
    key = request.headers.get("X-API-Key") or request.args.get("key")
    if key != API_KEY:
        return jsonify({"ok": False, "error": "Unauthorized"}), 401
    return None

# ════════════════════════════════════════════════
# AUTH ENDPOINTS
# ════════════════════════════════════════════════

@app.route("/api/register", methods=["POST"])
def register():
    err = check_key()
    if err: return err
    data = request.json or {}
    username = data.get("username", "").strip().lower()
    password = data.get("password", "").strip()

    if len(username) < 3:
        return jsonify({"ok": False, "error": "Username kamida 3 ta belgi"})
    if len(password) < 4:
        return jsonify({"ok": False, "error": "Parol kamida 4 ta belgi"})

    db = load()
    if any(u["username"] == username for u in db.get("users", [])):
        return jsonify({"ok": False, "error": "Bu username band"})

    user = {
        "id":           "u_" + username,
        "username":     username,
        "displayName":  username[0].upper() + username[1:],
        "passwordHash": _hash(password),
        "createdAt":    datetime.utcnow().isoformat() + "Z",
    }
    db.setdefault("users", []).append(user)
    save(db)

    return jsonify({"ok": True, "user": {
        "id": user["id"],
        "username": user["username"],
        "displayName": user["displayName"],
    }})

@app.route("/api/login", methods=["POST"])
def login():
    err = check_key()
    if err: return err
    data = request.json or {}
    username = data.get("username", "").strip().lower()
    password = data.get("password", "").strip()

    db = load()
    user = next((u for u in db.get("users", []) if u["username"] == username), None)
    if not user:
        return jsonify({"ok": False, "error": "Foydalanuvchi topilmadi"})
    if user.get("passwordHash") != _hash(password):
        return jsonify({"ok": False, "error": "Parol noto'g'ri"})

    return jsonify({"ok": True, "user": {
        "id": user["id"],
        "username": user["username"],
        "displayName": user["displayName"],
    }})

# ════════════════════════════════════════════════
# DATA ENDPOINTS — Xarajatlar
# ════════════════════════════════════════════════

@app.route("/api/expenses", methods=["GET"])
def get_expenses():
    err = check_key()
    if err: return err
    uid_ = request.args.get("userId")
    if not uid_: return jsonify({"ok": False, "error": "userId kerak"})
    db = load()
    return jsonify({"ok": True, "data": db.get(uid_ + "_expenses", [])})

@app.route("/api/expenses", methods=["POST"])
def add_expense():
    err = check_key()
    if err: return err
    data = request.json or {}
    uid_ = data.get("userId")
    if not uid_: return jsonify({"ok": False, "error": "userId kerak"})

    db  = load()
    key = uid_ + "_expenses"
    lst = db.get(key, [])
    item = {
        "id":          data.get("id") or uid(),
        "userId":      uid_,
        "description": data.get("description", ""),
        "amount":      float(data.get("amount", 0)),
        "category":    data.get("category", "other"),
        "note":        data.get("note", ""),
        "date":        data.get("date") or today(),
        "createdAt":   data.get("createdAt") or datetime.utcnow().isoformat()+"Z",
        "source":      data.get("source", "web"),
    }
    # Avval bormi tekshirish
    if not any(e["id"] == item["id"] for e in lst):
        lst.insert(0, item)
        db[key] = lst
        save(db)
    return jsonify({"ok": True, "item": item})

@app.route("/api/expenses/<item_id>", methods=["DELETE"])
def del_expense(item_id):
    err = check_key()
    if err: return err
    uid_ = request.args.get("userId")
    db  = load()
    key = uid_ + "_expenses"
    db[key] = [e for e in db.get(key, []) if e["id"] != item_id]
    save(db)
    return jsonify({"ok": True})

# ════════════════════════════════════════════════
# DATA ENDPOINTS — Qarzlar
# ════════════════════════════════════════════════

@app.route("/api/debts", methods=["GET"])
def get_debts():
    err = check_key()
    if err: return err
    uid_ = request.args.get("userId")
    if not uid_: return jsonify({"ok": False, "error": "userId kerak"})
    db = load()
    return jsonify({"ok": True, "data": db.get(uid_ + "_debts", [])})

@app.route("/api/debts", methods=["POST"])
def add_debt():
    err = check_key()
    if err: return err
    data = request.json or {}
    uid_ = data.get("userId")
    if not uid_: return jsonify({"ok": False, "error": "userId kerak"})

    db  = load()
    key = uid_ + "_debts"
    lst = db.get(key, [])
    item = {
        "id":          data.get("id") or uid(),
        "userId":      uid_,
        "type":        data.get("type", "debt_out"),
        "description": data.get("description", ""),
        "amount":      float(data.get("amount", 0)),
        "person":      data.get("person", ""),
        "deadline":    data.get("deadline", ""),
        "daysCount":   int(data.get("daysCount", 0)),
        "note":        data.get("note", ""),
        "date":        data.get("date") or today(),
        "createdAt":   data.get("createdAt") or datetime.utcnow().isoformat()+"Z",
        "paid":        bool(data.get("paid", False)),
        "source":      data.get("source", "web"),
    }
    if not any(d["id"] == item["id"] for d in lst):
        lst.insert(0, item)
        db[key] = lst
        save(db)
    return jsonify({"ok": True, "item": item})

@app.route("/api/debts/<item_id>", methods=["PATCH"])
def update_debt(item_id):
    err = check_key()
    if err: return err
    uid_ = request.args.get("userId")
    data = request.json or {}
    db  = load()
    key = uid_ + "_debts"
    lst = db.get(key, [])
    for d in lst:
        if d["id"] == item_id:
            d.update(data)
            break
    db[key] = lst
    save(db)
    return jsonify({"ok": True})

@app.route("/api/debts/<item_id>", methods=["DELETE"])
def del_debt(item_id):
    err = check_key()
    if err: return err
    uid_ = request.args.get("userId")
    db  = load()
    key = uid_ + "_debts"
    db[key] = [d for d in db.get(key, []) if d["id"] != item_id]
    save(db)
    return jsonify({"ok": True})

# ════════════════════════════════════════════════
# SYNC ENDPOINT — Sayt bilan sinxronlash
# ════════════════════════════════════════════════

@app.route("/api/sync", methods=["POST"])
def sync():
    """Sayt barcha ma'lumotlarini yuboradi — server saqlaydi"""
    err = check_key()
    if err: return err
    data = request.json or {}
    uid_ = data.get("userId")
    if not uid_: return jsonify({"ok": False, "error": "userId kerak"})

    db = load()

    # Xarajatlar sync
    if "expenses" in data:
        key = uid_ + "_expenses"
        existing = {e["id"] for e in db.get(key, [])}
        lst = db.get(key, [])
        for e in data["expenses"]:
            if e.get("id") and e["id"] not in existing:
                lst.insert(0, e)
                existing.add(e["id"])
        db[key] = lst

    # Qarzlar sync
    if "debts" in data:
        key = uid_ + "_debts"
        existing = {d["id"] for d in db.get(key, [])}
        lst = db.get(key, [])
        for d in data["debts"]:
            if d.get("id") and d["id"] not in existing:
                lst.insert(0, d)
                existing.add(d["id"])
        db[key] = lst

    save(db)

    # Serverdan yangi ma'lumotlarni qaytarish
    return jsonify({
        "ok": True,
        "expenses": db.get(uid_ + "_expenses", []),
        "debts":    db.get(uid_ + "_debts", []),
    })

# ════════════════════════════════════════════════
# HEALTH CHECK
# ════════════════════════════════════════════════

@app.route("/", methods=["GET"])
def health():
    return jsonify({"ok": True, "app": "FinApp API", "status": "running"})

@app.route("/api/health", methods=["GET"])
def api_health():
    db = load()
    return jsonify({
        "ok": True,
        "users": len(db.get("users", [])),
        "time":  datetime.utcnow().isoformat(),
    })

# ════════════════════════════════════════════════
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
