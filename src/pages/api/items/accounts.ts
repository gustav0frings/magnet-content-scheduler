import type { APIRoute } from "astro";
import { json } from "../../../lib/auth";
import { getDevice, listDevices } from "../../../lib/devices";
import { setItemAccounts } from "../../../lib/schedule";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: { id?: string; deviceIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body.id) return json({ error: "id required" }, 400);
  if (!Array.isArray(body.deviceIds) || body.deviceIds.length === 0) {
    return json({ error: "deviceIds required" }, 400);
  }

  const devices = await listDevices();
  const known = new Set(devices.map((d) => d.id));
  const deviceIds = [
    ...new Set(body.deviceIds.map((id) => String(id).trim()).filter(Boolean)),
  ];
  for (const id of deviceIds) {
    if (!known.has(id)) return json({ error: `Unknown deviceId: ${id}` }, 400);
  }

  const primary = await getDevice(deviceIds[0]);
  if (!primary) return json({ error: "Unknown deviceId" }, 400);

  const item = await setItemAccounts(body.id, deviceIds, primary.country);
  if (!item) return json({ error: "Not found" }, 404);
  return json({ item });
};
