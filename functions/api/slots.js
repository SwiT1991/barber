// Public: which half-hour slots are free on a date for a service of a given length. Returns times only, no customer data.
import { json, db, getSettings, nowIL, addDays, validDate, busyFor, slotList, BOOK_AHEAD_DAYS } from "../../src/core.js";
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url), date = u.searchParams.get("date") || "", min = Math.round(+u.searchParams.get("min"));
  if (!validDate(date) || !(min >= 30 && min <= 240 && min % 30 === 0)) return json(422, { error: "invalid" });
  const D = await db(env).catch(() => null);
  if (!D) return json(503, { error: "not_configured" });
  const now = nowIL();
  if (date < now.date || date > addDays(now.date, BOOK_AHEAD_DAYS)) return json(200, { slots: [], closed: false, out_of_range: true });
  const S = await getSettings(D);
  const list = slotList(S.site, await busyFor(D, date), date, min, now);
  return json(200, { slots: list || [], closed: !list });
}
export const onRequest = () => json(405, { error: "method_not_allowed" });
