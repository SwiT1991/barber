// Shared server code for the Tomer BarBerSHOP site: responses, input cleaning, database, sessions, opening hours.
export const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
export const clip = (v, n) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
export const uid = () => crypto.randomUUID();
export const PHONE = /^0\d{1,2}-?\d{7}$/;
export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const STATUSES = ["new", "ok", "chair", "done", "no", "cancel"];
export const METHODS = ["מזומן", "ביט", "אשראי"];
export const BOOK_AHEAD_DAYS = 30;

export function sameOrigin(request) {
  const o = request.headers.get("Origin");
  try { return !!o && new URL(o).host === new URL(request.url).host; } catch { return false; }
}
export async function readJson(request, max = 20000) {
  if (!(request.headers.get("Content-Type") || "").includes("application/json")) return null;
  const raw = await request.text();
  if (raw.length > max) return null;
  try { const d = JSON.parse(raw); return d && typeof d === "object" && !Array.isArray(d) ? d : null; } catch { return null; }
}
export const ipOf = (request) => request.headers.get("CF-Connecting-IP") || "unknown";

/* ---------- database (Cloudflare D1, bound as DB) ---------- */
const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS appts (id TEXT PRIMARY KEY, created TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, svc TEXT NOT NULL, price INTEGER NOT NULL, min INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'new', note TEXT, paid_amount INTEGER, paid_method TEXT, paid_date TEXT)",
  "CREATE INDEX IF NOT EXISTS appts_date ON appts (date)",
  "CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, msg TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS hits (kind TEXT NOT NULL, ip TEXT NOT NULL, ts INTEGER NOT NULL)",
];
let ready = false;
export async function db(env) {
  if (!env.DB) return null;
  if (!ready) { await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s))); ready = true; }
  return env.DB;
}
export const audit = (D, msg) => D.prepare("INSERT INTO audit (ts, msg) VALUES (?, ?)").bind(new Date().toISOString(), clip(msg, 200)).run();

// Counts recent attempts of one kind from one address; true when the limit is reached.
export async function limited(D, kind, ip, max, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  await D.prepare("DELETE FROM hits WHERE ts < ?").bind(now - 86400).run();
  const row = await D.prepare("SELECT COUNT(*) AS n FROM hits WHERE kind = ? AND ip = ? AND ts > ?").bind(kind, ip, now - windowSec).first();
  return (row?.n || 0) >= max;
}
export const hit = (D, kind, ip) => D.prepare("INSERT INTO hits (kind, ip, ts) VALUES (?, ?, ?)").bind(kind, ip, Math.floor(Date.now() / 1000)).run();

