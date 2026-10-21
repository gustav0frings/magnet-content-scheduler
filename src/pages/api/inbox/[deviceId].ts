import type { APIRoute } from "astro";
import { json } from "../../../lib/auth";
import { getDevice } from "../../../lib/devices";
import { listItems, readyForInbox } from "../../../lib/schedule";
import type { InboxItem } from "../../../lib/types";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const deviceId = params.deviceId;
  if (!deviceId || !getDevice(deviceId)) {
    return json({ error: "Unknown device" }, 404);
  }

  const ready = readyForInbox(await listItems(), deviceId);
  const items: InboxItem[] = ready.map((i) => ({
    id: i.id,
    title: i.title,
    url: i.url,
  }));

  return json({ items });
};
