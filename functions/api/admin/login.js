// Admin sign-in: password check with a lockout after repeated failures.
import { json, db, sameOrigin, readJson, limited, hit, ipOf, pwOk, checkPassword, makeToken, cookie, audit } from "../../../src/core.js";
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json(403, { error: "forbidden" });
  const D = await db(env).catch(() => null);
  if (!pwOk(env) || !D) return json(503, { error: "not_configured" });
  const ip = ipOf(request);
  if (await limited(D, "login", ip, 5, 900)) return json(429, { error: "locked" });
  const d = await readJson(request, 1000);
  if (!d || !(await checkPassword(env, d.password))) {
    await hit(D, "login", ip);
    await audit(D, "ניסיון כניסה כושל למערכת הניהול");
    return json(401, { error: "wrong_password" });
  }
  await D.prepare("DELETE FROM hits WHERE kind = 'login' AND ip = ?").bind(ip).run();
  await audit(D, "כניסה למערכת הניהול");
  return json(200, { ok: true }, { "Set-Cookie": cookie(await makeToken(env), 8 * 3600) });
}
export const onRequest = () => json(405, { error: "method_not_allowed" });