/* ---------- admin session ---------- */
// The only secret is ADMIN_PASSWORD, set in Cloudflare. The cookie holds an expiry time signed with a key derived from it.
const enc = new TextEncoder();
async function hmac(keyBytes, msg) {
  const k = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
function safeEq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
const sessionKey = (env) => hmac(enc.encode(env.ADMIN_PASSWORD), "tomer-barbershop-session-v1");
export const pwOk = (env) => typeof env.ADMIN_PASSWORD === "string" && env.ADMIN_PASSWORD.length >= 10;
export async function checkPassword(env, input) {
  const k = enc.encode("tomer-barbershop-compare");
  return safeEq(hex(await hmac(k, String(input ?? ""))), hex(await hmac(k, env.ADMIN_PASSWORD)));
}
export async function makeToken(env) {
  const exp = String(Date.now() + 8 * 3600e3);
  return exp + "." + hex(await hmac(await sessionKey(env), exp));
}
export async function isAuthed(request, env) {
  if (!pwOk(env)) return false;
  const m = /(?:^|;\s*)__Host-admin=([^;]+)/.exec(request.headers.get("Cookie") || "");
  if (!m) return false;
  const [exp, sig] = m[1].split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || !(+exp > Date.now())) return false;
  return safeEq(sig, hex(await hmac(await sessionKey(env), exp)));
}
export const cookie = (token, maxAge) => `__Host-admin=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

/* ---------- site settings (edited in the admin, read by the public site) ---------- */
export const SECTION_IDS = ["services", "about", "prices", "faq"];
export const DEFAULT_SETTINGS = {
  services: [
    { id: "cut", name: "תספורת גברים", desc: "כולל שטיפה ועיצוב", price: 70, min: 30 },
    { id: "combo", name: "תספורת + זקן", desc: "החבילה המבוקשת", price: 100, min: 60 },
    { id: "beard", name: "עיצוב זקן", desc: "קווים, אורך ושמן זקן", price: 40, min: 30 },
    { id: "razor", name: "גילוח בתער", desc: "מגבת חמה וסכין חד־פעמית", price: 60, min: 30 },
    { id: "kid", name: "תספורת ילדים", desc: "עד גיל 12", price: 50, min: 30 },
    { id: "groom", name: "חבילת חתן", desc: "תספורת, זקן, גילוח וטיפוח פנים", price: 250, min: 90 },
  ],
  site: {
    strip: "קובעים תור אונליין ונכנסים ישר לכיסא",
    sub: "מספרת גברים שכונתית: תספורות, עיצוב זקן וגילוח בתער. קובעים תור בדקה, מגיעים בזמן ויוצאים מסודרים.",
    phone: "050-0000000", addr: "הכתובת תתעדכן כאן",
    wkO: "09:00", wkC: "20:00", frO: "08:00", frC: "14:00", hide: {},
  },
  reviews: [],
};
export const toMin = (t) => { const p = String(t).split(":"); return +p[0] * 60 + (+p[1] || 0); };
export const toTime = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const halfHour = (t) => TIME.test(t) && toMin(t) % 30 === 0;

// Rebuilds settings from untrusted input, keeping only known fields within their limits.
export function cleanSettings(input) {
  const src = input && typeof input === "object" ? input : {};
  const def = DEFAULT_SETTINGS;
  const seen = new Set();
  let services = (Array.isArray(src.services) ? src.services : def.services).slice(0, 12).map((s) => {
    const price = Math.round(+s?.price), min = Math.round(+s?.min);
    let id = clip(s?.id, 40).replace(/[^\w-]/g, "") || uid();
    if (seen.has(id)) id = uid();
    seen.add(id);
    return { id, name: clip(s?.name, 60), desc: clip(s?.desc, 60), price: price >= 0 && price <= 5000 ? price : 0, min: min >= 30 && min <= 240 && min % 30 === 0 ? min : 30 };
  }).filter((s) => s.name);
  if (!services.length) services = def.services;
  const s = src.site && typeof src.site === "object" ? src.site : {};
  const hide = {};
  for (const id of SECTION_IDS) hide[id] = !!(s.hide && s.hide[id]);
  const pair = (o, c, dO, dC) => (halfHour(o) && halfHour(c) && toMin(o) < toMin(c) ? [o, c] : [dO, dC]);
  const [wkO, wkC] = pair(s.wkO, s.wkC, def.site.wkO, def.site.wkC);
  const [frO, frC] = pair(s.frO, s.frC, def.site.frO, def.site.frC);
  const phone = clip(s.phone, 12);
  const site = {
    strip: clip(s.strip, 90) || def.site.strip, sub: clip(s.sub, 240) || def.site.sub,
    phone: PHONE.test(phone) ? phone : def.site.phone, addr: clip(s.addr, 120) || def.site.addr,
    wkO, wkC, frO, frC, hide,
  };
  const reviews = (Array.isArray(src.reviews) ? src.reviews : []).slice(0, 12)
    .map((r) => ({ id: clip(r?.id, 40) || uid(), name: clip(r?.name, 60), biz: clip(r?.biz, 60), text: clip(r?.text, 400) }))
    .filter((r) => r.name.length >= 2 && r.text.length >= 10);
  return { services, site, reviews };
}
export async function getSettings(D) {
  if (!D) return DEFAULT_SETTINGS;
  const row = await D.prepare("SELECT v FROM kv WHERE k = 'settings'").first();
  if (!row) return DEFAULT_SETTINGS;
  try { return cleanSettings(JSON.parse(row.v)); } catch { return DEFAULT_SETTINGS; }
}

/* ---------- opening hours and appointment slots (Israel time) ---------- */
// Current date and minute of the day in Israel, whatever the server's own clock zone is.
export function nowIL() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const g = (t) => parts.find((x) => x.type === t).value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, min: +g("hour") * 60 + +g("minute") };
}
export function addDays(dateStr, n) { const d = new Date(dateStr + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function validDate(dateStr) { if (!DATE.test(dateStr)) return false; const d = new Date(dateStr + "T12:00:00Z"); return !isNaN(d) && d.toISOString().slice(0, 10) === dateStr; }
// Opening hours for a date as [open, close] minutes, or null when closed (Saturday).
export function hoursFor(site, dateStr) {
  const wd = new Date(dateStr + "T12:00:00Z").getUTCDay();
  if (wd === 6) return null;
  return wd === 5 ? [toMin(site.frO), toMin(site.frC)] : [toMin(site.wkO), toMin(site.wkC)];
}
// Half-hour blocks already taken on a date by appointments that are still on.
export async function busyFor(D, dateStr) {
  const rows = await D.prepare("SELECT time, min FROM appts WHERE date = ? AND status NOT IN ('cancel', 'no')").bind(dateStr).all();
  const set = new Set();
  for (const a of rows.results) { const s = toMin(a.time); for (let m = s; m < s + (a.min || 30); m += 30) set.add(m); }
  return set;
}
// Every half-hour start of the day with whether a service of `min` minutes fits there. null when closed.
export function slotList(site, busy, dateStr, min, now) {
  const hr = hoursFor(site, dateStr);
  if (!hr) return null;
  const nowMin = dateStr === now.date ? now.min : -1, out = [];
  for (let m = hr[0]; m + 30 <= hr[1]; m += 30) {
    let free = m > nowMin && m + min <= hr[1];
    for (let k = m; free && k < m + min; k += 30) if (busy.has(k)) free = false;
    out.push({ t: toTime(m), free });
  }
  return out;
}
