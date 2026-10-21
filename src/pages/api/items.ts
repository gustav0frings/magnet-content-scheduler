import type { APIRoute } from "astro";
import { assertInboxSecret, json } from "../../lib/auth";
import { getDevice } from "../../lib/devices";
import { addItem, inDefaultWindow, listItems } from "../../lib/schedule";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const deviceId = url.searchParams.get("device");
  const country = url.searchParams.get("country");
  const window = url.searchParams.get("window") !== "all";

  let items = await listItems();
  if (window) items = inDefaultWindow(items);
  if (deviceId) items = items.filter((i) => i.deviceId === deviceId);
  if (country) items = items.filter((i) => i.country === country);

  return json({ items });
};

export const POST: APIRoute = async ({ request }) => {
  const denied = assertInboxSecret(request);
  if (denied) return denied;

  let body: {
    deviceId?: string;
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

  const device = body.deviceId ? getDevice(body.deviceId) : undefined;
  if (!device) return json({ error: "Unknown deviceId" }, 400);
  if (!body.title?.trim()) return json({ error: "title required" }, 400);
  if (!body.url?.trim()) return json({ error: "url required" }, 400);
  if (!body.fileKey?.trim()) return json({ error: "fileKey required" }, 400);
  if (!body.publishAt || Number.isNaN(Date.parse(body.publishAt))) {
    return json({ error: "publishAt must be a valid ISO date" }, 400);
  }

  const item = await addItem({
    deviceId: device.id,
    country: device.country,
    title: body.title.trim(),
    url: body.url.trim(),
    fileKey: body.fileKey.trim(),
    publishAt: new Date(body.publishAt).toISOString(),
  });

  return json({ item }, 201);
};
