// Every change the admin can make. Signed-in admin only; each change is written to the audit log.
import { json, clip, db, sameOrigin, readJson, isAuthed, audit, cleanSettings, nowIL, STATUSES, METHODS } from "../../../src/core.js";
const STATUS_NAMES = { new: "ממתין לאישור", ok: "מאושר", chair: "בכיסא", done: "הסתיים", no: "לא הגיע", cancel: "בוטל" };
const fmt = (n) => "₪" + Number(n).toLocaleString("en-US");

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json(403, { error: "forbidden" });
  if (!(await isAuthed(request, env))) return json(401, { error: "unauthorized" });
  const D = await db(env).catch(() => null);
  if (!D) return json(503, { error: "not_configured" });
  const d = await readJson(request, 30000);
  if (!d) return json(400, { error: "bad_request" });
  const id = clip(d.id, 40);
  const bad = () => json(422, { error: "invalid" });
  const missing = () => json(404, { error: "not_found" });
  const find = () => D.prepare("SELECT * FROM appts WHERE id = ?").bind(id).first();

  switch (d.op) {
    case "apptStatus": {
      if (!STATUSES.includes(d.status)) return bad();
      const a = await find();
      if (!a) return missing();
      await D.prepare("UPDATE appts SET status = ? WHERE id = ?").bind(d.status, id).run();
      await audit(D, "התור של " + a.name + " (" + a.date + " " + a.time + ") עבר ל״" + STATUS_NAMES[d.status] + "״");
      break;
    }
    case "apptDelete": {
      const a = await find();
      if (!a) return missing();
      await D.prepare("DELETE FROM appts WHERE id = ?").bind(id).run();
      await audit(D, "התור של " + a.name + " (" + a.date + " " + a.time + ") נמחק");
      break;
    }
    case "apptPay": {
      const amount = Math.round(+d.amount);
      const a = await find();
      if (!a) return missing();
      if (a.status !== "done" || a.paid_amount != null || !(amount > 0) || amount > 5000 || !METHODS.includes(d.method)) return bad();
      await D.prepare("UPDATE appts SET paid_amount = ?, paid_method = ?, paid_date = ? WHERE id = ?").bind(amount, d.method, nowIL().date, id).run();
      await audit(D, "נרשם תשלום של " + fmt(amount) + " מאת " + a.name + " (" + d.method + ")");
      break;
    }
    case "settings": {
      const clean = cleanSettings(d.settings);
      await D.prepare("INSERT INTO kv (k, v) VALUES ('settings', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(clean)).run();
      await audit(D, "האתר עודכן: " + (clip(d.what, 60) || "הגדרות"));
      break;
    }
    default:
      return json(400, { error: "unknown_op" });
  }
  return json(200, { ok: true });
}
export const onRequest = () => json(405, { error: "method_not_allowed" });
