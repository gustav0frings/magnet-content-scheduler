import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ScheduleItem } from "./types";

const LOCAL_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../data/schedule.json",
);

const BLOB_PATHNAME = "content-scheduler/schedule.json";

function useBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readLocal(): Promise<ScheduleItem[]> {
  try {
    const raw = await readFile(LOCAL_PATH, "utf8");
    return JSON.parse(raw) as ScheduleItem[];
  } catch {
    return [];
  }
}

async function writeLocal(items: ScheduleItem[]): Promise<void> {
  await mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  await writeFile(LOCAL_PATH, JSON.stringify(items, null, 2) + "\n", "utf8");
}

async function readBlob(): Promise<ScheduleItem[]> {
  const { list } = await import("@vercel/blob");
  const { blobs } = await list({ prefix: BLOB_PATHNAME });
  const hit = blobs.find((b) => b.pathname === BLOB_PATHNAME);
  if (!hit) return [];
  const res = await fetch(hit.url);
  if (!res.ok) return [];
  return (await res.json()) as ScheduleItem[];
}

async function writeBlob(items: ScheduleItem[]): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(BLOB_PATHNAME, JSON.stringify(items, null, 2), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function listItems(): Promise<ScheduleItem[]> {
  const items = useBlob() ? await readBlob() : await readLocal();
  return items.sort(
    (a, b) =>
      new Date(a.publishAt).getTime() - new Date(b.publishAt).getTime(),
  );
}

export async function saveItems(items: ScheduleItem[]): Promise<void> {
  if (useBlob()) await writeBlob(items);
  else await writeLocal(items);
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
