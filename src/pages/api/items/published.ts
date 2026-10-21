import type { APIRoute } from "astro";
import { json } from "../../../lib/auth";
import { setPublished } from "../../../lib/schedule";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: { id?: string; published?: boolean };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body.id || typeof body.published !== "boolean") {
    return json({ error: "id and published required" }, 400);
  }

  const item = await setPublished(body.id, body.published);
  if (!item) return json({ error: "Not found" }, 404);

  return json({ item });
};
