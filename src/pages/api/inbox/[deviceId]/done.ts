import type { APIRoute } from "astro";
import { json } from "../../../../lib/auth";
import { getDevice } from "../../../../lib/devices";
import { markSaved } from "../../../../lib/schedule";

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const deviceId = params.deviceId;
  if (!deviceId || !(await getDevice(deviceId))) {
    return json({ error: "Unknown device" }, 404);
  }

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body.id) return json({ error: "id required" }, 400);

  const item = await markSaved(deviceId, body.id);
  if (!item) return json({ error: "Not found" }, 404);

  return json({ ok: true, item });
};
