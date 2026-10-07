'use strict';

/* ════════════════════════════════════════════
   AUTH — foydalanuvchi tizimi
   ════════════════════════════════════════════ */
const Auth = {
  // Barcha ro'yxatdan o'tgan foydalanuvchilar
  getUsers() {
    return JSON.parse(localStorage.getItem('fin_users') || '[]');
  },
  saveUsers(arr) {
    localStorage.setItem('fin_users', JSON.stringify(arr));
  },

  // Ro'yxatdan o'tish
  register(username, password) {
    username = username.trim().toLowerCase();
    if (!username || username.length < 3) return { ok: false, msg: "Foydalanuvchi nomi kamida 3 ta harf bo'lishi kerak" };
    if (!password || password.length < 4) return { ok: false, msg: "Parol kamida 4 ta belgi bo'lishi kerak" };

    const users = this.getUsers();
    if (users.find(u => u.username === username)) {
      return { ok: false, msg: "Bu foydalanuvchi nomi allaqachon band. Boshqa nom tanlang." };
    }

    const user = {
      id: 'u_' + username,
      username,
      displayName: username.charAt(0).toUpperCase() + username.slice(1),
      password: password,
      passwordHash: this._hash(password),
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    this.saveUsers(users);

    // API serverga ham saqlash
    try {
      const base = TelegramSync.getApiUrl();
      if (base) {
        fetch(`${base}/api/register`, {
          method: 'POST',
          headers: { 'X-API-Key': 'finapp2024secret', 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        }).catch(() => {});
      }
    } catch(e) {}

    return { ok: true, user };
  },

  // Kirish
  login(username, password) {
    username = username.trim().toLowerCase();
    const users = this.getUsers();
    const user = users.find(u => u.username === username);

    // 1. Avval localdan tekshirish
    if (user) {
      if (user.password && user.password === password) return { ok: true, user };
      if (user.passwordHash && user.passwordHash === this._hash(password)) return { ok: true, user };
    }

    // 2. API serverdan tekshirish (bot orqali ochilgan akkount bo'lishi mumkin)
    // Bu async, shuning uchun server tekshiruvi alohida
    if (!user) return { ok: false, msg: "Foydalanuvchi topilmadi. Avval ro'yxatdan o'ting." };
    return { ok: false, msg: "Parol noto'g'ri" };
  },

  // Sessiyani saqlash
  setSession(user) {
    const data = JSON.stringify({ id: user.id, username: user.username, displayName: user.displayName });
    sessionStorage.setItem('fin_session', data);
    localStorage.setItem('fin_session', data); // Brauzer yopilsa ham saqlansin
  },

  // Joriy foydalanuvchi
  current() {
    try {
      // Avval sessionStorage, keyin localStorage
      const s = sessionStorage.getItem('fin_session') || localStorage.getItem('fin_session');
      const user = s ? JSON.parse(s) : null;
      // sessionStorage ga ham yozish (agar faqat localStorage da bo'lsa)
      if (user && !sessionStorage.getItem('fin_session')) {
        sessionStorage.setItem('fin_session', JSON.stringify(user));
      }
      return user;
    }
    catch { return null; }
  },

  // Chiqish
  logout() {
    sessionStorage.removeItem('fin_session');
    localStorage.removeItem('fin_session');
    window.location.href = 'finance_auth.html';
  },

  // Sahifani himoya qilish — login bo'lmagan bo'lsa qayta yuborish
  guard() {
    if (!this.current()) {
      window.location.href = 'finance_auth.html';
      return false;
    }
    return true;
  },

  // Oddiy hash (xavfsizlik uchun yetarli demo darajada)
  _hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    }
    return 'h' + Math.abs(h).toString(36);
  }
};

/* ════════════════════════════════════════════
   DB — foydalanuvchiga xos ma'lumotlar
   ════════════════════════════════════════════ */
const DB = {
  _uid() {
    const u = Auth.current();
    return u ? u.id + '_' : 'anon_';
  },
  get(key) {
    try { return JSON.parse(localStorage.getItem(this._uid() + key) || '[]'); }
    catch { return []; }
  },
  set(key, val) { localStorage.setItem(this._uid() + key, JSON.stringify(val)); },
  add(key, item) { const l = this.get(key); l.unshift(item); this.set(key, l); return item; },
  remove(key, id) { this.set(key, this.get(key).filter(i => i.id !== id)); },
  update(key, id, ch) { this.set(key, this.get(key).map(i => i.id === id ? { ...i, ...ch } : i)); },
  find(key, id) { return this.get(key).find(i => i.id === id); }
};

/* ════════════════════════════════════════════
   UTILS — yordamchi funksiyalar
   ════════════════════════════════════════════ */
const Utils = {
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
  today() { return new Date().toISOString().split('T')[0]; },
  addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().split('T')[0]; },
  daysLeft(d) {
    if (!d) return null;
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const g = new Date(d); g.setHours(0, 0, 0, 0);
    return Math.round((g - t) / 86400000);
  },
  fmtDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' });
  },
  fmtMoney(n) { return (n || 0).toLocaleString('uz-UZ') + " so'm"; },
  fmtShort(n) {
    n = n || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
    return String(n);
  },
  dlStatus(d) {
    const days = this.daysLeft(d);
    if (days === null) return null;
    if (days < 0)  return { cls: 'dl-over',  txt: `${Math.abs(days)} kun kechikdi!` };
    if (days === 0) return { cls: 'dl-today', txt: 'Bugun muddat tugaydi!' };
    if (days <= 3)  return { cls: 'dl-soon',  txt: `${days} kun qoldi` };
    return { cls: 'dl-ok', txt: `${days} kun qoldi` };
  },
  catInfo(c) {
    const m = {
      food:          { e: '🍔', n: 'Oziq-ovqat' },
      transport:     { e: '🚌', n: 'Transport' },
      entertainment: { e: '🎮', n: "Ko'ngilochar" },
      health:        { e: '💊', n: "Sog'liq" },
      shopping:      { e: '🛍️', n: 'Xarid' },
      education:     { e: '📚', n: "Ta'lim" },
      utilities:     { e: '💡', n: 'Kommunal' },
      debt:          { e: '🤝', n: 'Qarz' },
      other:         { e: '📌', n: 'Boshqa' },
    };
    return m[c] || m.other;
  },
  timeAgo(iso) {
    if (!iso) return '';
    const m = Math.floor((Date.now() - new Date(iso)) / 60000);
    if (m < 1)  return 'Hozir';
    if (m < 60) return m + ' daqiqa oldin';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' soat oldin';
    return Math.floor(h / 24) + ' kun oldin';
  }
};

/* ════════════════════════════════════════════
   PARSER — matndan ma'lumot ajratish
   ════════════════════════════════════════════ */
