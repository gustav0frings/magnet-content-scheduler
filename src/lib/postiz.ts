/**
 * Postiz Public API helpers (schedule when an account is linked).
 * Docs: https://docs.postiz.com/public-api/introduction
 */

const POSTIZ_API = "https://api.postiz.com/public/v1";

export type PostizUpload = {
  id: string;
  path: string;
  name?: string;
};

export type PostizIntegration = {
  id: string;
  name: string;
  identifier?: string;
  picture?: string;
};

function apiKey(): string {
  const key = process.env.POSTIZ_API_KEY?.trim();
  if (!key) {
    throw new Error("POSTIZ_API_KEY missing (.env) — required to schedule on Postiz");
  }
  return key;
}

async function postizFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", apiKey());
  return fetch(`${POSTIZ_API}${path}`, { ...init, headers });
}

/** Map magnet platform → Postiz settings `__type`. */
export function postizSettingsType(
  platform: "instagram" | "tiktok",
  integrationIdentifier?: string,
): string {
  if (integrationIdentifier) return integrationIdentifier;
  if (platform === "instagram") return "instagram-standalone";
  return "tiktok";
}

export async function listPostizIntegrations(): Promise<PostizIntegration[]> {
  const res = await postizFetch("/integrations");
  if (!res.ok) {
    throw new Error(`Postiz integrations ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as
    | PostizIntegration[]
    | { integrations?: PostizIntegration[] };
  if (Array.isArray(body)) return body;
  return body.integrations ?? [];
}

export async function uploadToPostiz(
  buf: Buffer,
  filename: string,
): Promise<PostizUpload> {
  const form = new FormData();
  const bytes = new Uint8Array(buf);
  form.append(
    "file",
    new Blob([bytes], { type: "video/mp4" }),
    filename.endsWith(".mp4") ? filename : `${filename}.mp4`,
  );
  const res = await postizFetch("/upload", { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(`Postiz upload ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as PostizUpload;
  if (!data?.id || !data?.path) {
    throw new Error(`Postiz upload: unexpected response ${JSON.stringify(data)}`);
  }
  return data;
}

export async function schedulePostizVideo(input: {
  integrationId: string;
  platform: "instagram" | "tiktok";
  /** UTC ISO datetime */
  publishAt: string;
  /** HTML or plain caption (wrapped in <p> if plain) */
  content: string;
  media: PostizUpload;
  integrationIdentifier?: string;
}): Promise<unknown> {
  const __type = postizSettingsType(
    input.platform,
    input.integrationIdentifier,
  );
  const content = input.content.trim().startsWith("<")
    ? input.content.trim()
    : `<p>${escapeHtml(input.content.trim() || " ")}</p>`;

  const settings: Record<string, unknown> = { __type };
  if (__type === "instagram" || __type === "instagram-standalone") {
    settings.post_type = "post";
  }
  if (__type === "tiktok") {
    settings.privacy_level = "PUBLIC_TO_EVERYONE";
    settings.duet = false;
    settings.stitch = false;
    settings.comment = true;
    settings.autoAddMusic = false;
    settings.brand_content_toggle = false;
    settings.brand_organic_toggle = false;
    settings.content_posting_method = "DIRECT_POST";
  }

  const body = {
    type: "schedule",
    date: input.publishAt,
    shortLink: false,
    tags: [],
    posts: [
      {
        integration: { id: input.integrationId },
        value: [
          {
            content,
            image: [{ id: input.media.id, path: input.media.path }],
          },
        ],
        settings,
      },
    ],
  };

  const res = await postizFetch("/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Postiz schedule ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
