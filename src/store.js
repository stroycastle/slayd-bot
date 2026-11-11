// Oddiy ombor. Pul harakatlari "ledger" (daftar) ga yoziladi. Hamma narsa xotirada turadi va tez ishlaydi;
// saqlash ikki xil: (1) backend (Supabase) berilsa, oʻzgargan yozuvlar shunga yoziladi va ishga tushganda oʻqiladi,
// (2) boʻlmasa, fayl har oʻzgarishda xavfsiz tarzda (vaqtinchalik fayl -> nom almashtirish) saqlanadi.
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const byId = (a, b) => Number(a.id) - Number(b.id);

class Store {
  constructor(dir, { backend } = {}) {
    this.dir = dir;
    this.file = path.join(dir, 'db.json');
    this.backend = backend || null;
    this._dirty = new Map(); // 'kind:id' -> versiya (qaysi yozuv backendga yozilishi kerak)
    this._tick = 0;
    this._timer = null;
    this._busy = null;
    this._backoff = 0;
    fs.mkdirSync(dir, { recursive: true });
    this.db = { seq: { order: 0, payment: 0, ledger: 0 }, users: {}, orders: [], payments: [], ledger: [] };
    if (fs.existsSync(this.file)) {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.db = Object.assign(this.db, raw);
      this.db.seq = Object.assign({ order: 0, payment: 0, ledger: 0 }, raw.seq || {});
    }
  }