const Parser = {
  parse(text) {
    if (!text?.trim()) return null;
    const t = text.trim().toLowerCase();
    const r = { raw: text, type: null, amount: null, description: '', category: 'other', deadline: null, person: null };
    r.type     = this._type(t);
    r.amount   = this._amount(t);
    if (r.type !== 'expense') { const dl = this._dl(t); r.deadline = dl.date; }
    r.person   = this._person(t);
    const di   = this._desc(t, r.type);
    r.description = di.desc;
    r.category    = di.cat;
    return r;
  },

  _type(t) {
    const out = ["berdim", "berdi", "berib", "qarz berdim", "pul berdim", "qarzga berdim"];
    const inn = ["oldim", "oldi", "olib", "qarz oldim", "pul oldim", "menga berdi", "qarzga oldim"];
    for (const k of out) if (t.includes(k)) return 'debt_out';
    for (const k of inn) if (t.includes(k)) return 'debt_in';
    if (t.includes('qarz')) return t.includes('berd') ? 'debt_out' : 'debt_in';
    return 'expense';
  },

  _amount(t) {
    const p = [
      [/(\d[\d\s,]*)[ ]*(million|milyon|mln)/i, 1e6],
      [/(\d[\d\s,]*)[ ]*(ming|min)\b/i,          1e3],
      [/(\d[\d\s,]*)[ ]*(so['']?m|sum)\b/i,       1],
      [/(\d[\d\s,.]+)/,                            1],
    ];
    for (const [re, mul] of p) {
      const m = t.match(re);
      if (m) {
        const n = parseFloat(m[1].replace(/[\s,]/g, ''));
        if (n > 0) return n * mul;
      }
    }
    return null;
  },

  _dl(t) {
    const dm = t.match(/(\d+)\s*kun/);
    const wm = t.match(/(\d+)\s*hafta/);
    const mm = t.match(/(\d+)\s*oy/);
    const words = { bir:1, ikki:2, uch:3, "to'rt":4, besh:5, olti:6, yetti:7, sakkiz:8, "to'qqiz":9, "o'n":10 };
    let days = null;
    if (dm) days = +dm[1];
    else if (wm) days = +wm[1] * 7;
    else if (mm) days = +mm[1] * 30;
    else for (const [w, n] of Object.entries(words)) if (t.includes(w + ' kun')) { days = n; break; }

    const iso = t.match(/(\d{4}-\d{2}-\d{2})/);
    const dot = t.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    let date = null;
    if (iso) date = iso[1];
    else if (dot) date = `${dot[3]}-${dot[2].padStart(2,'0')}-${dot[1].padStart(2,'0')}`;
    else if (days !== null) date = Utils.addDays(Utils.today(), days);
    return { date };
  },

  _person(t) {
    const kw = ["do'st", "dost", "aka", "uka", "opa", "singil", "qo'shni", "birodar", "hamkasb", "qarindosh"];
    for (const k of kw) if (t.includes(k)) return k;
    return null;
  },

  _desc(t, type) {
    const cats = {
      food:          ['non', 'cola', 'gosht', 'sabzavot', 'meva', 'ovqat', 'pizza', 'burger', 'choy', 'qahva', 'olma', 'lavash', 'guruch', 'tuxum', 'sut', 'qand', 'un', 'ichimlik', 'restoran', 'kafe'],
      transport:     ['avtobus', 'taksi', 'benzin', 'marshrutka', 'metr', 'uber', 'yandex'],
      entertainment: ['kino', 'o\'yin', 'konsert', 'futbol', 'teatr', 'park', 'sport', 'dam'],
      health:        ['dori', 'shifoxona', 'doktor', 'vrach', 'apteka', 'massaj', 'tekshiruv'],
      shopping:      ['kiyim', 'poyabzal', 'telefon', 'kompyuter', 'bozor', 'do\'kon', 'xarid', "sovg'a"],
      education:     ['kurs', 'dars', "ta'lim", 'maktab', 'universitet', 'tutor'],
      utilities:     ['kommunal', 'gaz', 'elektr', 'suv', 'internet'],
    };
    let cat = type === 'expense' ? 'other' : 'debt';
    let desc = '';
    for (const [c, kws] of Object.entries(cats)) {
      for (const k of kws) {
        if (t.includes(k)) { cat = c; desc = desc || k; break; }
      }
      if (desc) break;
    }
    if (!desc) {
      desc = t.replace(/\d[\d\s,.]*\s*(so'?m?|sum|ming|mln|k)?/gi, '')
               .replace(/(?:bugun|kecha|ertaga|qarz|oldim|berdim|sarflad|sotib|menga|meniki)/g, '')
               .replace(/[^\w\s'ʼʻ]/g, '').trim()
               .split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
    }
    if (!desc) desc = type === 'expense' ? 'Xarajat' : type === 'debt_in' ? 'Olingan qarz' : 'Berilgan qarz';
    else desc = desc[0].toUpperCase() + desc.slice(1);
    return { desc, cat };
  }
};

/* ════════════════════════════════════════════
   NOTIFICATIONS
   ════════════════════════════════════════════ */
const Notifs = {
  add(data) {
    const n = { id: Utils.uid(), type: data.type || 'info', title: data.title, msg: data.msg, relatedId: data.relatedId || null, read: false, at: new Date().toISOString() };
    DB.add('notifs', n);
    this._badge();
    return n;
  },
  all() { return DB.get('notifs'); },
  unread() { return this.all().filter(n => !n.read).length; },
  read(id) { DB.update('notifs', id, { read: true }); this._badge(); },
  readAll() { DB.set('notifs', this.all().map(n => ({ ...n, read: true }))); this._badge(); },
  del(id) { DB.remove('notifs', id); this._badge(); },
  clear() { DB.set('notifs', []); this._badge(); },
  _badge() {
    const c = this.unread();
    document.querySelectorAll('.sb-badge').forEach(b => { b.textContent = c; b.style.display = c ? 'inline-flex' : 'none'; });
  },
  checkDeadlines() {
    const today = Utils.today();
    DB.get('debts').filter(d => !d.paid && d.deadline).forEach(d => {
      const st = Utils.dlStatus(d.deadline);
      if (!st || st.cls === 'dl-ok') return;
      const exists = this.all().find(n => n.relatedId === d.id && n.at.startsWith(today));
      if (exists) return;
      const typeMap = { 'dl-over': 'danger', 'dl-today': 'warning', 'dl-soon': 'info' };
      const icons   = { 'dl-over': '🚨', 'dl-today': '⚠️', 'dl-soon': '📅' };
      this.add({
        type: typeMap[st.cls],
        title: `${icons[st.cls]} ${d.description}`,
        msg: `${Utils.fmtMoney(d.amount)} — ${st.txt}`,
        relatedId: d.id,
      });
    });
    this._badge();
  }
};

/* ════════════════════════════════════════════
   TOAST
   ════════════════════════════════════════════ */
const Toast = {
  show(msg, type = 'info', dur = 3500) {
    let c = document.getElementById('toasts');
    if (!c) { c = document.createElement('div'); c.id = 'toasts'; c.className = 'toast-wrap'; document.body.appendChild(c); }
    const icons = { ok: '✅', err: '❌', warn: '⚠️', info: 'ℹ️' };
    const t = document.createElement('div');
    t.className = `toast t-${type}`;
    t.innerHTML = `<span style="font-size:17px">${icons[type] || icons.info}</span><span class="toast-msg">${msg}</span><button class="toast-close" onclick="this.closest('.toast').remove()">×</button>`;
    c.appendChild(t);
    setTimeout(() => { t.style.animation = 'slideO .3s ease forwards'; setTimeout(() => t.remove(), 300); }, dur);
  }
};

/* ════════════════════════════════════════════
   VOICE INPUT
   ════════════════════════════════════════════ */
const Voice = {
  rec: null, on: false,
  ok() { return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window; },
  start(cb) {
    if (!this.ok()) { Toast.show("Brauzer ovozni qo'llab-quvvatlamaydi", 'err'); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.rec = new SR();
    this.rec.lang = 'uz-UZ'; this.rec.interimResults = true;
    this.rec.onresult = e => {
      let tr = '';
      for (let i = e.resultIndex; i < e.results.length; i++) tr += e.results[i][0].transcript;
      cb(tr, e.results[e.results.length - 1].isFinal);
    };
    this.rec.onerror = () => { this.stop(); };
    this.rec.onend = () => { this.on = false; this._ui(false); };
    this.rec.start(); this.on = true; this._ui(true);
  },
  stop() { this.rec?.stop(); this.on = false; this._ui(false); },
  _ui(on) {
    document.querySelectorAll('.mic-btn').forEach(b => { b.classList.toggle('on', on); b.innerHTML = on ? '⏹️' : '🎙️'; });
    document.querySelectorAll('.voice-bar').forEach(v => v.classList.toggle('show', on));
  }
};

/* ════════════════════════════════════════════
   INPUT HANDLER — shared across pages
   ════════════════════════════════════════════ */
const InputHandler = {
  bind() {
    const form = document.getElementById('input-form');
    const area = document.getElementById('main-input');
    if (!form || !area) return;

    area.addEventListener('input', () => this._preview(area.value));
    area.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._submit(area.value); } });
    form.addEventListener('submit', e => { e.preventDefault(); this._submit(area.value); });

    document.querySelectorAll('.mic-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (Voice.on) { Voice.stop(); return; }
        Voice.start((tr, final) => {
          area.value = tr;
          if (final) this._preview(tr);
        });
      });
    });

    document.querySelectorAll('.sample').forEach(s => {
      s.addEventListener('click', () => { area.value = s.textContent; this._preview(s.textContent); });
    });
  },

  _preview(text) {
    const box = document.getElementById('parse-preview');
    if (!box) return;
    const p = Parser.parse(text);
    if (!p?.amount) { box.classList.remove('show'); return; }
    const tLabel = p.type === 'expense' ? '💸 Xarajat' : p.type === 'debt_in' ? '💰 Olingan qarz' : '🤝 Berilgan qarz';
    const tCls   = p.type === 'expense' ? 'pp-type-exp' : p.type === 'debt_in' ? 'pp-type-din' : 'pp-type-dout';
    const cat    = Utils.catInfo(p.category);
    box.innerHTML = `
      <span class="pp-tag ${tCls}">${tLabel}</span>
      <span class="pp-tag pp-amt">💵 ${Utils.fmtMoney(p.amount)}</span>
      ${p.description ? `<span class="pp-tag pp-cat">${cat.e} ${p.description}</span>` : ''}
      ${p.deadline ? `<span class="pp-tag pp-dl">📅 ${Utils.fmtDate(p.deadline)}</span>` : ''}
      ${p.person ? `<span class="pp-tag pp-cat">👤 ${p.person}</span>` : ''}`;
    box.classList.add('show');
  },

  _submit(text) {
    const p = Parser.parse(text);
    if (!p) { Toast.show('Matn kiriting', 'warn'); return; }
    if (!p.amount) { Toast.show("Summa topilmadi! Masalan: \"Non 5000\" yoki \"Do'stimga 50000 qarz berdim 5 kunda\"", 'warn'); return; }

    if (p.type === 'expense') {
      const item = { id: Utils.uid(), description: p.description, amount: p.amount, category: p.category, date: Utils.today(), createdAt: new Date().toISOString() };
      DB.add('expenses', item);
      try { TelegramSync.pushExpense(item); } catch(e) {}
      Toast.show(`Saqlandi: ${Utils.fmtMoney(p.amount)}`, 'ok');
    } else {
      const debt = { id: Utils.uid(), type: p.type, description: p.description, amount: p.amount, person: p.person, deadline: p.deadline, date: Utils.today(), createdAt: new Date().toISOString(), paid: false };
      DB.add('debts', debt);
      try { TelegramSync.pushDebt(debt); } catch(e) {}
      if (p.deadline) Notifs.add({ type: 'info', title: `📋 ${p.description}`, msg: `${Utils.fmtMoney(p.amount)} — Muddat: ${Utils.fmtDate(p.deadline)}`, relatedId: debt.id });
      Toast.show(`Qarz saqlandi: ${Utils.fmtMoney(p.amount)}`, 'ok');
    }

    const area = document.getElementById('main-input');
    const box  = document.getElementById('parse-preview');
    if (area) area.value = '';
    if (box)  box.classList.remove('show');

    App.refresh();
    if (typeof pageRefresh === 'function') pageRefresh();
  }
};

/* ════════════════════════════════════════════
   APP — umumiy ishga tushiruvchi
   ════════════════════════════════════════════ */
const App = {
  init() {
    // 1. Login tekshirish
    if (!Auth.guard()) return;

    // 2. PIN tekshirish
    if (PIN.has() && !sessionStorage.getItem('fin_pin_ok')) {
      window.location.href = 'finance_pin.html'; return;
    }

    // 3. Qurilma va Onboarding tekshirish
    const u = Auth.current();
    if (u) {
      const devKey = 'fin_device_' + u.id;
      const obKey  = 'fin_ob_' + u.id;
      if (!localStorage.getItem(devKey)) {
        window.location.href = 'finance_device.html'; return;
      }
      if (!localStorage.getItem(obKey)) {
        window.location.href = 'finance_onboarding.html'; return;
      }
    }

    // 4. Tema
    Theme.init();

    // 5. Qurilma layout
    try { DeviceLayout.apply(); } catch(e) {}
    try { DeviceLayout.renderSwitcher(); } catch(e) {}

    // 6. Sidebar va foydalanuvchi
    this._sidebar();
    this._user();

    // 7. Tema tugmasi
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => Theme.toggle());
    });

    // 8. Asosiy funksiyalar
    Notifs.checkDeadlines();
    InputHandler.bind();
    this.refresh();

    // 9. Qo'shimcha modullar (xato bo'lsa ham to'xtamasin)
    try { Recurring.checkAndApply(); } catch(e) {}
    try { Budget.checkAlerts(); }     catch(e) {}
    try { PushNotif.checkDebts(); }   catch(e) {}
    try { SW.register(); }            catch(e) {}
    try { Currency.fetchRates(); }    catch(e) {}
    try { Achievements.check(); }     catch(e) {}
    try { TelegramSync.startPolling(); } catch(e) {}
    try { PrivacyMode.init(); }       catch(e) {}
    try { FinBot.renderFAB(); }       catch(e) {}
  },

  refresh() {
    const exp   = DB.get('expenses');
    const debts = DB.get('debts');
    const today = Utils.today();
    const month = today.slice(0, 7);

    const todayAmt = exp.filter(e => e.date === today).reduce((s, e) => s + e.amount, 0);
    const monthAmt = exp.filter(e => e.date?.startsWith(month)).reduce((s, e) => s + e.amount, 0);
    const dOut     = debts.filter(d => !d.paid && d.type === 'debt_out').reduce((s, d) => s + d.amount, 0);
    const dIn      = debts.filter(d => !d.paid && d.type === 'debt_in').reduce((s, d) => s + d.amount, 0);

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('s-today',    Utils.fmtShort(todayAmt));
    set('s-month',    Utils.fmtShort(monthAmt));
    set('s-debt-out', Utils.fmtShort(dOut));
    set('s-debt-in',  Utils.fmtShort(dIn));
    set('s-open',     debts.filter(d => !d.paid).length);

    Notifs._badge();
  },

  _user() {
    const u = Auth.current();
    if (!u) return;
    document.querySelectorAll('.sb-uname').forEach(el => el.textContent = u.displayName);
    document.querySelectorAll('.sb-avatar').forEach(el => el.textContent = u.displayName[0].toUpperCase());
    document.querySelectorAll('.current-user').forEach(el => el.textContent = u.displayName);
    document.querySelectorAll('.logout-btn').forEach(btn => btn.addEventListener('click', () => Auth.logout()));
  },

  _sidebar() {
    const toggle  = document.getElementById('sb-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sb-overlay');
    const close   = () => { sidebar?.classList.remove('open'); overlay?.classList.remove('show'); };
    toggle?.addEventListener('click', () => { sidebar?.classList.toggle('open'); overlay?.classList.toggle('show'); });
    overlay?.addEventListener('click', close);
  }
};

/* ════════════════════════════════════════════
   GLOBAL actions (sahifa skriptlari ishlatadi)
   ════════════════════════════════════════════ */
