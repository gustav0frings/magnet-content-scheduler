import { UTApi, UTFile } from "uploadthing/server";

/** Fixed customId for the schedule JSON living on UploadThing (not Vercel). */
export const SCHEDULE_CUSTOM_ID = "magnet-content-schedule";

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

export function schedulePublicUrl(token = process.env.UPLOADTHING_TOKEN): string {
  return `https://${getAppId(token)}.ufs.sh/f/${SCHEDULE_CUSTOM_ID}`;
}

export async function uploadScheduleJson(
  utapi: UTApi,
  items: unknown,
): Promise<{ key: string; url: string }> {
  // Replace previous schedule file (same customId).
  await utapi.deleteFiles(SCHEDULE_CUSTOM_ID, { keyType: "customId" }).catch(
    () => undefined,
  );

  const body = JSON.stringify(items, null, 2);
  const file = new UTFile([body], "schedule.json", {
    type: "application/json",
    customId: SCHEDULE_CUSTOM_ID,
  });
  const result = await utapi.uploadFiles(file);
  if (result.error || !result.data) {
    throw new Error(`Schedule upload failed: ${JSON.stringify(result.error)}`);
  }
  return {
    key: result.data.key,
    url: result.data.ufsUrl ?? result.data.url,
  };
}
