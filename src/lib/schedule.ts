import type { ScheduleItem } from "./types";
import {
  SCHEDULE_CUSTOM_ID,
  getUtApi,
  readJsonFile,
  uploadJsonFile,
} from "./uploadthing";

async function readFromUploadThing(): Promise<ScheduleItem[]> {
  const data = await readJsonFile<ScheduleItem[]>(SCHEDULE_CUSTOM_ID);
  return data ?? [];
}

async function writeToUploadThing(items: ScheduleItem[]): Promise<void> {
  await uploadJsonFile(SCHEDULE_CUSTOM_ID, "schedule.json", items);
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

/**
 * Drop schedule rows whose publishAt is older than `days` days,
 * and delete their video files from UploadThing.
 */
export async function clearOlderThan(
  days = 7,
  now = new Date(),
): Promise<{ removed: ScheduleItem[]; kept: number }> {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffMs = cutoff.getTime();

  const items = await listItems();
  const stale = items.filter(
    (i) => new Date(i.publishAt).getTime() < cutoffMs,
  );
  const keep = items.filter(
    (i) => new Date(i.publishAt).getTime() >= cutoffMs,
  );

  if (stale.length === 0) {
    return { removed: [], kept: keep.length };
  }

  const keys = [...new Set(stale.map((i) => i.fileKey).filter(Boolean))];
  if (keys.length > 0) {
    const utapi = getUtApi();
    await utapi.deleteFiles(keys);
  }

  await saveItems(keep);
  return { removed: stale, kept: keep.length };
}
