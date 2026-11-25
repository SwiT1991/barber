import { json, sameOrigin, cookie } from "../../../src/core.js";
export async function onRequestPost({ request }) {
  if (!sameOrigin(request)) return json(403, { error: "forbidden" });
  return json(200, { ok: true }, { "Set-Cookie": cookie("x", 0) });
}
export const onRequest = () => json(405, { error: "method_not_allowed" });
