// Supabase (PostgREST) orqali doimiy ombor: bitta jadval `bot_docs (kind, id, data jsonb)`.
// Qoʻshimcha kutubxona kerak emas: Node ichidagi fetch yetadi. Jadval yaratish SQL i: docs/supabase.sql
// Kalit SERVER kaliti boʻlishi kerak (service_role yoki sb_secret_...). Uni hech qachon brauzerga/mini ilovaga bermang.

const TABLE = 'bot_docs';
const PAGE = 1000;

class SupabaseBackend {
  constructor({ url, key, table = TABLE, fetchImpl, timeoutMs = 15000 }) {
    this.base = String(url).trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
    this.key = String(key).trim();
    this.table = table;
    this.fetch = fetchImpl || fetch;
    this.timeoutMs = timeoutMs;
  }

  headers(extra) {
    const h = { apikey: this.key, 'Content-Type': 'application/json', ...extra };
    // eski service_role kaliti JWT (eyJ...), yangi sb_secret_... JWT emas: Authorization faqat JWT uchun
    if (/^eyJ/.test(this.key)) h.Authorization = 'Bearer ' + this.key;
    return h;
  }

  async request(path, opts) {
    const res = await this.fetch(`${this.base}/rest/v1/${path}`, { ...opts, signal: AbortSignal.timeout(this.timeoutMs) });
    if (!res.ok) {
      let body = '';
      try { body = (await res.text()).slice(0, 200); } catch (e) { /* ignore */ }
      throw new Error(`Supabase ${res.status}: ${body.replace(this.key, '***')}`);
    }
    return res;
  }

  /** Hamma yozuvlar: [{ kind, id, data }] */
  async load() {
    const rows = [];
    for (let offset = 0; ; offset += PAGE) {
      const res = await this.request(`${this.table}?select=kind,id,data&order=kind.asc,id.asc&limit=${PAGE}&offset=${offset}`, { method: 'GET', headers: this.headers() });
      const part = await res.json();
      if (!Array.isArray(part)) throw new Error('Supabase kutilmagan javob berdi');
      rows.push(...part);
      if (part.length < PAGE) break;
    }
    return rows;
  }

  /** Yozuvlarni qoʻshadi yoki yangilaydi (kind+id boʻyicha). */
  async upsert(rows) {
    if (!rows.length) return;
    const now = new Date().toISOString();
    const body = JSON.stringify(rows.map((r) => ({ kind: r.kind, id: String(r.id), data: r.data, updated_at: now })));
    await this.request(`${this.table}?on_conflict=kind,id`, {
      method: 'POST',
      headers: this.headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body,
    });
  }
}

/** Sozlamada URL va kalit boʻlsa backend qaytaradi, boʻlmasa null (fayl ombori ishlatiladi). */
function createBackend(config, fetchImpl) {
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_KEY) return null;
  if (!/^https?:\/\//.test(config.SUPABASE_URL)) throw new Error('SUPABASE_URL https:// bilan boshlanishi kerak.');
  return new SupabaseBackend({ url: config.SUPABASE_URL, key: config.SUPABASE_SERVICE_KEY, fetchImpl });
}

module.exports = { SupabaseBackend, createBackend };