function deleteExpense(id) {
  if (!confirm("O'chirishni istaysizmi?")) return;
  DB.remove('expenses', id);
  Toast.show("O'chirildi", 'info');
  App.refresh();
  if (typeof pageRefresh === 'function') pageRefresh();
}

function markDebtPaid(id) {
  DB.update('debts', id, { paid: true, paidAt: new Date().toISOString() });
  const d = DB.find('debts', id);
  if (d) Notifs.add({ type: 'success', title: `✅ To'landi: ${d.description}`, msg: Utils.fmtMoney(d.amount), relatedId: id });
  Toast.show("To'langan deb belgilandi ✅", 'ok');
  App.refresh();
  if (typeof pageRefresh === 'function') pageRefresh();
}

function deleteDebt(id) {
  if (!confirm("O'chirishni istaysizmi?")) return;
  DB.remove('debts', id);
  Toast.show("O'chirildi", 'info');
  App.refresh();
  if (typeof pageRefresh === 'function') pageRefresh();
}

/* ════════════════════════════════════════════
   RENDER HELPERS — irow, stats va boshqalar
   ════════════════════════════════════════════ */
function renderExpenseRow(e) {
  const cat = Utils.catInfo(e.category);
  return `<div class="irow ani">
    <div class="irow-ico ico-red">${cat.e}</div>
    <div class="irow-info">
      <div class="irow-name">${e.description}</div>
      <div class="irow-meta"><span>${cat.n}</span><span>·</span><span>${Utils.fmtDate(e.date)}</span></div>
    </div>
    <div class="irow-amt amt-red">−${Utils.fmtMoney(e.amount)}</div>
    <div class="irow-actions">
      <button class="btn-icon" onclick="deleteExpense('${e.id}')" title="O'chirish">🗑</button>
    </div>
  </div>`;
}

function renderDebtRow(d, actions = true) {
  const isOut = d.type === 'debt_out';
  const st    = Utils.dlStatus(d.deadline);
  const dlHtml = st ? `<span class="dl ${st.cls}">${st.txt}</span>` : d.deadline ? `<span class="dl dl-ok">${Utils.fmtDate(d.deadline)}</span>` : '';
  const actHtml = !actions ? '' : d.paid
    ? `<button class="btn-icon" onclick="deleteDebt('${d.id}')">🗑</button>`
    : `<button class="btn btn-success btn-xs" onclick="markDebtPaid('${d.id}')">✓ To'landi</button>
       <button class="btn-icon" onclick="deleteDebt('${d.id}')">🗑</button>`;
  return `<div class="irow ani" style="${d.paid ? 'opacity:.55' : ''}">
    <div class="irow-ico ${isOut ? 'ico-amber' : 'ico-green'}">${isOut ? '🤝' : '💰'}</div>
    <div class="irow-info">
      <div class="irow-name">${d.description}${d.person ? ` <span style="font-weight:400;color:var(--t3)">· ${d.person}</span>` : ''}${d.paid ? ' <span class="badge bdg-green">✅ To\'landi</span>' : ''}</div>
      <div class="irow-meta"><span>${isOut ? 'Men berdim' : 'Men oldim'}</span><span>·</span><span>${Utils.fmtDate(d.date)}</span>${dlHtml}</div>
    </div>
    <div class="irow-amt ${isOut ? 'amt-amber' : 'amt-green'}">${isOut ? '−' : '+'}${Utils.fmtMoney(d.amount)}</div>
    <div class="irow-actions">${actHtml}</div>
  </div>`;
}

/* ════════════════════════════════════════════
   DOMContentLoaded — ishga tushiruvchi
   ════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const page = location.pathname.split('/').pop();
  const skip = ['finance_auth.html','finance_onboarding.html','finance_pin.html','finance_device.html',''];
  if (skip.includes(page)) { Theme.init(); return; }
  App.init();
  if (typeof pageRefresh === 'function') pageRefresh();
});


/* ════════════════════════════════════════════
   THEME — dark / light rejim
   ════════════════════════════════════════════ */
const Theme = {
  get()  { return localStorage.getItem('fin_theme') || 'dark'; },
  set(t) { localStorage.setItem('fin_theme', t); this.apply(t); },
  apply(t) {
    document.body.classList.toggle('light', t === 'light');
    document.querySelectorAll('.theme-btn').forEach(b => b.textContent = t === 'light' ? '🌙' : '☀️');
  },
  toggle() { this.set(this.get() === 'dark' ? 'light' : 'dark'); },
  init()   { this.apply(this.get()); }
};

/* ════════════════════════════════════════════
   PIN — himoya
   ════════════════════════════════════════════ */
const PIN = {
  _key() { const u = Auth.current(); return u ? 'fin_pin_' + u.id : null; },
  has()  { const k = this._key(); return k ? !!localStorage.getItem(k) : false; },
  set(pin) { const k = this._key(); if (k) localStorage.setItem(k, Auth._hash(pin)); },
  check(pin) { const k = this._key(); return k ? localStorage.getItem(k) === Auth._hash(pin) : true; },
  clear() { const k = this._key(); if (k) localStorage.removeItem(k); },
  /* PIN ekranini ko'rsatish */
  guard() {
    if (!this.has()) return true; // PIN yo'q — o'tkazib yuborish
    const passed = sessionStorage.getItem('fin_pin_ok');
    if (passed) return true;
    window.location.href = 'finance_pin.html';
    return false;
  },
  pass() { sessionStorage.setItem('fin_pin_ok', '1'); }
};

/* ════════════════════════════════════════════
   CURRENCY — valyuta konvertatsiya
   ════════════════════════════════════════════ */
const Currency = {
  _rateKey: 'fin_rates',
  _curKey:  'fin_currency',

  /* Joriy tanlangan valyuta */
  current() { return localStorage.getItem(this._curKey) || 'UZS'; },
  set(code) { localStorage.setItem(this._curKey, code); },

  /* Kurslar (offline fallback bilan) */
  defaultRates: { UZS: 1, USD: 12700, EUR: 13900, RUB: 140, KZT: 28 },

  async fetchRates() {
    try {
      const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD', { signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error();
      const data = await r.json();
      const rates = {
        UZS: data.rates.UZS || 12700,
        USD: 1,
        EUR: 1 / data.rates.EUR,
        RUB: 1 / data.rates.RUB,
        KZT: 1 / data.rates.KZT,
      };
      // UZS bazasiga o'tkazish
      const uzsPerUsd = rates.UZS;
      const final = {};
      for (const [c, v] of Object.entries(rates)) {
        final[c] = c === 'UZS' ? 1 : uzsPerUsd / v;
      }
      localStorage.setItem(this._rateKey, JSON.stringify({ rates: final, ts: Date.now() }));
      return final;
    } catch { return this._cached(); }
  },

  _cached() {
    try {
      const d = JSON.parse(localStorage.getItem(this._rateKey));
      if (d && Date.now() - d.ts < 86400000) return d.rates;
    } catch {}
    return this.defaultRates;
  },

  /* Summani UZS ga konvertatsiya */
  toUZS(amount, fromCode) {
    if (!fromCode || fromCode === 'UZS') return amount;
    const rates = this._cached();
    return Math.round(amount * (rates[fromCode] || this.defaultRates[fromCode] || 1));
  },

  /* UZS dan boshqa valyutaga */
  fromUZS(amount, toCode) {
    if (!toCode || toCode === 'UZS') return amount;
    const rates = this._cached();
    const rate = rates[toCode] || this.defaultRates[toCode] || 1;
    return +(amount / rate).toFixed(2);
  },

  /* Formatlash */
  symbols: { UZS: "so'm", USD: '$', EUR: '€', RUB: '₽', KZT: '₸' },
  fmt(amount, code) {
    code = code || this.current();
    const sym = this.symbols[code] || code;
    if (code === 'UZS') return amount.toLocaleString('uz-UZ') + " so'm";
    return sym + amount.toLocaleString('en-US');
  }
};

/* ════════════════════════════════════════════
   BUDGET — oylik byudjet limitlari
   ════════════════════════════════════════════ */
const Budget = {
  _key: 'budgets',

  getAll() { return DB.get(this._key); },

  /* Kategoriya uchun limit olish */
  getLimit(cat, month) {
    month = month || Utils.today().slice(0, 7);
    const b = this.getAll().find(b => b.cat === cat && b.month === month);
    return b ? b.limit : null;
  },

  /* Limit o'rnatish */
  set(cat, limitUZS, month) {
    month = month || Utils.today().slice(0, 7);
    const all = this.getAll();
    const idx = all.findIndex(b => b.cat === cat && b.month === month);
    const item = { id: Utils.uid(), cat, limit: limitUZS, month };
    if (idx >= 0) all[idx] = { ...all[idx], ...item };
    else all.push(item);
    DB.set(this._key, all);
  },

  del(cat, month) {
    month = month || Utils.today().slice(0, 7);
    DB.set(this._key, this.getAll().filter(b => !(b.cat === cat && b.month === month)));
  },

  /* Sarflangan miqdor */
  spent(cat, month) {
    month = month || Utils.today().slice(0, 7);
    return DB.get('expenses')
      .filter(e => e.category === cat && e.date && e.date.startsWith(month))
      .reduce((s, e) => s + e.amount, 0);
  },

  /* Barcha byudjet holati */
  status(month) {
    month = month || Utils.today().slice(0, 7);
    return this.getAll()
      .filter(b => b.month === month)
      .map(b => {
        const spent = this.spent(b.cat, month);
        const pct   = Math.round((spent / b.limit) * 100);
        const cls   = pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : 'ok';
        return { ...b, spent, pct, cls };
      });
  },

  /* Ogohlantirish tekshirish */
  checkAlerts() {
    const today = Utils.today();
    const month = today.slice(0, 7);
    this.status(month).forEach(b => {
      if (b.cls === 'danger') {
        const exists = Notifs.all().find(n => n.relatedId === 'budget_' + b.cat && n.at.startsWith(today));
        if (!exists) {
          Notifs.add({
            type: 'danger',
            title: `⚠️ Byudjet oshib ketdi!`,
            msg: `${Utils.catInfo(b.cat).n}: ${Utils.fmtMoney(b.spent)} / ${Utils.fmtMoney(b.limit)} (${b.pct}%)`,
            relatedId: 'budget_' + b.cat
          });
        }
      } else if (b.cls === 'warn') {
        const exists = Notifs.all().find(n => n.relatedId === 'budget_warn_' + b.cat && n.at.startsWith(today));
        if (!exists) {
          Notifs.add({
            type: 'warning',
            title: `📊 Byudjet 80% ga yetdi`,
            msg: `${Utils.catInfo(b.cat).n}: ${Utils.fmtMoney(b.spent)} / ${Utils.fmtMoney(b.limit)} (${b.pct}%)`,
            relatedId: 'budget_warn_' + b.cat
          });
        }
      }
    });
  }
};

/* ════════════════════════════════════════════
   RECURRING — takrorlanuvchi xarajatlar
   ════════════════════════════════════════════ */
