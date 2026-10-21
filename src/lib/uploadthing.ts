import { UTApi, UTFile } from "uploadthing/server";

/**
 * Mutable JSON “tables” on UploadThing.
 * No fixed customId — those 409 when overwritten. We delete by filename then re-upload.
 */
export const SCHEDULE_FILE = "magnet-schedule.json";
export const DEVICES_FILE = "magnet-devices.json";
export const ACCOUNTS_FILE = "magnet-accounts.json";

/** Legacy customIds (read-only fallback while migrating). */
const LEGACY_SCHEDULE_CUSTOM_ID = "magnet-content-schedule";
const LEGACY_DEVICES_CUSTOM_IDS = [
  "magnet-devices-v2",
  "magnet-content-devices",
];

type ListedFile = {
  key: string;
  name: string;
  customId?: string | null;
  ufsUrl?: string;
  url?: string;
  uploadedAt?: number | string | Date;
};

export function getUtApi(): UTApi {
  const token = process.env.UPLOADTHING_TOKEN;
  if (!token) {
    throw new Error("UPLOADTHING_TOKEN is not set");
  }
  return new UTApi({ token });
}

export function getAppId(token = process.env.UPLOADTHING_TOKEN): string {
  if (!token) throw new Error("UPLOADTHING_TOKEN is not set");
  try {
    const json = JSON.parse(
      Buffer.from(token, "base64url").toString("utf8"),
    ) as { appId?: string };
    if (!json.appId) throw new Error("no appId");
    return json.appId;
  } catch {
    const json = JSON.parse(
      Buffer.from(token, "base64").toString("utf8"),
    ) as { appId?: string };
    if (!json.appId) throw new Error("UPLOADTHING_TOKEN missing appId");
    return json.appId;
  }
}

function publicKeyUrl(key: string, token = process.env.UPLOADTHING_TOKEN): string {
  return `https://${getAppId(token)}.ufs.sh/f/${key}`;
}

function publicCustomIdUrl(
  customId: string,
  token = process.env.UPLOADTHING_TOKEN,
): string {
  return `https://${getAppId(token)}.ufs.sh/f/${customId}`;
}

async function listAllFiles(utapi: UTApi): Promise<ListedFile[]> {
  const out: ListedFile[] = [];
  let offset = 0;
  for (;;) {
    const page = await utapi.listFiles({ limit: 100, offset });
    const files = (page as { files?: ListedFile[] }).files ?? [];
    out.push(...files);
    if (files.length < 100) break;
    offset += 100;
    if (offset > 5000) break;
  }
  return out;
}

async function findByName(utapi: UTApi, filename: string): Promise<ListedFile[]> {
  return (await listAllFiles(utapi)).filter((f) => f.name === filename);
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to read ${url} (${res.status})`);
  }
  const text = await res.text();
  if (!text.trim()) return null;
  return JSON.parse(text) as T;
}

export async function readJsonFile<T>(filename: string): Promise<T | null> {
  const utapi = getUtApi();
  const hits = await findByName(utapi, filename);
  if (hits.length > 0) {
    const newest = [...hits].sort((a, b) => {
      const ta = new Date(a.uploadedAt ?? 0).getTime();
      const tb = new Date(b.uploadedAt ?? 0).getTime();
      return tb - ta;
    })[0];
    const url =
      newest.ufsUrl || newest.url || publicKeyUrl(newest.key);
    return fetchJson<T>(url);
  }

  // Legacy customId fallback (one-time migration path)
  if (filename === SCHEDULE_FILE) {
    return fetchJson<T>(publicCustomIdUrl(LEGACY_SCHEDULE_CUSTOM_ID));
  }
  if (filename === DEVICES_FILE) {
    for (const id of LEGACY_DEVICES_CUSTOM_IDS) {
      const data = await fetchJson<T>(publicCustomIdUrl(id));
      if (data) return data;
    }
  }
  return null;
}

export async function uploadJsonFile(
  filename: string,
  data: unknown,
): Promise<{ key: string; url: string }> {
  const utapi = getUtApi();
  const existing = await findByName(utapi, filename);
  if (existing.length > 0) {
    await utapi.deleteFiles(existing.map((f) => f.key));
    // Ingest can lag a beat after delete
    await new Promise((r) => setTimeout(r, 400));
  }

  const body = JSON.stringify(data, null, 2);
  // No customId — avoids permanent 409 "File already exists" on overwrite
  const file = new UTFile([body], filename, { type: "application/json" });
  const result = await utapi.uploadFiles(file);
  if (result.error || !result.data) {
    throw new Error(
      `Upload ${filename} failed: ${JSON.stringify(result.error)}`,
    );
  }
  return {
    key: result.data.key,
    url: result.data.ufsUrl ?? result.data.url,
  };
}
