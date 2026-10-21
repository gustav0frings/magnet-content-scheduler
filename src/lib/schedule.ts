import type { ScheduleItem } from "./types";
import {
  getUtApi,
  schedulePublicUrl,
  uploadScheduleJson,
} from "./uploadthing";

async function readFromUploadThing(): Promise<ScheduleItem[]> {
  const url = schedulePublicUrl();
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`Failed to read schedule (${res.status}) from ${url}`);
  }
  const text = await res.text();
  if (!text.trim()) return [];
  return JSON.parse(text) as ScheduleItem[];
}

async function writeToUploadThing(items: ScheduleItem[]): Promise<void> {
  const utapi = getUtApi();
  await uploadScheduleJson(utapi, items);
}

export async function listItems(): Promise<ScheduleItem[]> {
  const items = await readFromUploadThing();
  return items.sort(
    (a, b) =>
      new Date(a.publishAt).getTime() - new Date(b.publishAt).getTime(),
  );
}

export async function saveItems(items: ScheduleItem[]): Promise<void> {
  await writeToUploadThing(items);
}

export async function addItem(
  item: Omit<ScheduleItem, "id" | "savedAt" | "createdAt">,
): Promise<ScheduleItem> {
  const items = await listItems();
  const next: ScheduleItem = {
    ...item,
    id: crypto.randomUUID(),
    savedAt: null,
    createdAt: new Date().toISOString(),
  };
  items.push(next);
  await saveItems(items);
  return next;
}

export async function markSaved(
  deviceId: string,
  id: string,
): Promise<ScheduleItem | null> {
  const items = await listItems();
  const item = items.find((i) => i.id === id && i.deviceId === deviceId);
  if (!item) return null;
  item.savedAt = new Date().toISOString();
  await saveItems(items);
  return item;
}

/** Ready for phone download: published and not yet saved. */
export function readyForInbox(
  items: ScheduleItem[],
  deviceId: string,
  now = new Date(),
): ScheduleItem[] {
  return items.filter(
    (i) =>
      i.deviceId === deviceId &&
      !i.savedAt &&
      new Date(i.publishAt).getTime() <= now.getTime(),
  );
}

/** Calendar window: today (local) through today+7 days. */
export function inDefaultWindow(
  items: ScheduleItem[],
  now = new Date(),
): ScheduleItem[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 8);
  return items.filter((i) => {
    const t = new Date(i.publishAt).getTime();
    return t >= start.getTime() && t < end.getTime();
  });
}
