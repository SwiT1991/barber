// Public: the editable parts of the site (services, prices, texts, opening hours, reviews).
import { json, db, getSettings } from "../../src/core.js";
export async function onRequestGet({ env }) {
  const D = await db(env).catch(() => null);
  return json(200, await getSettings(D), { "Cache-Control": "public, max-age=60" });
}