const Recurring = {
  _key: 'recurring',

  getAll() { return DB.get(this._key); },

  add(data) {
    const item = {
      id:          Utils.uid(),
      name:        data.name,
      amount:      data.amount,
      category:    data.category || 'utilities',
      frequency:   data.frequency || 'monthly', // 'monthly' | 'weekly'
      dayOfMonth:  data.dayOfMonth || 1,
      active:      true,
      lastAdded:   null,
      note:        data.note || null,
      createdAt:   new Date().toISOString(),
    };
    DB.add(this._key, item);
    return item;
  },

  toggle(id) {
    const item = DB.find(this._key, id);
    if (item) DB.update(this._key, id, { active: !item.active });
  },

  del(id) { DB.remove(this._key, id); },

  /* Bugun qo'shilishi kerak bo'lganlarni tekshirish */
  checkAndApply() {
    const today = Utils.today();
    const dom   = new Date().getDate(); // kunning raqami

    this.getAll().filter(r => r.active).forEach(r => {
      if (r.lastAdded === today) return; // bugun allaqachon qo'shilgan

      let shouldAdd = false;
      if (r.frequency === 'monthly' && dom === r.dayOfMonth) shouldAdd = true;
      if (r.frequency === 'weekly'  && new Date().getDay() === (r.dayOfWeek || 1)) shouldAdd = true;

      if (shouldAdd) {
        DB.add('expenses', {
          id:          Utils.uid(),
          description: r.name + ' (avtomatik)',
          amount:      r.amount,
          category:    r.category,
          date:        today,
          createdAt:   new Date().toISOString(),
          recurring:   true,
          recurringId: r.id,
        });
        DB.update(this._key, r.id, { lastAdded: today });
        Notifs.add({
          type:  'info',
          title: `🔄 Avtomatik xarajat qo'shildi`,
          msg:   `${r.name} — ${Utils.fmtMoney(r.amount)}`,
          relatedId: 'rec_' + r.id,
        });
      }
    });
  },

  /* Keyingi sana */
  nextDate(r) {
    const today = new Date();
    if (r.frequency === 'monthly') {
      let d = new Date(today.getFullYear(), today.getMonth(), r.dayOfMonth);
      if (d <= today) d = new Date(today.getFullYear(), today.getMonth() + 1, r.dayOfMonth);
      return d.toISOString().split('T')[0];
    }
    return Utils.addDays(Utils.today(), 7);
  }
};

/* ════════════════════════════════════════════
   FORECAST — xarajat bashorati
   ════════════════════════════════════════════ */
const Forecast = {
  /* Joriy oy oxiriga qancha sarflanishini hisoblash */
  thisMonth() {
    const today    = Utils.today();
    const month    = today.slice(0, 7);
    const dayNum   = new Date().getDate();
    const daysInM  = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

    const spent = DB.get('expenses')
      .filter(e => e.date && e.date.startsWith(month))
      .reduce((s, e) => s + e.amount, 0);

    if (dayNum === 0) return { spent, forecast: spent, remaining: daysInM };

    const dailyAvg  = spent / dayNum;
    const forecast  = Math.round(dailyAvg * daysInM);
    const remaining = daysInM - dayNum;
    const diffPct   = spent > 0 ? Math.round(((forecast - spent) / spent) * 100) : 0;

    return { spent, forecast, dailyAvg: Math.round(dailyAvg), remaining, daysInM, dayNum, diffPct };
  },

  /* So'nggi 6 oy trend */
  monthlyTrend() {
    const result = [];
    for (let i = 5; i >= 0; i--) {
      const d     = new Date();
      d.setMonth(d.getMonth() - i);
      const month = d.toISOString().slice(0, 7);
      const name  = d.toLocaleDateString('uz-UZ', { month: 'short' });
      const total = DB.get('expenses')
        .filter(e => e.date && e.date.startsWith(month))
        .reduce((s, e) => s + e.amount, 0);
      result.push({ month, name, total });
    }
    return result;
  }
};

/* ════════════════════════════════════════════
   PUSH NOTIFICATIONS — brauzer bildirishnomalari
   ════════════════════════════════════════════ */
const PushNotif = {
  async request() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  },

  isGranted() { return 'Notification' in window && Notification.permission === 'granted'; },

  send(title, body, icon = '💰') {
    if (!this.isGranted()) return;
    try {
      new Notification(title, { body, icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">' + icon + '</text></svg>' });
    } catch (e) { console.warn('Push notif:', e); }
  },

  /* Muddati o'tgan qarzlar uchun push yuborish */
  checkDebts() {
    if (!this.isGranted()) return;
    DB.get('debts').filter(d => !d.paid && d.deadline).forEach(d => {
      const st = Utils.dlStatus(d.deadline);
      if (!st) return;
      if (st.cls === 'dl-over')  this.send('⚠️ Muddati o\'tgan qarz!', `${d.description} — ${Utils.fmtMoney(d.amount)}`);
      if (st.cls === 'dl-today') this.send('🔔 Bugun muddat tugaydi!', `${d.description} — ${Utils.fmtMoney(d.amount)}`);
    });
  }
};

/* ════════════════════════════════════════════
   EXPORT — CSV va JSON yuklab olish
   ════════════════════════════════════════════ */
const Exporter = {
  /* CSV eksport */
  toCSV(type, month) {
    let rows, headers, filename;

    if (type === 'expenses') {
      let data = DB.get('expenses');
      if (month) data = data.filter(e => e.date && e.date.startsWith(month));
      headers  = ['Sana', 'Tavsif', 'Kategoriya', "Summa (so'm)", 'Izoh'];
      rows     = data.map(e => [
        e.date,
        `"${e.description}"`,
        Utils.catInfo(e.category).n,
        e.amount,
        `"${e.note || ''}"`,
      ]);
      filename = `xarajatlar_${month || 'hammasi'}.csv`;
    } else {
      let data = DB.get('debts');
      if (month) data = data.filter(d => d.date && d.date.startsWith(month));
      headers  = ['Sana', 'Tur', 'Tavsif', 'Shaxs', "Summa (so'm)", 'Muddat', "To'landi"];
      rows     = data.map(d => [
        d.date,
        d.type === 'debt_out' ? 'Berdim' : 'Oldim',
        `"${d.description}"`,
        `"${d.person || ''}"`,
        d.amount,
        d.deadline || '',
        d.paid ? 'Ha' : "Yo'q",
      ]);
      filename = `qarzlar_${month || 'hammasi'}.csv`;
    }

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    this._download('\ufeff' + csv, filename, 'text/csv;charset=utf-8');
  },

  /* JSON eksport (to'liq backup) */
  toJSON() {
    const data = {
      exportedAt: new Date().toISOString(),
      user:       Auth.current()?.username,
      expenses:   DB.get('expenses'),
      debts:      DB.get('debts'),
      budgets:    DB.get('budgets'),
      recurring:  DB.get('recurring'),
    };
    this._download(JSON.stringify(data, null, 2), `finapp_backup_${Utils.today()}.json`, 'application/json');
  },

  /* Hisobot matni */
  summary(month) {
    month = month || Utils.today().slice(0, 7);
    const expenses = DB.get('expenses').filter(e => e.date && e.date.startsWith(month));
    const debts    = DB.get('debts').filter(d => d.date && d.date.startsWith(month));
    const total    = expenses.reduce((s, e) => s + e.amount, 0);

    const byCat = {};
    expenses.forEach(e => byCat[e.category] = (byCat[e.category] || 0) + e.amount);
    const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];

    return {
      month,
      total,
      count: expenses.length,
      topCategory: topCat ? { name: Utils.catInfo(topCat[0]).n, amount: topCat[1], pct: Math.round(topCat[1]/total*100) } : null,
      debtsAdded: debts.length,
    };
  },

  _download(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }
};

/* ════════════════════════════════════════════
   SPLIT — guruh xarajat bo'lish
   ════════════════════════════════════════════ */
const Split = {
  _key: 'splits',

  getAll() { return DB.get(this._key); },

  create(data) {
    const item = {
      id:       Utils.uid(),
      title:    data.title,
      total:    data.total,
      persons:  data.persons.map(name => ({
        name,
        share: Math.round(data.total / data.persons.length),
        paid:  false,
      })),
      date:     Utils.today(),
      createdAt: new Date().toISOString(),
    };
    DB.add(this._key, item);
    return item;
  },

  markPaid(splitId, personName) {
    const all = this.getAll();
    const split = all.find(s => s.id === splitId);
    if (!split) return;
    split.persons = split.persons.map(p => p.name === personName ? { ...p, paid: true } : p);
    DB.set(this._key, all);
  },

  del(id) { DB.remove(this._key, id); },

  /* Havola yaratish */
  shareLink(splitId) {
    const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
    return `${base}finance_split.html?view=${splitId}`;
  }
};

/* ════════════════════════════════════════════
   SERVICE WORKER — offline rejim ro'yxatdan o'tkazish
   ════════════════════════════════════════════ */
const SW = {
  async register() {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('sw.js');
    } catch (e) { console.warn('SW:', e); }
  }
};

/* ════════════════════════════════════════════
   ONBOARDING — birinchi kirish qo'llanmasi
   ════════════════════════════════════════════ */
const Onboarding = {
  _key() { const u = Auth.current(); return u ? 'fin_ob_' + u.id : null; },
  done()  { const k = this._key(); return k ? !!localStorage.getItem(k) : true; },
  finish(){ const k = this._key(); if (k) localStorage.setItem(k, '1'); },

  check() {
    if (!this.done()) {
      window.location.href = 'finance_onboarding.html';
      return false;
    }
    return true;
  }
};

/* ════════════════════════════════════════════
   APP init — yangilangan versiya
   ════════════════════════════════════════════ */


/* ════════════════════════════════════════════
   API SYNC — server.py orqali sayt + bot sinxronlash
   ════════════════════════════════════════════ */
const TelegramSync = {
  _timer:    null,
  _lastHash: '',
  _apiUrl:   null,
  _apiKey:   'finapp2024secret',

  /* API URL ni aniqlash */
  getApiUrl() {
    if (this._apiUrl) return this._apiUrl;
    // 1. localStorage dan oldin saqlangan URL
    const saved = localStorage.getItem('fin_api_url');
    if (saved) { this._apiUrl = saved; return saved; }
    // 2. Sayt Railway da joylashgan bo'lsa — o'zi
    if (location.hostname.includes('railway.app')) {
      this._apiUrl = location.origin;
      return this._apiUrl;
    }
    // 3. GitHub Pages — API URL yo'q, sinxron ishlamaydi
    return null;
  },

  /* API URL ni o'rnatish (sozlamalardan) */
  setApiUrl(url) {
    this._apiUrl = url.trim().replace(/\/$/, '');
    localStorage.setItem('fin_api_url', this._apiUrl);
  },

  /* Sarlavha */
  _headers() {
    return { 'X-API-Key': this._apiKey, 'Content-Type': 'application/json' };
  },

  /* API orqali login/register tekshirish */
  async verifyOnServer(username, password) {
    const base = this.getApiUrl();
    if (!base) return null;
    try {
      const r = await fetch(`${base}/api/login`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({ username, password }),
      });
      const d = await r.json();
      return d.ok ? d.user : null;
    } catch { return null; }
  },

  async registerOnServer(username, password) {
    const base = this.getApiUrl();
    if (!base) return null;
    try {
      const r = await fetch(`${base}/api/register`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({ username, password }),
      });
      const d = await r.json();
      return d.ok ? d.user : (d.error || null);
    } catch { return null; }
  },

  /* Serverga xarajat yuborish */
  async pushExpense(exp) {
    const base = this.getApiUrl();
    if (!base) return;
    const u = Auth.current();
    if (!u) return;
    try {
      await fetch(`${base}/api/expenses`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({ ...exp, userId: u.id }),
      });
    } catch {}
  },

  /* Serverga qarz yuborish */
  async pushDebt(debt) {
    const base = this.getApiUrl();
    if (!base) return;
    const u = Auth.current();
    if (!u) return;
    try {
      await fetch(`${base}/api/debts`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({ ...debt, userId: u.id }),
      });
    } catch {}
  },

  /* Serverdan yangi ma'lumotlarni olish */
  async sync() {
    const base = this.getApiUrl();
    if (!base) return;
    const u = Auth.current();
    if (!u) return;

    try {
      // Serverga barcha local ma'lumotlarni yuborish va yangilarini olish
      const myExps  = DB.get('expenses');
      const myDebts = DB.get('debts');

      const r = await fetch(`${base}/api/sync`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({
          userId:   u.id,
          expenses: myExps,
          debts:    myDebts,
        }),
      });
      if (!r.ok) return;
      const data = await r.json();
      if (!data.ok) return;

      // Hash tekshirish
      const newHash = JSON.stringify([
        (data.expenses||[]).map(e=>e.id),
        (data.debts||[]).map(d=>d.id),
      ]);
      if (newHash === this._lastHash) return;
      this._lastHash = newHash;

      // Yangi kelgan xarajatlar
      const expIds  = new Set(myExps.map(e=>e.id));
      const newExps = (data.expenses||[]).filter(e=>!expIds.has(e.id));
      if (newExps.length) {
        const merged = [...newExps, ...myExps];
        DB.set('expenses', merged);
      }

      // Yangi kelgan qarzlar
      const debtIds  = new Set(myDebts.map(d=>d.id));
      const newDebts = (data.debts||[]).filter(d=>!debtIds.has(d.id));
      if (newDebts.length) {
        const merged = [...newDebts, ...myDebts];
        DB.set('debts', merged);
      }

      if (newExps.length || newDebts.length) {
        App.refresh();
        if (typeof pageRefresh === 'function') pageRefresh();
        Toast.show(`📱 Telegramdan yangi ma'lumot keldi ✅`, 'ok', 3000);
      }

    } catch {}
  },

  startPolling() {
    if (this._timer) return;
    this.sync();
    this._timer = setInterval(() => this.sync(), 5000);
  },

  stopPolling() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }
};

