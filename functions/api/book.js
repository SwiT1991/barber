// Receives an appointment from the site form. Everything is checked again here: the service, the date, and that the slot is still free.
import { json, clip, uid, db, sameOrigin, readJson, limited, hit, ipOf, audit, getSettings, nowIL, addDays, validDate, busyFor, slotList, PHONE, TIME, BOOK_AHEAD_DAYS } from "../../src/core.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json(403, { error: "forbidden" });
  const d = await readJson(request, 3000);
  if (!d) return json(400, { error: "bad_request" });
  if (clip(d.web, 10)) return json(200, { ok: true }); // hidden field filled in: a bot. Pretend success.

  const name = clip(d.name, 60), phone = clip(d.phone, 12), date = clip(d.date, 10), time = clip(d.time, 5);
  if (name.length < 2 || !PHONE.test(phone) || d.consent !== true || !validDate(date) || !TIME.test(time)) return json(422, { error: "invalid" });
  const D = await db(env).catch(() => null);
  if (!D) return json(503, { error: "not_configured" });

  const S = await getSettings(D);
  const svc = S.services.find((x) => x.id === clip(d.svc, 40));
  const now = nowIL();
  if (!svc || date < now.date || date > addDays(now.date, BOOK_AHEAD_DAYS)) return json(422, { error: "invalid" });

  const ip = ipOf(request);
  if (await limited(D, "book", ip, 5, 600)) return json(429, { error: "too_many" });
  const list = slotList(S.site, await busyFor(D, date), date, svc.min, now);
  if (!list || !list.some((x) => x.t === time && x.free)) return json(409, { error: "slot_taken" });

  await hit(D, "book", ip);
  await D.prepare("INSERT INTO appts (id, created, date, time, name, phone, svc, price, min, status, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)")
    .bind(uid(), new Date().toISOString(), date, time, name, phone, svc.name, svc.price, svc.min, clip(d.note, 200)).run();
  await audit(D, "תור חדש נקבע מהאתר: " + name + ", " + date + " " + time);
  return json(200, { ok: true });
}
export const onRequest = () => json(405, { error: "method_not_allowed" });
