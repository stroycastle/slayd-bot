// Oddiy JSON ombor. Pul harakatlari "ledger" (daftar) ga yoziladi.
// Fayl har o'zgarishda xavfsiz tarzda (vaqtinchalik fayl -> nom almashtirish) saqlanadi.
const fs = require('fs');
const path = require('path');

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'db.json');
    fs.mkdirSync(dir, { recursive: true });
    this.db = { seq: { order: 0, payment: 0, ledger: 0 }, users: {}, orders: [], payments: [], ledger: [] };
    if (fs.existsSync(this.file)) {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.db = Object.assign(this.db, raw);
      this.db.seq = Object.assign({ order: 0, payment: 0, ledger: 0 }, raw.seq || {});
    }
  }

  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.db));
    fs.renameSync(tmp, this.file);
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
    this.save();
    return u.profile;
  }

  // ---------- pul ----------
  _ledger(userId, type, amount, note) {
    this.db.ledger.push({ id: ++this.db.seq.ledger, userId, type, amount, note: note || '', ts: Date.now() });
  }
  /** Balansdan yechadi. Yetmasa false qaytaradi, hech narsa o'zgarmaydi. */
  charge(userId, amount, note) {
    const u = this.getUser(userId);
    if (!u || amount <= 0 || u.balance < amount) return false;
    u.balance -= amount;
    this._ledger(userId, 'charge', amount, note);
    this.save();
    return true;
  }
  credit(userId, amount, note, type) {
    const u = this.getUser(userId);
    if (!u || amount <= 0) return false;
    u.balance += amount;
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
      this.save();
    }
    return o;
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
        if (o.price > 0) this.credit(o.userId, o.price, `Qaytarildi: buyurtma #${o.id}`, 'refund');
        fixed.push(o);
      }
    }
    if (fixed.length) this.save();
    return fixed;
  }

  // ---------- to'lovlar ----------
  addPayment(p) {
    const pay = Object.assign({ id: ++this.db.seq.payment, createdAt: Date.now(), status: 'waiting_receipt' }, p);
    this.db.payments.push(pay);
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
    this.credit(p.userId, p.amount, `To'lov #${p.id}`, 'topup');
    return p;
  }
  rejectPayment(id, adminId) {
    const p = this.getPayment(id);
    if (!p || p.status !== 'pending') return null;
    p.status = 'rejected';
    p.by = adminId;
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