/* ════════════════════════════════════════════
   GOALS — Moliyaviy Maqsadlar & Jamg'arma
   ════════════════════════════════════════════ */
const Goals = {
  _key: 'goals',
  getAll() {
    let list = DB.get(this._key);
    if (!Array.isArray(list)) list = [];
    // Eski demo maqsadlarni tozalash (agar saqlanib qolgan bo'lsa)
    const filtered = list.filter(g => g.id !== 'g_demo1' && g.id !== 'g_demo2');
    if (filtered.length !== list.length) {
      list = filtered;
      DB.set(this._key, list);
    }
    return list;
  },
  save(arr) {
    DB.set(this._key, arr);
  },
  add(goal) {
    const item = {
      id: 'g_' + Date.now().toString(36),
      title: goal.title.trim(),
      targetAmount: Number(goal.targetAmount) || 0,
      currentAmount: Number(goal.currentAmount) || 0,
      icon: goal.icon || '🎯',
      color: goal.color || '#7c6aff',
      category: goal.category || 'general',
      deadline: goal.deadline || '',
      createdAt: new Date().toISOString(),
      history: goal.currentAmount > 0 ? [{ type: 'deposit', amount: Number(goal.currentAmount), note: 'Boshlang\'ich', date: new Date().toISOString() }] : []
    };
    const list = this.getAll();
    list.unshift(item);
    this.save(list);
    Achievements.check();
    return item;
  },
  deposit(id, amt, note = '') {
    amt = Number(amt) || 0;
    if (amt <= 0) return { ok: false, msg: "Noto'g'ri summa" };
    const list = this.getAll();
    const g = list.find(x => x.id === id);
    if (!g) return { ok: false, msg: "Maqsad topilmadi" };
    g.currentAmount = (Number(g.currentAmount) || 0) + amt;
    g.history = g.history || [];
    g.history.unshift({ type: 'deposit', amount: amt, note: note || 'Jamg\'arma qo\'shildi', date: new Date().toISOString() });
    this.save(list);
    Achievements.check();
    return { ok: true, goal: g };
  },
  withdraw(id, amt, note = '') {
    amt = Number(amt) || 0;
    if (amt <= 0) return { ok: false, msg: "Noto'g'ri summa" };
    const list = this.getAll();
    const g = list.find(x => x.id === id);
    if (!g) return { ok: false, msg: "Maqsad topilmadi" };
    if ((g.currentAmount || 0) < amt) return { ok: false, msg: "Maqsadda buncha mablag' yo'q" };
    g.currentAmount -= amt;
    g.history = g.history || [];
    g.history.unshift({ type: 'withdraw', amount: amt, note: note || 'Mablag\' yechildi', date: new Date().toISOString() });
    this.save(list);
    return { ok: true, goal: g };
  },
  delete(id) {
    DB.remove(this._key, id);
  }
};

/* ════════════════════════════════════════════
   WALLETS — Ko'p hamyonlar (Multi-Wallets)
   ════════════════════════════════════════════ */
const Wallets = {
  _key: 'wallets',
  getAll() {
    let list = DB.get(this._key);
    if (!Array.isArray(list)) list = [];
    // Eski demo hamyonlarni tozalash (agar faqat demo kiritilgan bo'lsa)
    const demoIds = ['w_cash', 'w_uzcard', 'w_humo', 'w_visa', 'w_vault'];
    const filtered = list.filter(w => !demoIds.includes(w.id));
    if (filtered.length !== list.length) {
      list = filtered;
      DB.set(this._key, list);
    }
    return list;
  },
  save(arr) {
    DB.set(this._key, arr);
  },
  get(id) {
    return this.getAll().find(w => w.id === id);
  },
  add(w) {
    const item = {
      id: 'w_' + Date.now().toString(36),
      name: w.name.trim(),
      icon: w.icon || '💳',
      type: w.type || 'card',
      color: w.color || '#7c6aff',
      balance: Number(w.balance) || 0,
      createdAt: new Date().toISOString()
    };
    const list = this.getAll();
    list.push(item);
    this.save(list);
    return item;
  },
  updateBalance(id, delta) {
    const list = this.getAll();
    const w = list.find(x => x.id === id);
    if (w) {
      const newBalance = (Number(w.balance) || 0) + delta;
      // Manfiy balansga ruxsat bermaslik
      if (delta < 0 && newBalance < 0) {
        return { ok: false, msg: `Mablag' yetarli emas! Balans: ${(Number(w.balance)||0).toLocaleString('uz-UZ')} so'm` };
      }
      w.balance = newBalance;
      this.save(list);
      return { ok: true };
    }
    return { ok: false, msg: 'Hamyon topilmadi' };
  },
  transfer(fromId, toId, amount, note = '') {
    amount = Number(amount) || 0;
    if (amount <= 0 || fromId === toId) return { ok: false, msg: "Noto'g'ri summa yoki hamyon" };
    const list = this.getAll();
    const fromW = list.find(x => x.id === fromId);
    const toW = list.find(x => x.id === toId);
    if (!fromW || !toW) return { ok: false, msg: "Hamyon topilmadi" };
    if (Number(fromW.balance) < amount) return { ok: false, msg: "Mablag' yetarli emas" };
    fromW.balance = Number(fromW.balance) - amount;
    toW.balance = Number(toW.balance) + amount;
    this.save(list);

    // Transfer tarixini saqlash
    const transfers = DB.get('transfers') || [];
    transfers.unshift({
      id: 'tr_' + Date.now().toString(36),
      fromId, fromName: fromW.name,
      toId, toName: toW.name,
      amount, note,
      date: new Date().toISOString()
    });
    DB.set('transfers', transfers);
    Achievements.check();
    return { ok: true, msg: "Muvaffaqiyatli o'tkazildi" };
  },
  delete(id) {
    DB.remove(this._key, id);
  },
  getTotalBalance() {
    return this.getAll().reduce((sum, w) => sum + (Number(w.balance) || 0), 0);
  }
};

/* ════════════════════════════════════════════
   AI ADVISOR — Aqlli Moliyaviy Maslahatchi
   ════════════════════════════════════════════ */
const AIAdvisor = {
  getInsights() {
    const exp = DB.get('expenses') || [];
    const debts = DB.get('debts') || [];
    const budgets = DB.get('budgets') || [];
    const goals = Goals.getAll();
    const today = Utils.today();
    const thisMonth = today.slice(0, 7);

    const insights = [];

    // 1. Oylik xarajatlar tahlili
    const thisMonthExp = exp.filter(e => e.date && e.date.startsWith(thisMonth));
    const totalMonth = thisMonthExp.reduce((s, e) => s + e.amount, 0);
    const dayOfMonth = Math.max(1, Number(today.slice(8, 10)) || 1);
    const avgPerDay = Math.round(totalMonth / dayOfMonth);

    // Kategoriya bo'yicha eng katta xarajat
    const catMap = {};
    thisMonthExp.forEach(e => {
      catMap[e.category] = (catMap[e.category] || 0) + e.amount;
    });
    let topCat = null;
    let topCatAmt = 0;
    for (let c in catMap) {
      if (catMap[c] > topCatAmt) {
        topCatAmt = catMap[c];
        topCat = c;
      }
    }

    if (topCat && totalMonth > 0) {
      const pct = Math.round((topCatAmt / totalMonth) * 100);
      const cInfo = Utils.catInfo(topCat);
      insights.push({
        type: pct > 40 ? 'warning' : 'tip',
        icon: cInfo.e || '💡',
        title: `${cInfo.n} xarajatlari ustunlik qilmoqda`,
        text: `Bu oy jami xarajatlaringizning ${pct}% qismi (${Utils.fmtMoney(topCatAmt)}) aynan "${cInfo.n}"ga sarflandi. ${pct > 40 ? 'Biroz tejamkorlik rejasini qo\'llash tavsiya etiladi.' : 'Balans yaxshi saqlanmoqda.'}`
      });
    }

    // 2. Byudjet nazorati
    if (budgets && budgets.length > 0) {
      let overCount = 0;
      budgets.forEach(b => {
        const spent = thisMonthExp.filter(e => e.category === b.category).reduce((s, e) => s + e.amount, 0);
        if (spent > b.limit) overCount++;
      });
      if (overCount > 0) {
        insights.push({
          type: 'alert',
          icon: '⚠️',
          title: `${overCount} ta toifada byudjet limiti oshdi`,
          text: `Rejalashtirilgan oylik byudjet limitidan ortiqcha xarajat qilindi. Byudjet bo'limida nazoratni kuchaytiring.`
        });
      }
    }

    // 3. Qarz muddatlari
    const upcomingDebts = debts.filter(d => !d.paid && d.deadline && d.type === 'debt_out');
    const urgent = upcomingDebts.filter(d => {
      const days = Math.round((new Date(d.deadline) - new Date(today)) / (1000 * 60 * 60 * 24));
      return days >= 0 && days <= 5;
    });
    if (urgent.length > 0) {
      insights.push({
        type: 'warning',
        icon: '⏳',
        title: `Yaqin 5 kunda to'lanishi kerak bo'lgan qarzlar bor`,
        text: `${urgent.length} ta qarz muddati kelmoqda. O'z vaqtida to'lab qarzdan forig' bo'ling!`
      });
    }

    // 4. Tejamkorlik va Maqsadlar
    if (goals.length > 0) {
      const activeGoal = goals[0];
      const progress = Math.min(100, Math.round((activeGoal.currentAmount / activeGoal.targetAmount) * 100));
      insights.push({
        type: 'success',
        icon: '🎯',
        title: `Maqsad: "${activeGoal.title}" (${progress}%)`,
        text: `Maqsadga to'liq yetish uchun yana ${Utils.fmtMoney(Math.max(0, activeGoal.targetAmount - activeGoal.currentAmount))} kerak. Kunlik jamg'arma orqali marraga yaqinlashasiz!`
      });
    }

    // Umumiy maslahat
    if (insights.length === 0) {
      insights.push({
        type: 'tip',
        icon: '🤖',
        title: 'Moliyaviy intizom — kelajak asosi',
        text: 'Har kungi xarajatlarni o\'z vaqtida kiritib boring. Oylik jamg\'armani doim birinchi o\'ringa qo\'ying.'
      });
    }

    return insights;
  }
};

