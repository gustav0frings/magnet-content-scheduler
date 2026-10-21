import { UTApi, UTFile } from "uploadthing/server";

/** Fixed customIds for JSON blobs on UploadThing (not Vercel). */
export const SCHEDULE_CUSTOM_ID = "magnet-content-schedule";
export const DEVICES_CUSTOM_ID = "magnet-content-devices";

export function getUtApi(): UTApi {
  const token = process.env.UPLOADTHING_TOKEN;
  if (!token) {
    throw new Error("UPLOADTHING_TOKEN is not set");
  }
  return new UTApi({ token });
}

/** UploadThing token is a base64 JSON blob: { apiKey, appId, regions }. */
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

export function publicFileUrl(
  customId: string,
  token = process.env.UPLOADTHING_TOKEN,
): string {
  return `https://${getAppId(token)}.ufs.sh/f/${customId}`;
}

export function schedulePublicUrl(token = process.env.UPLOADTHING_TOKEN): string {
  return publicFileUrl(SCHEDULE_CUSTOM_ID, token);
}

export async function readJsonFile<T>(customId: string): Promise<T | null> {
  const url = publicFileUrl(customId);
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to read ${customId} (${res.status}) from ${url}`);
  }
  const text = await res.text();
  if (!text.trim()) return null;
  return JSON.parse(text) as T;
}

export async function uploadJsonFile(
  customId: string,
  filename: string,
  data: unknown,
): Promise<{ key: string; url: string }> {
  const utapi = getUtApi();
  await utapi.deleteFiles(customId, { keyType: "customId" }).catch(() => undefined);

  const body = JSON.stringify(data, null, 2);
  const file = new UTFile([body], filename, {
    type: "application/json",
    customId,
  });
  const result = await utapi.uploadFiles(file);
  if (result.error || !result.data) {
    throw new Error(`Upload ${customId} failed: ${JSON.stringify(result.error)}`);
  }
  return {
    key: result.data.key,
    url: result.data.ufsUrl ?? result.data.url,
  };
}

export async function uploadScheduleJson(
  _utapi: UTApi,
  items: unknown,
): Promise<{ key: string; url: string }> {
  return uploadJsonFile(SCHEDULE_CUSTOM_ID, "schedule.json", items);
}
