import type { CountryCode } from "./devices";
import type { ScheduleItem } from "./types";
import {
  SCHEDULE_FILE,
  getUtApi,
  readJsonFile,
  uploadJsonFile,
} from "./uploadthing";

async function readFromUploadThing(): Promise<ScheduleItem[]> {
  const data = await readJsonFile<ScheduleItem[]>(SCHEDULE_FILE);
  return data ?? [];
}

async function writeToUploadThing(items: ScheduleItem[]): Promise<void> {
  await uploadJsonFile(SCHEDULE_FILE, items);
}

function uniqueIds(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || out.includes(trimmed)) continue;
    out.push(trimmed);
  }
  return out;
}

/** Normalize legacy `deviceId`-only rows to `deviceIds`. */
export function normalizeItem(
  raw: ScheduleItem & { deviceIds?: string[] | null },
): ScheduleItem {
  const fromArray = Array.isArray(raw.deviceIds) ? raw.deviceIds : [];
  const deviceIds = uniqueIds(
    fromArray.length > 0 ? fromArray : raw.deviceId ? [raw.deviceId] : [],
  );
  const deviceId = deviceIds[0] ?? raw.deviceId ?? "";
  return {
    ...raw,
    deviceIds,
    deviceId,
    publishedAt: raw.publishedAt ?? null,
  };
}

export function itemMatchesDevice(
  item: ScheduleItem,
  deviceId: string,
): boolean {
  return item.deviceIds.includes(deviceId) || item.deviceId === deviceId;
}

export async function listItems(): Promise<ScheduleItem[]> {
  const items = await readFromUploadThing();
  return items
    .map((item) => normalizeItem(item))
    .filter((item) => item.deviceIds.length > 0)
    .sort(
      (a, b) =>
        new Date(a.publishAt).getTime() - new Date(b.publishAt).getTime(),
    );
}

export async function saveItems(items: ScheduleItem[]): Promise<void> {
  await writeToUploadThing(items.map((item) => normalizeItem(item)));
}

export async function addItem(
  item: Omit<
    ScheduleItem,
    "id" | "savedAt" | "publishedAt" | "createdAt" | "deviceId" | "deviceIds"
  > & {
    deviceIds?: string[];
    deviceId?: string;
  },
): Promise<ScheduleItem> {
  const deviceIds = uniqueIds(
    item.deviceIds?.length
      ? item.deviceIds
      : item.deviceId
        ? [item.deviceId]
        : [],
  );
  if (deviceIds.length === 0) throw new Error("deviceIds required");

  const items = await listItems();
  const next = normalizeItem({
    ...item,
    id: crypto.randomUUID(),
    deviceIds,
    deviceId: deviceIds[0],
    savedAt: null,
    publishedAt: null,
    createdAt: new Date().toISOString(),
  } as ScheduleItem);
  items.push(next);
  await saveItems(items);
  return next;
}

export async function setItemAccounts(
  id: string,
  deviceIds: string[],
  country: CountryCode,
): Promise<ScheduleItem | null> {
  const ids = uniqueIds(deviceIds);
  if (ids.length === 0) throw new Error("deviceIds required");
  const items = await listItems();
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  item.deviceIds = ids;
  item.deviceId = ids[0];
  item.country = country;
  await saveItems(items);
  return item;
}

export async function setPublished(
  id: string,
  published: boolean,
): Promise<ScheduleItem | null> {
  const items = await listItems();
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  item.publishedAt = published ? new Date().toISOString() : null;
  await saveItems(items);
  return item;
}

export async function markSaved(
  deviceId: string,
  id: string,
): Promise<ScheduleItem | null> {
  const items = await listItems();
  const item = items.find((i) => i.id === id && itemMatchesDevice(i, deviceId));
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
      itemMatchesDevice(i, deviceId) &&
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