/* ════════════════════════════════════════════
   ACHIEVEMENTS — Gamifikatsiya & Yutuqlar
   ════════════════════════════════════════════ */
const Achievements = {
  list: [
    { id: 'first_entry', title: 'Ilk Qadam', desc: 'Birinchi xarajatni qayd eting', icon: '🌱' },
    { id: 'streak_7', title: '7 Kunlik Intizom', desc: 'Kamida 7 ta xarajat qayd eting', icon: '⚡' },
    { id: 'goal_creator', title: 'Orzular Sari', desc: 'Birinchi jamg\'arma maqsadini yarating', icon: '🎯' },
    { id: 'goal_winner', title: 'Zafar', desc: 'Kamida 1 ta maqsadni to\'ldiring', icon: '🏆' },
    { id: 'multi_wallet', title: 'Katta Hamyon', desc: 'Hamyonlar aro pul o\'tkazing', icon: '💳' },
    { id: 'debt_free', title: 'Qarzsiz Hayot', desc: 'Barcha qarzlarni vaqtida yoping', icon: '🤝' },
    { id: 'millionaire', title: 'Jamg\'aruvchi', desc: '1 000 000 so\'mdan ortiq jamg\'aring', icon: '💎' }
  ],
  check() {
    const exp = DB.get('expenses') || [];
    const debts = DB.get('debts') || [];
    const goals = Goals.getAll();
    const transfers = DB.get('transfers') || [];
    const totalSaved = Wallets.getTotalBalance();

    const unlocked = [];
    if (exp.length >= 1) unlocked.push('first_entry');
    if (exp.length >= 7) unlocked.push('streak_7');
    if (goals.length >= 1) unlocked.push('goal_creator');
    if (goals.some(g => g.currentAmount >= g.targetAmount && g.targetAmount > 0)) unlocked.push('goal_winner');
    if (transfers.length >= 1) unlocked.push('multi_wallet');
    if (debts.length > 0 && debts.every(d => d.paid)) unlocked.push('debt_free');
    if (totalSaved >= 1000000) unlocked.push('millionaire');

    const u = Auth.current();
    const key = u ? 'fin_achievements_' + u.id : 'fin_achievements_global';
    localStorage.setItem(key, JSON.stringify(unlocked));
    return unlocked;
  },
  getUnlocked() {
    const u = Auth.current();
    const key = u ? 'fin_achievements_' + u.id : 'fin_achievements_global';
    return JSON.parse(localStorage.getItem(key) || '[]');
  }
};

/* ════════════════════════════════════════════
   RECEIPT SCANNER — Chek skanerlash
   ════════════════════════════════════════════ */
const ReceiptScanner = {
  scan(file, callback) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      setTimeout(() => {
        const sampleAmounts = [15000, 28000, 54000, 85000, 140000, 42000, 195000];
        const sampleCats = ['food', 'shopping', 'transport', 'other'];
        const sampleNames = ['Supermarket xaridi', 'Kafeda tushlik', 'Kantselyariya tovarlari', 'Dorixona', 'Yoqilg\'i / Benzin'];

        const detectedAmount = sampleAmounts[Math.floor(Math.random() * sampleAmounts.length)];
        const detectedCat = sampleCats[Math.floor(Math.random() * sampleCats.length)];
        const detectedName = sampleNames[Math.floor(Math.random() * sampleNames.length)];

        callback({
          ok: true,
          amount: detectedAmount,
          category: detectedCat,
          description: detectedName,
          imageSrc: e.target.result
        });
      }, 1000);
    };
    reader.readAsDataURL(file);
  }
};

/* ════════════════════════════════════════════
   REPORT EXPORTER — PDF va Excel eksport
   ════════════════════════════════════════════ */
const ReportExporter = {
  exportCSV() {
    const exp = DB.get('expenses') || [];
    if (exp.length === 0) {
      Toast.show("Eksport qilish uchun xarajatlar yo'q", "warn");
      return;
    }
    let csv = "ID,Tavsif,Toifa,Summa,Sana\n";
    exp.forEach(e => {
      const cat = Utils.catInfo(e.category);
      csv += `"${e.id}","${e.description}","${cat.n}","${e.amount}","${e.date}"\n`;
    });
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `FinApp_Hisobot_${Utils.today()}.csv`;
    link.click();
    Toast.show("Excel/CSV hisobot yuklab olindi ✅", "ok");
  },
  exportPDF() {
    window.print();
  }
};

/* ════════════════════════════════════════════
   SIDEBAR uchun yordamchi — barcha sahifalar
   ════════════════════════════════════════════ */
function renderSidebarNew() {
  const nav = document.querySelector('.sb-nav');
  if (!nav || nav.dataset.extended) return;
  nav.dataset.extended = '1';

  const curPage = location.pathname.split('/').pop();

  const extra = document.createElement('div');
  extra.innerHTML = `
    <div class="sb-divider"></div>
    <div class="sb-section">Jamg'arma & Hamyonlar</div>
    <a href="finance_goals.html"     class="sb-item ${curPage==='finance_goals.html'?'on':''}"><span class="sb-ico">🎯</span>Maqsadlar (Kopilka)<span class="sb-new">Yangi</span></a>
    <a href="finance_wallets.html"   class="sb-item ${curPage==='finance_wallets.html'?'on':''}"><span class="sb-ico">💳</span>Hamyonlar<span class="sb-new">Yangi</span></a>
    <div class="sb-divider"></div>
    <div class="sb-section">Tahlil & Boshqaruv</div>
    <a href="finance_budget.html"     class="sb-item ${curPage==='finance_budget.html'?'on':''}"><span class="sb-ico">📊</span>Byudjet</a>
    <a href="finance_analytics.html"  class="sb-item ${curPage==='finance_analytics.html'?'on':''}"><span class="sb-ico">📈</span>Analitika</a>
    <a href="finance_recurring.html"  class="sb-item ${curPage==='finance_recurring.html'?'on':''}"><span class="sb-ico">🔄</span>Takrorlanuvchi</a>
    <a href="finance_split.html"      class="sb-item ${curPage==='finance_split.html'?'on':''}"><span class="sb-ico">👥</span>Guruh bo'lish</a>
    <div class="sb-divider"></div>
    <a href="finance_telegram.html"   class="sb-item ${curPage==='finance_telegram.html'?'on':''}"><span class="sb-ico">🤖</span>Telegram Bot<span class="sb-new" style="background:#22c55e">Faol</span></a>
    <a href="finance_settings.html"   class="sb-item ${curPage==='finance_settings.html'?'on':''}"><span class="sb-ico">⚙️</span>Sozlamalar</a>
  `;
  nav.appendChild(extra);
}



/* ════════════════════════════════════════════
   DEVICE LAYOUT
   ════════════════════════════════════════════ */
const DeviceLayout = {
  _key() {
    const u = Auth.current();
    return u ? 'fin_device_' + u.id : 'fin_device_global';
  },

  get() {
    const u = Auth.current();
    if (u && localStorage.getItem('fin_device_' + u.id)) {
      return localStorage.getItem('fin_device_' + u.id);
    }
    return localStorage.getItem('fin_device_global') || 'desktop';
  },

  set(type) {
    const u = Auth.current();
    if (u) localStorage.setItem('fin_device_' + u.id, type);
    localStorage.setItem('fin_device_global', type);
    this.apply(type);
  },

  select(type) {
    this.set(type);
    const names = { mobile: 'Telefon (390px)', tablet: 'Planshet (840px)', desktop: 'Kompyuter (To\'liq ekran)' };
    if (typeof Toast !== 'undefined' && Toast.show) {
      Toast.show(`Qurilma rejimi: ${names[type] || type} ✅`, 'info', 2000);
    }
  },

  /* Sahifaga qurilma layout qo'llash */
  apply(type) {
    type = type || this.get();
    document.documentElement.setAttribute('data-device', type);
    document.body.setAttribute('data-device', type);

    // Switcher tugmalaridagi active klassni yangilash
    document.querySelectorAll('.fdb-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.dev === type);
    });

    // Mobil sidebar toggle va overlay ni sozlash
    const toggle  = document.getElementById('sb-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sb-overlay');

    if (toggle && sidebar) {
      const newToggle = toggle.cloneNode(true);
      toggle.parentNode.replaceChild(newToggle, toggle);
      newToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.toggle('open');
        overlay?.classList.toggle('show');
      });
      if (overlay) {
        overlay.addEventListener('click', () => {
          sidebar.classList.remove('open');
          overlay.classList.remove('show');
        });
      }
    }
  },

  /* Suzuvchi Qurilma almashtirgich panelini chiqarish */
  renderSwitcher() {
    const page = location.pathname.split('/').pop();
    if (page === 'finance_device.html' || document.getElementById('fin-device-bar')) return;

    const cur = this.get();
    const bar = document.createElement('div');
    bar.id = 'fin-device-bar';
    bar.className = 'fin-device-bar';
    bar.innerHTML = `
      <div class="fdb-inner">
        <span class="fdb-label">Qurilma:</span>
        <div class="fdb-btns">
          <button class="fdb-btn ${cur==='mobile'?'active':''}" data-dev="mobile" onclick="DeviceLayout.select('mobile')" title="Telefon o'lchami (390px)">📱 Telefon</button>
          <button class="fdb-btn ${cur==='tablet'?'active':''}" data-dev="tablet" onclick="DeviceLayout.select('tablet')" title="Planshet o'lchami (840px)">📟 Planshet</button>
          <button class="fdb-btn ${cur==='desktop'?'active':''}" data-dev="desktop" onclick="DeviceLayout.select('desktop')" title="Kompyuter to'liq ekran">🖥️ Kompyuter</button>
        </div>
        <a href="finance_device.html" class="fdb-opt" title="Qurilmani qayta tanlash sahifasi">⚙️</a>
      </div>
    `;
    document.body.appendChild(bar);
  },

  /* Qurilma nomini qaytarish */
  name() {
    return { mobile: 'Telefon 📱', tablet: 'Planshet 📟', desktop: 'Kompyuter 🖥️' }[this.get()] || 'Kompyuter 🖥️';
  }
};



/* ════════════════════════════════════════════
   PRIVACY MODE — Balanslarni yashirish 👁️
   ════════════════════════════════════════════ */
const PrivacyMode = {
  _key: 'fin_privacy',
  isOn() { return localStorage.getItem(this._key) === '1'; },
  toggle() {
    const next = !this.isOn();
    localStorage.setItem(this._key, next ? '1' : '0');
    this.apply(next);
    Toast.show(next ? '🙈 Balanslar yashirildi' : '👁️ Balanslar ko\'rsatildi', 'info', 2000);
    return next;
  },
  apply(on) {
    if (on === undefined) on = this.isOn();
    document.body.classList.toggle('privacy-active', on);
    document.querySelectorAll('.privacy-btn').forEach(btn => {
      btn.classList.toggle('active', on);
      btn.textContent = on ? '🙈 Yashirilgan' : '👁️ Balanslar';
    });
  },
  init() { this.apply(); }
};

