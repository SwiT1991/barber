// Everything the admin screen shows. Signed-in admin only.
import { json, db, isAuthed, pwOk, getSettings } from "../../../src/core.js";
export async function onRequestGet({ request, env }) {
  const D = await db(env).catch(() => null);
  if (!pwOk(env) || !D) return json(503, { error: "not_configured" });
  if (!(await isAuthed(request, env))) return json(401, { error: "unauthorized" });
  const [appts, log] = await Promise.all([
    D.prepare("SELECT * FROM appts ORDER BY date DESC, time DESC LIMIT 2000").all(),
    D.prepare("SELECT ts, msg FROM audit ORDER BY id DESC LIMIT 80").all(),
  ]);
  return json(200, { appts: appts.results, settings: await getSettings(D), log: log.results });
}
export const onRequest = () => json(405, { error: "method_not_allowed" });
