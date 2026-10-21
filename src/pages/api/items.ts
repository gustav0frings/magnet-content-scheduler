import type { APIRoute } from "astro";
import { assertInboxSecret, json } from "../../lib/auth";
import { getDevice, listDevices } from "../../lib/devices";
import {
  addItem,
  inDefaultWindow,
  itemMatchesDevice,
  listItems,
} from "../../lib/schedule";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const deviceId = url.searchParams.get("device");
  const country = url.searchParams.get("country");
  const window = url.searchParams.get("window") !== "all";

  let items = await listItems();
  if (window) items = inDefaultWindow(items);
  if (deviceId) items = items.filter((i) => itemMatchesDevice(i, deviceId));
  if (country) {
    const devices = await listDevices();
    const matchIds = new Set(
      devices.filter((d) => d.country === country).map((d) => d.id),
    );
    items = items.filter(
      (i) =>
        i.country === country || i.deviceIds.some((id) => matchIds.has(id)),
    );
  }

  return json({ items });
};

export const POST: APIRoute = async ({ request }) => {
  const denied = assertInboxSecret(request);
  if (denied) return denied;

  let body: {
    deviceId?: string;
    deviceIds?: string[];
    title?: string;
    url?: string;
    fileKey?: string;
    publishAt?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const rawIds = body.deviceIds?.length
    ? body.deviceIds
    : body.deviceId
      ? [body.deviceId]
      : [];
  const deviceIds = [...new Set(rawIds.map((id) => String(id).trim()).filter(Boolean))];
  if (deviceIds.length === 0) {
    return json({ error: "deviceId or deviceIds required" }, 400);
  }

  const devices = [];
  for (const id of deviceIds) {
    const device = await getDevice(id);
    if (!device) return json({ error: `Unknown deviceId: ${id}` }, 400);
    devices.push(device);
  }

  if (!body.title?.trim()) return json({ error: "title required" }, 400);
  if (!body.url?.trim()) return json({ error: "url required" }, 400);
  if (!body.fileKey?.trim()) return json({ error: "fileKey required" }, 400);
  if (!body.publishAt || Number.isNaN(Date.parse(body.publishAt))) {
    return json({ error: "publishAt must be a valid ISO date" }, 400);
  }

  const item = await addItem({
    deviceIds: devices.map((d) => d.id),
    country: devices[0].country,
    title: body.title.trim(),
    url: body.url.trim(),
    fileKey: body.fileKey.trim(),
    publishAt: new Date(body.publishAt).toISOString(),
  });

  return json({ item }, 201);
};