/* ════════════════════════════════════════════
   HEALTH SCORE — Moliyaviy Salomatlik 💯
   ════════════════════════════════════════════ */
const HealthScore = {
  calculate() {
    const exp   = DB.get('expenses') || [];
    const debts = DB.get('debts')   || [];
    const goals = Goals.getAll()    || [];
    const today = Utils.today();
    const month = today.slice(0, 7);

    const monthExp   = exp.filter(e => e.date && e.date.startsWith(month));
    const totalSpent = monthExp.reduce((s, e) => s + e.amount, 0);
    let score = 50;
    const details = [];

    // 1. Qayd odati (max 20 ball)
    const uniqueDays = new Set(exp.map(e => e.date)).size;
    const dayNum     = Math.max(1, parseInt(today.slice(8, 10)) || 1);
    const habitPct   = Math.min(1, uniqueDays / dayNum);
    const habitScore = Math.round(habitPct * 20);
    score += habitScore;
    details.push({ label: 'Qayd odati', pct: Math.round(habitPct * 100), color: '#7c6aff' });

    // 2. Qarz holati (max 15 ball)
    const openDebts = debts.filter(d => !d.paid);
    const debtScore = openDebts.length === 0 ? 15 : Math.max(0, 15 - openDebts.length * 3);
    score += debtScore;
    details.push({ label: 'Qarz holati', pct: Math.round((debtScore / 15) * 100), color: '#22c55e' });

    // 3. Maqsad (max 15 ball)
    const goalScore = Math.min(15, goals.length * 5);
    score += goalScore;
    details.push({ label: "Jamg'arma", pct: Math.round((goalScore / 15) * 100), color: '#f59e0b' });

    // Muddati o'tgan qarzlar uchun minus
    const overdue = debts.filter(d => !d.paid && d.deadline && Utils.daysLeft(d.deadline) < 0);
    score -= overdue.length * 5;
    score  = Math.max(0, Math.min(100, score));

    let label, color;
    if      (score >= 85) { label = "A'lo 🏆";          color = '#22c55e'; }
    else if (score >= 70) { label = 'Yaxshi 👍';         color = '#7c6aff'; }
    else if (score >= 50) { label = "O'rtacha ⚡";       color = '#f59e0b'; }
    else                  { label = "Yaxshilash kerak 📈"; color = '#ef4444'; }

    return { score, label, color, details, totalSpent };
  },

  render(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const d    = this.calculate();
    const r    = 38;
    const circ = 2 * Math.PI * r;
    const dash = circ * (d.score / 100);

    el.innerHTML = `
      <div class="health-score-card">
        <div class="hs-top">
          <div class="hs-title">💯 Moliyaviy Salomatlik Indeksi</div>
          <div class="hs-badge">Oylik baholash</div>
        </div>
        <div class="hs-main">
          <div class="hs-ring">
            <svg width="96" height="96" viewBox="0 0 96 96">
              <circle cx="48" cy="48" r="${r}" fill="none"
                stroke="rgba(255,255,255,0.06)" stroke-width="8"/>
              <circle cx="48" cy="48" r="${r}" fill="none"
                stroke="${d.color}" stroke-width="8"
                stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}"
                stroke-linecap="round"/>
            </svg>
            <div class="hs-ring-text">
              <div class="hs-score">${d.score}</div>
              <div class="hs-max">/100</div>
            </div>
          </div>
          <div class="hs-details">
            <div class="hs-label" style="color:${d.color}">${d.label}</div>
            <div class="hs-desc">${d.score >= 70
              ? "Moliyaviy boshqaruvingiz samarali. Shunday davom eting!"
              : "Kunlik xarajatlarni kiring, qarzlarni yoping va maqsad qo'shing."
            }</div>
            <div class="hs-bars">
              ${d.details.map(i => `
                <div class="hs-bar-row">
                  <div class="hs-bar-label">${i.label}</div>
                  <div class="hs-bar-track">
                    <div class="hs-bar-fill" style="width:${i.pct}%;background:${i.color}"></div>
                  </div>
                  <div class="hs-bar-pct">${i.pct}%</div>
                </div>`).join('')}
            </div>
          </div>
        </div>
      </div>`;
  },

  render503020(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const exp      = DB.get('expenses') || [];
    const month    = Utils.today().slice(0, 7);
    const monthExp = exp.filter(e => e.date && e.date.startsWith(month));
    const total    = monthExp.reduce((s, e) => s + e.amount, 0);

    if (total === 0) {
      el.innerHTML = `<div class="rule-widget"><div class="rule-title">📐 50/30/20 Qoidasi</div>
        <div style="text-align:center;color:var(--t3);padding:12px;font-size:13px">
          Tahlil uchun xarajat ma'lumotlari kerak</div></div>`;
      return;
    }

    const needed  = ['food','utilities','health','transport'];
    const wants   = ['entertainment','shopping'];
    const nAmt    = monthExp.filter(e => needed.includes(e.category)).reduce((s,e)=>s+e.amount,0);
    const wAmt    = monthExp.filter(e => wants.includes(e.category)).reduce((s,e)=>s+e.amount,0);
    const oAmt    = total - nAmt - wAmt;
    const pN = Math.round(nAmt / total * 100);
    const pW = Math.round(wAmt / total * 100);
    const pO = 100 - pN - pW;

    el.innerHTML = `
      <div class="rule-widget">
        <div class="rule-title">📐 50/30/20 Qoidasi — Bu oy tahlili</div>
        <div class="rule-bars">
          <div class="rule-seg" style="width:${pN}%;background:#3b82f6"></div>
          <div class="rule-seg" style="width:${pW}%;background:#f59e0b"></div>
          <div class="rule-seg" style="width:${pO}%;background:#7c6aff"></div>
        </div>
        <div class="rule-legend">
          <div class="rule-leg-item">
            <div class="rule-leg-dot" style="background:#3b82f6"></div>
            Zaruriyat ${pN}% (ideal: 50%)
          </div>
          <div class="rule-leg-item">
            <div class="rule-leg-dot" style="background:#f59e0b"></div>
            Xohish ${pW}% (ideal: 30%)
          </div>
          <div class="rule-leg-item">
            <div class="rule-leg-dot" style="background:#7c6aff"></div>
            Jamg'arma ${pO}% (ideal: 20%)
          </div>
        </div>
      </div>`;
  }
};

/* ════════════════════════════════════════════
   SMS PARSER — Click/Payme/Uzum 📱
   ════════════════════════════════════════════ */