  save() {
    if (this.backend) return this._kick(50);
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.db));
    fs.renameSync(tmp, this.file);
  }

  // ---------- backend (Supabase) bilan ishlash ----------
  _mark(kind, id) {
    if (!this.backend) return;
    this._dirty.set(kind + ':' + id, ++this._tick);
    this._dirty.set('meta:seq', ++this._tick);
  }
  _row(key) {
    const i = key.indexOf(':');
    const kind = key.slice(0, i);
    const id = key.slice(i + 1);
    let data;
    if (kind === 'user') data = this.db.users[id];
    else if (kind === 'order') data = this.getOrder(id);
    else if (kind === 'payment') data = this.getPayment(id);
    else if (kind === 'ledger') {
      const n = Number(id);
      for (let i = this.db.ledger.length - 1; i >= 0 && !data; i--) if (this.db.ledger[i].id === n) data = this.db.ledger[i];
    }
    else if (kind === 'meta') data = this.db.seq;
    return data ? { kind, id, data } : null;
  }
  _kick(delay) {
    if (!this.backend || this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this._run();
    }, delay);
  }
  async _drain() {
    while (this._dirty.size) {
      const batch = [...this._dirty.entries()].slice(0, 200);
      const rows = [];
      for (const [key] of batch) {
        const r = this._row(key);
        if (r) rows.push(r);
      }
      if (rows.length) await this.backend.upsert(rows);
      for (const [key, v] of batch) if (this._dirty.get(key) === v) this._dirty.delete(key);
    }
  }
  _run() {
    if (this._busy) return this._busy;
    this._busy = (async () => {
      try {
        await this._drain();
        this._backoff = 0;
      } catch (e) {
        this._backoff = Math.min((this._backoff || 1000) * 2, 30000);
        console.error(`⚠️  Omborga yozib boʻlmadi (${Math.round(this._backoff / 1000)} soniyadan keyin qayta uriniladi):`, e.message);
        this._kick(this._backoff);
      } finally {
        this._busy = null;
      }
    })();
    return this._busy;
  }
  /** Hamma oʻzgarish backendga yozilguncha kutadi (oʻchirishdan oldin). Yozilmagan qolsa false. */
  async flush() {
    if (!this.backend) return true;
    for (let i = 0; i < 4 && this._dirty.size; i++) {
      if (this._busy) await this._busy;
      if (!this._dirty.size) break;
      try {
        await this._drain();
      } catch (e) {
        console.error('Omborga yozib boʻlmadi:', e.message);
        await sleep(500);
      }
    }
    return this._dirty.size === 0;
  }
  /** Ishga tushganda: backenddan hamma narsani oʻqiydi (backend boʻsh boʻlsa, mahalliy maʼlumot unga koʻchiriladi). */
  async init() {
    if (!this.backend) return;
    let rows;
    for (let i = 1; ; i++) {
      try {
        rows = await this.backend.load();
        break;
      } catch (e) {
        if (i >= 3) throw new Error('Supabasedan oʻqib boʻlmadi: ' + e.message);
        console.warn(`Supabasega ulanib boʻlmadi (${i}/3), qayta uriniladi: ${e.message}`);
        await sleep(1500 * i);
      }
    }
    if (!rows.length) {
      // backend boʻsh: mavjud mahalliy maʼlumotni koʻchiramiz (yangi oʻrnatishda boʻsh boʻladi)
      const d = this.db;
      for (const id of Object.keys(d.users)) this._mark('user', id);
      for (const o of d.orders) this._mark('order', o.id);
      for (const p of d.payments) this._mark('payment', p.id);
      for (const l of d.ledger) this._mark('ledger', l.id);
      this._mark('meta', 'seq');
      await this.flush();
      return;
    }
    const db = { seq: { order: 0, payment: 0, ledger: 0 }, users: {}, orders: [], payments: [], ledger: [] };
    for (const r of rows) {
      if (r.kind === 'user') db.users[String(r.id)] = r.data;
      else if (r.kind === 'order') db.orders.push(r.data);
      else if (r.kind === 'payment') db.payments.push(r.data);
      else if (r.kind === 'ledger') db.ledger.push(r.data);
      else if (r.kind === 'meta' && r.id === 'seq') Object.assign(db.seq, r.data);
    }
    db.orders.sort(byId);
    db.payments.sort(byId);
    db.ledger.sort(byId);
    // hisoblagichlar yozuvlardan past boʻlib qolmasin
    const top = (arr) => arr.reduce((m, x) => Math.max(m, x.id || 0), 0);
    db.seq.order = Math.max(db.seq.order, top(db.orders));
    db.seq.payment = Math.max(db.seq.payment, top(db.payments));
    db.seq.ledger = Math.max(db.seq.ledger, top(db.ledger));
    this.db = db;
  }

  // ---------- foydalanuvchilar ----------
  ensureUser(from) {
    const id = String(from.id);
    let u = this.db.users[id];
    if (!u) {
      u = this.db.users[id] = {
        id: from.id,
        username: from.username || '',
        name: [from.first_name, from.last_name].filter(Boolean).join(' '),
        balance: 0,
        profile: {},
        createdAt: Date.now(),
      };
      this._mark('user', id);
      this.save();
    }
    return u;
  }
  getUser(id) {
    return this.db.users[String(id)] || null;
  }
  setProfile(id, patch) {
    const u = this.getUser(id);
    u.profile = Object.assign({}, u.profile, patch);
    this._mark('user', u.id);
    this.save();
    return u.profile;
  }

  // ---------- pul ----------
  _ledger(userId, type, amount, note) {
    const l = { id: ++this.db.seq.ledger, userId, type, amount, note: note || '', ts: Date.now() };
    this.db.ledger.push(l);
    this._mark('ledger', l.id);
  }
  /** Balansdan yechadi. Yetmasa false qaytaradi, hech narsa o'zgarmaydi. */
  charge(userId, amount, note) {
    const u = this.getUser(userId);
    if (!u || amount <= 0 || u.balance < amount) return false;
    u.balance -= amount;
    this._mark('user', u.id);
    this._ledger(userId, 'charge', amount, note);
    this.save();
    return true;
  }
  credit(userId, amount, note, type) {
    const u = this.getUser(userId);
    if (!u || amount <= 0) return false;
    u.balance += amount;
    this._mark('user', u.id);
    this._ledger(userId, type || 'credit', amount, note);
    this.save();
    return true;
  }
  refund(userId, amount, note) {
    return this.credit(userId, amount, note, 'refund');
  }

  // ---------- buyurtmalar ----------
  addOrder(o) {
    const order = Object.assign({ id: ++this.db.seq.order, createdAt: Date.now(), status: 'processing' }, o);
    this.db.orders.push(order);
    this._mark('order', order.id);
    this.save();
    return order;
  }
  getOrder(id) {
    return this.db.orders.find((o) => o.id === Number(id)) || null;
  }
  updateOrder(id, patch) {
    const o = this.getOrder(id);
    if (o) {
      Object.assign(o, patch);
      this._mark('order', o.id);
      this.save();
    }
    return o;
  }
  /** Foydalanuvchining tayyorlanayotgan buyurtmasi (slayd yoki tahrir) bormi. */
  hasProcessing(userId) {
    return this.db.orders.some((o) => o.userId === userId && o.status === 'processing');
  }
  userOrders(userId, limit) {
    return this.db.orders
      .filter((o) => o.userId === userId && o.type === 'deck' && o.status === 'done')
      .slice(-limit)
      .reverse();
  }
  /** Bot o'chib qolganda "processing" holatda qolgan buyurtmalar uchun pulni qaytaradi. */
  recoverStuck() {
    const fixed = [];
    for (const o of this.db.orders) {
      if (o.status === 'processing') {
        o.status = 'failed';
        o.error = 'Bot qayta ishga tushdi';
        this._mark('order', o.id);
        if (o.price > 0) this.credit(o.userId, o.price, `Qaytarildi: buyurtma #${o.id}`, 'refund');
        fixed.push(o);
      }
    }
    // yarim qolgan himoya savol-javoblari: pul qaytariladi (qaytarilganlar roʻyxati fixed.defense da)
    fixed.defense = [];
    for (const o of this.db.orders) {
      if (o.defenseStatus === 'processing') {
        o.defenseStatus = 'failed';
        o.defenseError = 'Bot qayta ishga tushdi';
        this._mark('order', o.id);
        if (o.defensePrice > 0) this.credit(o.userId, o.defensePrice, `Qaytarildi: himoya savollari #${o.id}`, 'refund');
        fixed.defense.push(o);
      }
    }
    if (fixed.length || fixed.defense.length) this.save();
    return fixed;
  }

  // ---------- to'lovlar ----------
  addPayment(p) {
    const pay = Object.assign({ id: ++this.db.seq.payment, createdAt: Date.now(), status: 'waiting_receipt' }, p);
    this.db.payments.push(pay);
    this._mark('payment', pay.id);
    this.save();
    return pay;
  }
  getPayment(id) {
    return this.db.payments.find((p) => p.id === Number(id)) || null;
  }
  updatePayment(id, patch) {
    const p = this.getPayment(id);
    if (p) {
      Object.assign(p, patch);
      this._mark('payment', p.id);
      this.save();
    }
    return p;
  }
  /** Tasdiqlash faqat bir marta ishlaydi. */
  approvePayment(id, adminId) {
    const p = this.getPayment(id);
    if (!p || p.status !== 'pending') return null;
    p.status = 'approved';
    p.by = adminId;
    this._mark('payment', p.id);
    this.credit(p.userId, p.amount, `To'lov #${p.id}`, 'topup');
    return p;
  }
  rejectPayment(id, adminId) {
    const p = this.getPayment(id);
    if (!p || p.status !== 'pending') return null;
    p.status = 'rejected';
    p.by = adminId;
    this._mark('payment', p.id);
    this.save();
    return p;
  }

  stats() {
    const d = this.db;
    const sum = (arr) => arr.reduce((a, b) => a + b, 0);
    const charges = d.ledger.filter((l) => l.type === 'charge');
    const refunds = d.ledger.filter((l) => l.type === 'refund');
    return {
      users: Object.keys(d.users).length,
      decks: d.orders.filter((o) => o.type === 'deck' && o.status === 'done').length,
      edits: d.orders.filter((o) => o.type === 'edit' && o.status === 'done').length,
      revenue: sum(charges.map((l) => l.amount)) - sum(refunds.map((l) => l.amount)),
      topups: sum(d.payments.filter((p) => p.status === 'approved').map((p) => p.amount)),
      pending: d.payments.filter((p) => p.status === 'pending').length,
      balances: sum(Object.values(d.users).map((u) => u.balance)),
    };
  }
}

module.exports = { Store };
