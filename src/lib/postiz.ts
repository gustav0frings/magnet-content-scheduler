/**
 * Postiz Public API helpers (schedule when an account is linked).
 * Docs: https://docs.postiz.com/public-api/introduction
 * Analytics: https://docs.postiz.com/public-api/analytics/post
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

export type PostizPost = {
  id: string;
  content?: string;
  publishDate?: string;
  state?: string;
  releaseURL?: string | null;
  integration?: {
    id: string;
    name?: string;
    providerIdentifier?: string;
  };
};

export type PostizMetricPoint = {
  total: string;
  date: string;
};

export type PostizMetric = {
  label: string;
  data: PostizMetricPoint[];
  percentageChange?: number;
};

export function hasPostizApiKey(): boolean {
  return Boolean(process.env.POSTIZ_API_KEY?.trim());
}

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

/**
 * Caption Postiz from the schedule `--title`.
 * Always includes the video title + `#tinder` (unless already present).
 */
export function formatPostizCaption(title: string): string {
  const t = title.trim();
  if (!t) return "#tinder";
  if (/(^|\s)#tinder\b/i.test(t)) return t;
  return `${t}\n\n#tinder`;
}

/** Plain caption → one `<p>` per non-empty line (keeps `#tinder` on its own line). */
function plainCaptionToHtml(plain: string): string {
  const parts = plain
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (parts.length === 0) return "<p> </p>";
  return parts.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
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
    : plainCaptionToHtml(input.content.trim() || " ");

  const settings: Record<string, unknown> = { __type };
  if (__type === "instagram" || __type === "instagram-standalone") {
    settings.post_type = "post";
  }
  if (__type === "tiktok" || __type === "tiktok-business") {
    settings.privacy_level = "PUBLIC_TO_EVERYONE";
    settings.duet = false;
    settings.stitch = false;
    settings.comment = true;
    // tiktok-business schema wants "yes"|"no"; legacy tiktok accepts bool — string is fine for both
    settings.autoAddMusic = "no";
    settings.brand_content_toggle = false;
    settings.brand_organic_toggle = false;
    settings.content_posting_method = "DIRECT_POST";
    if (__type === "tiktok-business") {
      settings.video_made_with_ai = false;
    }
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

/** Extract the first Postiz post id from a schedule/create response. */
export function extractPostizPostId(posted: unknown): string | null {
  const fromObj = (o: Record<string, unknown>): string | null => {
    for (const key of ["id", "postId", "post_id"] as const) {
      const v = o[key];
      if (typeof v === "string" && v) return v;
    }
    return null;
  };

  if (!posted || typeof posted !== "object") return null;
  if (Array.isArray(posted)) {
    if (posted[0] && typeof posted[0] === "object") {
      return fromObj(posted[0] as Record<string, unknown>);
    }
    return null;
  }
  const root = posted as Record<string, unknown>;
  const direct = fromObj(root);
  if (direct) return direct;
  const posts = root.posts;
  if (Array.isArray(posts) && posts[0] && typeof posts[0] === "object") {
    return fromObj(posts[0] as Record<string, unknown>);
  }
  return null;
}

export async function deletePostizPost(postId: string): Promise<void> {
  const res = await postizFetch(`/posts/${encodeURIComponent(postId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`Postiz delete ${res.status}: ${await res.text()}`);
  }
}

export async function listPostizPosts(
  startDate: string,
  endDate: string,
): Promise<PostizPost[]> {
  const qs = new URLSearchParams({ startDate, endDate });
  const res = await postizFetch(`/posts?${qs}`);
  if (!res.ok) {
    throw new Error(`Postiz posts ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as PostizPost[] | { posts?: PostizPost[] };
  if (Array.isArray(body)) return body;
  return body.posts ?? [];
}

export async function getPostAnalytics(
  postId: string,
  days = 7,
): Promise<PostizMetric[]> {
  const qs = new URLSearchParams({ date: String(days) });
  const res = await postizFetch(`/analytics/post/${encodeURIComponent(postId)}?${qs}`);
  if (!res.ok) {
    throw new Error(`Postiz post analytics ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as PostizMetric[] | { data?: PostizMetric[] };
  if (Array.isArray(body)) return body;
  return body.data ?? [];
}

export async function getPlatformAnalytics(
  integrationId: string,
  days = 7,
): Promise<PostizMetric[]> {
  const qs = new URLSearchParams({ date: String(days) });
  const res = await postizFetch(
    `/analytics/${encodeURIComponent(integrationId)}?${qs}`,
  );
  if (!res.ok) {
    throw new Error(
      `Postiz platform analytics ${res.status}: ${await res.text()}`,
    );
  }
  const body = (await res.json()) as PostizMetric[] | { data?: PostizMetric[] };
  if (Array.isArray(body)) return body;
  return body.data ?? [];
}

const VIEW_LABELS = ["views", "view", "video views", "impressions", "plays"];

/** Latest total for Views (or Impressions fallback). */
export function extractViewsTotal(metrics: PostizMetric[]): number | null {
  const metric = findMetric(metrics, VIEW_LABELS);
  if (!metric?.data?.length) return null;
  const last = metric.data[metric.data.length - 1];
  const n = Number(last?.total);
  return Number.isFinite(n) ? n : null;
}

/** Daily series for Views (or Impressions). Missing days omitted. */
export function extractViewsSeries(
  metrics: PostizMetric[],
): { date: string; total: number }[] {
  const metric = findMetric(metrics, VIEW_LABELS);
  if (!metric?.data?.length) return [];
  return metric.data
    .map((p) => ({ date: p.date, total: Number(p.total) }))
    .filter((p) => p.date && Number.isFinite(p.total));
}

function findMetric(
  metrics: PostizMetric[],
  labels: string[],
): PostizMetric | undefined {
  const wanted = new Set(labels.map((l) => l.toLowerCase()));
  return metrics.find((m) => wanted.has(String(m.label ?? "").toLowerCase()));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