const SMSParser = {
  parse(text) {
    if (!text || !text.trim()) return null;
    const t   = text.trim();
    const res = { raw: t, amount: null, description: '', category: 'other', source: null };

    // Click
    let m = t.match(/Click[^:]*[:.\s]+.*?(\d[\d\s,.]+)\s*(so[`']?m|UZS)/i);
    if (m) { res.amount = parseFloat(m[1].replace(/[\s,]/g,'')); res.source='Click'; res.description="Click to'lovi"; }

    // Payme
    if (!res.amount) {
      m = t.match(/Payme.*?(\d[\d\s,.]+)\s*(so[`']?m|UZS)/i)
       || t.match(/(\d[\d\s,.]+)\s*(UZS|so['`]?m)[^]*?Payme/i);
      if (m) { res.amount=parseFloat(m[1].replace(/[\s,]/g,'')); res.source='Payme'; res.description="Payme to'lovi"; }
    }

    // Uzum
    if (!res.amount) {
      m = t.match(/Uzum[^]*?(\d[\d\s,.]+)\s*(sum|so['`]?m|UZS)/i);
      if (m) { res.amount=parseFloat(m[1].replace(/[\s,]/g,'')); res.source='Uzum'; res.description='Uzum Bank'; }
    }

    // Bank SMS (Karta / Debet / Chiqim)
    if (!res.amount) {
      const card = t.match(/[*]{1,4}(\d{4})/);
      const am   = t.match(/(?:DEBET|Debet|Chiqim|chiqim)[:\s]+(\d[\d\s,.]+)\s*(UZS|so['`]?m|sum)/i);
      if (am) {
        res.amount      = parseFloat(am[1].replace(/[\s,]/g,''));
        res.source      = card ? 'Karta *'+card[1] : 'Bank SMS';
        res.description = 'Bank kartasidan chiqim';
      }
    }

    // Universal fallback
    if (!res.amount) {
      m = t.match(/(\d[\d\s]{3,})\s*(so['`]?m|UZS|sum)\b/i);
      if (m) res.amount = parseFloat(m[1].replace(/\s/g,''));
    }

    if (!res.amount || res.amount <= 0) return null;

    // Kategoriya aniqlash
    const cats = {
      food:          ['korzinka','makro','anhor','bozor','restoran','kafe','cafe','non','pizza','burger','donar','guruch'],
      transport:     ['yandex go','yandex','uber','taxi','taksi','benzin','avtobus','metro'],
      shopping:      ['zara','h&m','mediapark','texnomart','kiyim','poyabzal','dokon'],
      health:        ['apteka','dori','doktor','shifoxona','tibbiy'],
      utilities:     ['gaz','elektr','suv','internet','aloqa'],
      entertainment: ['kino','netflix','youtube','oyin','teatr']
    };
    for (const [cat, kws] of Object.entries(cats)) {
      if (kws.some(k => t.toLowerCase().includes(k))) {
        res.category = cat;
        if (!res.description || res.description.includes('Bank') || res.description.includes("to'lovi")) {
          const names = {food:'Oziq-ovqat', transport:'Transport', shopping:'Xarid', health:"Sog'liq", utilities:'Kommunal', entertainment:"Ko'ngilochar"};
          res.description = names[cat] || 'Xarajat';
        }
        break;
      }
    }

    return res;
  },

  addToExpenses(parsed) {
    if (!parsed || !parsed.amount) return false;
    DB.add('expenses', {
      id:          Utils.uid(),
      description: parsed.description || parsed.source || 'SMS Xarajat',
      amount:      parsed.amount,
      category:    parsed.category || 'other',
      date:        Utils.today(),
      createdAt:   new Date().toISOString(),
      smsSource:   parsed.source || null
    });
    App.refresh();
    if (typeof pageRefresh === 'function') pageRefresh();
    return true;
  }
};

/* ════════════════════════════════════════════
   FX — Konfetti + Audio Effektlar 🎉
   ════════════════════════════════════════════ */
const FX = {
  confetti(duration) {
    duration = duration || 3000;
    let canvas = document.getElementById('confetti-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'confetti-canvas';
      document.body.appendChild(canvas);
    }
    const ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#7c6aff','#a78bfa','#22c55e','#f59e0b','#ef4444','#3b82f6','#ec4899','#fff'];
    const parts  = [];
    for (let i = 0; i < 150; i++) {
      parts.push({
        x: Math.random() * canvas.width,
        y: Math.random() * -canvas.height * .5,
        w: Math.random() * 10 + 5,
        h: Math.random() * 5 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI * 2,
        rs:  (Math.random() - .5) * .15,
        vx: (Math.random() - .5) * 3,
        vy:  Math.random() * 3 + 2,
        op:  1
      });
    }
    const end = Date.now() + duration;
    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const left = end - Date.now();
      parts.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.rot += p.rs;
        if (left < 800) p.op = Math.max(0, left / 800);
        ctx.save();
        ctx.globalAlpha = p.op;
        ctx.translate(p.x + p.w/2, p.y + p.h/2);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx.restore();
      });
      if (Date.now() < end) requestAnimationFrame(loop);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    loop();
  },

  playSound(type) {
    try {
      const ac   = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);

      if (type === 'save') {
        osc.frequency.setValueAtTime(880, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ac.currentTime + .1);
        gain.gain.setValueAtTime(.25, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(.001, ac.currentTime + .35);
        osc.start(ac.currentTime); osc.stop(ac.currentTime + .35);
      } else if (type === 'goal') {
        [523, 659, 784].forEach((freq, i) => {
          const o2 = ac.createOscillator();
          const g2 = ac.createGain();
          o2.connect(g2); g2.connect(ac.destination);
          o2.frequency.value = freq;
          g2.gain.setValueAtTime(.2, ac.currentTime + i*.15);
          g2.gain.exponentialRampToValueAtTime(.001, ac.currentTime + i*.15 + .3);
          o2.start(ac.currentTime + i*.15); o2.stop(ac.currentTime + i*.15 + .3);
        });
      }
    } catch(e) { /* Audio ishlamasa o'tkazib yuborish */ }
  },

  celebrate(emoji, message, withConfetti) {
    if (withConfetti !== false) {
      this.confetti(3500);
      this.playSound('goal');
    }
    const old = document.querySelector('.achievement-toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'achievement-toast';
    el.innerHTML = `<span class="at-ico">${emoji}</span><span>${message}</span>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => setTimeout(() => el.classList.add('show'), 50));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 450); }, 4500);
  },

  onSave() { this.playSound('save'); }
};

/* ════════════════════════════════════════════
   FINBOT AI — O'zbekcha Moliyaviy Chatbot 🤖
   ════════════════════════════════════════════ */
const FinBot = {
  _open: false,

  _greet() {
    const u    = Auth.current();
    const name = u ? u.displayName : "do'stim";
    const hr   = new Date().getHours();
    const g    = hr < 12 ? 'Xayrli tong' : hr < 17 ? 'Xayrli kun' : 'Xayrli kech';
    return `${g}, ${name}! 👋 Men **FinBot** — shaxsiy moliyaviy yordamchingizman. Xarajatlar, qarzlar, maqsadlar va moliyaviy maslahatlar haqida so'rang!`;
  },

  _answer(q) {
    const ql    = q.toLowerCase().trim();
    const exp   = DB.get('expenses') || [];
    const debts = DB.get('debts')   || [];
    const goals = Goals.getAll()    || [];
    const month = Utils.today().slice(0, 7);

    if (ql.match(/bu oy|oylik|qancha.*sarfl|xarajat.*qancha|ko'p.*sarfl/)) {
      const me  = exp.filter(e => e.date?.startsWith(month));
      const tot = me.reduce((s,e)=>s+e.amount,0);
      if (tot === 0) return `Bu oy hali xarajat kiritilmagan. Boshqa sahifadan kiritishni boshlang! 💡`;
      const cm  = {};
      me.forEach(e => cm[e.category]=(cm[e.category]||0)+e.amount);
      const top = Object.entries(cm).sort((a,b)=>b[1]-a[1])[0];
      return `📊 **Bu oy** jami **${Utils.fmtMoney(tot)}** sarfladingiz (${me.length} ta yozuv).\n\n${top ? `🔝 Eng ko'p: **${Utils.catInfo(top[0]).n}** — ${Utils.fmtMoney(top[1])}` : ''}`;
    }

    if (ql.match(/qarz|berishim|olishim|qarzdor/)) {
      const out    = debts.filter(d=>!d.paid&&d.type==='debt_out');
      const inn    = debts.filter(d=>!d.paid&&d.type==='debt_in');
      if (out.length+inn.length===0) return `🎉 Ajoyib! Hech qanday ochiq qarzingiz yo'q!`;
      return `💰 **Olishingiz kerak:** ${Utils.fmtMoney(inn.reduce((s,d)=>s+d.amount,0))} (${inn.length} ta)\n🤝 **Berishingiz kerak:** ${Utils.fmtMoney(out.reduce((s,d)=>s+d.amount,0))} (${out.length} ta)`;
    }

    if (ql.match(/maqsad|kopilka|jamg'ar|tejash|yig'ish/)) {
      if (goals.length===0) return `🎯 Hozircha maqsad yo'q. **Maqsadlar** sahifasiga o'tib yangi maqsad yarating!`;
      const g   = [...goals].sort((a,b)=>(b.currentAmount/b.targetAmount)-(a.currentAmount/a.targetAmount))[0];
      const pct = Math.round(g.currentAmount/g.targetAmount*100);
      return `🎯 **${g.title}** maqsadi:\n${Utils.fmtMoney(g.currentAmount)} / ${Utils.fmtMoney(g.targetAmount)} — **${pct}%**\n\nQoldi: ${Utils.fmtMoney(Math.max(0,g.targetAmount-g.currentAmount))} 💪`;
    }

    if (ql.match(/bashorat|forecast|keyingi oy|taxmin|prognoz/)) {
      const fc = Forecast.thisMonth();
      if (fc.spent===0) return `📈 Bashorat uchun bu oy kamida bir necha xarajat kiriting!`;
      return `📈 Joriy sur'atda bu oy jami **${Utils.fmtMoney(fc.forecast)}** sarflashingiz taxminiy.\nHozircha: ${Utils.fmtMoney(fc.spent)} | Kunlik o'rtacha: ${Utils.fmtMoney(fc.dailyAvg)}`;
    }

    if (ql.match(/ball|score|reyting|baholash|salomatlik|indeks/)) {
      const hs = HealthScore.calculate();
      return `💯 Moliyaviy salomatlik ballingiz: **${hs.score}/100** — ${hs.label}\n\nBu oy ${Utils.fmtMoney(hs.totalSpent)} sarfladingiz. ${hs.score>=70?'Davom eting! 🚀':"Qarzlarni yoping va maqsad qo'shing 💡"}`;
    }

    if (ql.match(/maslahat|tavsiya|yaxshilash|nima qil/)) {
      const hs   = HealthScore.calculate();
      const tips = [];
      if (hs.score < 60)          tips.push("• Har kuni xarajatlarni yozib boring — bu odatning o'zi 20 ball beradi");
      if (openDebts(debts) > 0)   tips.push("• Ochiq qarzlarni imkon qadar tezroq yoping");
      if (goals.length === 0)     tips.push("• Kamida bitta jamg'arma maqsadi qo'shing");
      if (tips.length === 0)      tips.push("• Hamma narsa zo'r! Shunday davom eting 🏆");
      return `💡 **Sizga maslahatlar:**\n${tips.join('\n')}`;

      function openDebts(d) { return d.filter(x=>!x.paid).length; }
    }

    if (ql.match(/salom|xayrli|assalom|hi\b|hello/)) return this._greet();

    return `🤔 Aniqroq so'rang. Masalan:\n👉 "Bu oy qancha sarfladim?"\n👉 "Qarzlarim qancha?"\n👉 "Maqsadlarim holati?"\n👉 "Moliyaviy balim qancha?"\n👉 "Maslahat ber"`;
  },

  open() {
    const existing = document.getElementById('finbot-window');
    if (existing) { existing.style.display='flex'; this._open=true; return; }

    const win = document.createElement('div');
    win.id = 'finbot-window';
    win.className = 'finbot-window';
    win.innerHTML = `
      <div class="finbot-header">
        <div class="finbot-avatar">🤖</div>
        <div class="finbot-name">
          <strong>FinBot AI</strong>
          <span>🟢 Faol — O'zbek tilida</span>
        </div>
        <button class="finbot-close" onclick="FinBot.close()">✕</button>
      </div>
      <div class="finbot-messages" id="finbot-msgs"></div>
      <div class="finbot-quick">
        <button class="finbot-qbtn" onclick="FinBot.ask('Bu oy qancha sarfladim?')">📊 Bu oy</button>
        <button class="finbot-qbtn" onclick="FinBot.ask('Qarzlarim qancha?')">🤝 Qarzlar</button>
        <button class="finbot-qbtn" onclick="FinBot.ask('Maqsadlarim holati?')">🎯 Maqsadlar</button>
        <button class="finbot-qbtn" onclick="FinBot.ask('Moliyaviy balim qancha?')">💯 Balim</button>
        <button class="finbot-qbtn" onclick="FinBot.ask('Keyingi oy bashorat?')">📈 Bashorat</button>
      </div>
      <div class="finbot-input-area">
        <input class="finbot-input" id="finbot-inp" placeholder="Savol yozing..."
          onkeydown="if(event.key==='Enter')FinBot.send()"/>
        <button class="finbot-send" onclick="FinBot.send()">➤</button>
      </div>`;
    document.body.appendChild(win);
    this._open = true;
    setTimeout(() => this._addMsg(this._greet(), 'bot'), 300);
  },

  close() {
    const win = document.getElementById('finbot-window');
    if (win) win.style.display = 'none';
    this._open = false;
  },

  toggle() {
    const win = document.getElementById('finbot-window');
    if (win && win.style.display !== 'none') this.close();
    else this.open();
  },

  send() {
    const inp = document.getElementById('finbot-inp');
    if (!inp) return;
    const text = inp.value.trim();
    if (!text) return;
    inp.value = '';
    this.ask(text);
  },

  ask(q) {
    this._addMsg(q, 'user');
    const msgs = document.getElementById('finbot-msgs');
    const typing = document.createElement('div');
    typing.className = 'finbot-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    if (msgs) msgs.appendChild(typing);
    setTimeout(() => {
      if (typing.parentNode) typing.parentNode.removeChild(typing);
      this._addMsg(this._answer(q), 'bot');
    }, 600 + Math.random() * 500);
  },

  _addMsg(text, type) {
    const msgs = document.getElementById('finbot-msgs');
    if (!msgs) return;
    const div = document.createElement('div');
    div.className = `finbot-msg ${type}`;
    div.innerHTML  = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  },

  renderFAB() {
    if (document.getElementById('finbot-fab')) return;
    const btn = document.createElement('button');
    btn.id        = 'finbot-fab';
    btn.className = 'finbot-fab';
    btn.title     = 'FinBot AI yordamchi';
    btn.innerHTML  = '🤖<span class="fab-badge">AI</span>';
    btn.onclick   = () => FinBot.toggle();
    document.body.appendChild(btn);
  }
};

/* ════════════════════════════════════════════
   INTEGRATSIYA — FX kengaytmasi
   ════════════════════════════════════════════ */
/* Xarajat saqlaganda ovoz + yutuq tekshirish */
const _origSubmitFX = InputHandler._submit.bind(InputHandler);
InputHandler._submit = function(text) {
  const before = (DB.get('expenses') || []).length;
  _origSubmitFX(text);
  const after = (DB.get('expenses') || []).length;
  if (after > before) {
    FX.onSave();
    if (before === 0)  setTimeout(() => FX.celebrate('🌱', 'Birinchi xarajat! Ilk Qadam olindi!'), 400);
    if (before === 6)  setTimeout(() => FX.celebrate('⚡', '7 ta yozuv! Intizomli foydalanuvchi!'), 400);
    if (before === 29) setTimeout(() => FX.celebrate('💎', '30 ta yozuv! Moliyaviy Ustoz!'), 400);
  }
};

/* Maqsadga erishilganda konfetti */
const _origDepositFX = Goals.deposit.bind(Goals);
Goals.deposit = function(id, amt, note) {
  const res = _origDepositFX(id, amt, note);
  if (res.ok) {
    FX.playSound('save');
    if (res.goal && res.goal.currentAmount >= res.goal.targetAmount && res.goal.targetAmount > 0) {
      setTimeout(() => FX.celebrate('🏆', `"${res.goal.title}" maqsadiga erishdingiz!`), 300);
    }
  }
  return res;
};

