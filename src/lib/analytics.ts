/**
 * Resolve Postiz view counts for schedule items (lazy calendar + performance).
 * Does not block SSR — callers hit /api/analytics/* after paint.
 */

import type { Device } from "./devices";
import {
  extractViewsTotal,
  getPostAnalytics,
  hasPostizApiKey,
  listPostizPosts,
  type PostizPost,
} from "./postiz";
import { listItems } from "./schedule";
import type { ScheduleItem } from "./types";

const MATCH_MS = 3 * 60 * 1000; // publishAt vs Postiz publishDate
const ANALYTICS_TTL_MS = 5 * 60 * 1000;

type CacheEntry<T> = { at: number; value: T };
const postViewsCache = new Map<string, CacheEntry<number | null>>();

function cacheGet<T>(map: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const hit = map.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > ANALYTICS_TTL_MS) {
    map.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet<T>(
  map: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
): void {
  map.set(key, { at: Date.now(), value });
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function postizDeviceForItem(
  item: ScheduleItem,
  devices: Device[],
): Device | undefined {
  const ids = item.deviceIds?.length ? item.deviceIds : [item.deviceId];
  for (const id of ids) {
    const d = devices.find((x) => x.id === id);
    if (d?.postizIntegrationId) return d;
  }
  return undefined;
}

/** Match a schedule row to a Postiz post (id stored, or integration + time/title). */
export function matchPostizPost(
  item: ScheduleItem,
  device: Device,
  posts: PostizPost[],
): PostizPost | undefined {
  if (item.postizPostId) {
    const byId = posts.find((p) => p.id === item.postizPostId);
    if (byId) return byId;
  }
  const integrationId = device.postizIntegrationId;
  if (!integrationId) return undefined;

  const title = item.title.trim().toLowerCase();
  const itemMs = new Date(item.publishAt).getTime();
  const candidates = posts.filter((p) => p.integration?.id === integrationId);

  let best: PostizPost | undefined;
  let bestDelta = Infinity;
  for (const p of candidates) {
    const postMs = p.publishDate ? new Date(p.publishDate).getTime() : NaN;
    const delta = Number.isFinite(postMs) ? Math.abs(postMs - itemMs) : Infinity;
    const content = stripHtml(p.content ?? "").toLowerCase();
    const titleMatch = Boolean(title) && content === title;
    if (delta <= MATCH_MS || titleMatch) {
      // Prefer PUBLISHED when two posts match the same slot
      const stateBoost = p.state === "PUBLISHED" ? 0 : 1;
      const score =
        (titleMatch ? Math.min(delta, MATCH_MS / 2) : delta) + stateBoost;
      if (score < bestDelta) {
        bestDelta = score;
        best = p;
      }
    }
  }
  return best;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }
  const n = Math.min(concurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

export type ItemViews = {
  id: string;
  views: number | null;
  postizPostId: string | null;
  status: "ok" | "pending" | "unavailable" | "error";
};

/**
 * Resolve view counts for schedule item ids. Safe when Postiz key missing.
 * Only items linked to a Postiz account are queried.
 */
export async function viewsForItems(
  items: ScheduleItem[],
  devices: Device[],
  days = 7,
): Promise<ItemViews[]> {
  if (!hasPostizApiKey()) {
    return items.map((item) => ({
      id: item.id,
      views: null,
      postizPostId: item.postizPostId ?? null,
      status: "unavailable" as const,
    }));
  }

  const linked = items.filter((item) => postizDeviceForItem(item, devices));
  if (linked.length === 0) {
    return items.map((item) => ({
      id: item.id,
      views: null,
      postizPostId: item.postizPostId ?? null,
      status: "unavailable" as const,
    }));
  }

  const times = linked.map((i) => new Date(i.publishAt).getTime());
  const minMs = Math.min(...times) - MATCH_MS;
  const maxMs = Math.max(...times) + MATCH_MS;
  const startDate = new Date(minMs).toISOString();
  const endDate = new Date(Math.max(maxMs, Date.now())).toISOString();

  let posts: PostizPost[] = [];
  try {
    posts = await listPostizPosts(startDate, endDate);
  } catch {
    return items.map((item) => ({
      id: item.id,
      views: null,
      postizPostId: item.postizPostId ?? null,
      status: "error" as const,
    }));
  }

  const resolved = await mapPool(items, 4, async (item): Promise<ItemViews> => {
    const device = postizDeviceForItem(item, devices);
    if (!device) {
      return {
        id: item.id,
        views: null,
        postizPostId: item.postizPostId ?? null,
        status: "unavailable",
      };
    }

    const post = matchPostizPost(item, device, posts);
    if (!post) {
      const published = new Date(item.publishAt).getTime() <= Date.now();
      return {
        id: item.id,
        views: null,
        postizPostId: item.postizPostId ?? null,
        status: published ? "unavailable" : "pending",
      };
    }

    if (post.state !== "PUBLISHED") {
      return {
        id: item.id,
        views: null,
        postizPostId: post.id,
        status: "pending",
      };
    }

    const cached = cacheGet(postViewsCache, post.id);
    if (cached !== undefined) {
      return {
        id: item.id,
        views: cached,
        postizPostId: post.id,
        status: "ok",
      };
    }

    try {
      const metrics = await getPostAnalytics(post.id, days);
      const views = extractViewsTotal(metrics);
      cacheSet(postViewsCache, post.id, views);
      return {
        id: item.id,
        views,
        postizPostId: post.id,
        status: views == null ? "unavailable" : "ok",
      };
    } catch {
      return {
        id: item.id,
        views: null,
        postizPostId: post.id,
        status: "error",
      };
    }
  });

  return resolved;
}

export type CreatorSeries = {
  accountId: string;
  name: string;
  platform: string;
  integrationId: string;
  series: { date: string; total: number }[];
  total: number;
};

export type TopVideo = {
  postId: string;
  title: string;
  views: number;
  publishDate: string | null;
  releaseURL: string | null;
  /** UploadThing mp4 when matched to the phone schedule (for thumb preview). */
  thumbnailUrl: string | null;
  accountId: string | null;
  creatorName: string;
  platform: string;
};

export type PerformancePayload = {
  days: number;
  from: string;
  to: string;
  creators: CreatorSeries[];
  total: { date: string; total: number }[];
  grandTotal: number;
  topVideos: TopVideo[];
  configured: boolean;
};

function emptyDaySeries(fromIso: string, toIso: string): { date: string; total: number }[] {
  const out: { date: string; total: number }[] = [];
  const cur = new Date(`${fromIso}T12:00:00Z`);
  const end = new Date(`${toIso}T12:00:00Z`);
  while (cur <= end) {
    out.push({ date: cur.toISOString().slice(0, 10), total: 0 });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** Match a Postiz post to the UploadThing schedule row for a video thumb. */
function scheduleThumbForPost(
  post: PostizPost,
  device: Device | undefined,
  items: ScheduleItem[],
): string | null {
  if (items.length === 0) return null;
  const byId = items.find((i) => i.postizPostId && i.postizPostId === post.id);
  if (byId?.url) return byId.url;

  const title = stripHtml(post.content ?? "").trim().toLowerCase();
  if (!title) return null;
  const itemMs = post.publishDate ? new Date(post.publishDate).getTime() : NaN;

  let best: ScheduleItem | undefined;
  let bestDelta = Infinity;
  for (const item of items) {
    if (device) {
      const ids = item.deviceIds?.length ? item.deviceIds : [item.deviceId];
      if (!ids.includes(device.id)) continue;
    }
    if (item.title.trim().toLowerCase() !== title) continue;
    const delta = Number.isFinite(itemMs)
      ? Math.abs(new Date(item.publishAt).getTime() - itemMs)
      : 0;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = item;
    }
  }
  return best?.url ?? null;
}

/**
 * Last N days: organic views from Postiz **posts only** (no account-level
 * Views — those include Instagram/TikTok ads and inflate creators like Corentin).
 */
export async function performanceLastDays(
  devices: Device[],
  days = 7,
): Promise<PerformancePayload> {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  from.setUTCHours(0, 0, 0, 0);
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);

  const empty: PerformancePayload = {
    days,
    from: fromIso,
    to: toIso,
    creators: [],
    total: [],
    grandTotal: 0,
    topVideos: [],
    configured: hasPostizApiKey(),
  };

  if (!hasPostizApiKey()) return empty;

  const linked = devices.filter((d) => d.postizIntegrationId?.trim());
  if (linked.length === 0) return empty;

  const deviceByIntegration = new Map(
    linked.map((d) => [d.postizIntegrationId!, d] as const),
  );

  let posts: PostizPost[] = [];
  try {
    posts = await listPostizPosts(from.toISOString(), to.toISOString());
  } catch {
    posts = [];
  }

  let scheduleItems: ScheduleItem[] = [];
  try {
    scheduleItems = await listItems();
  } catch {
    scheduleItems = [];
  }

  const published = posts.filter((p) => p.state === "PUBLISHED" && p.integration?.id);

  const postViews = await mapPool(published, 4, async (post) => {
    const cacheKey = `${post.id}:${days}`;
    const cached = cacheGet(postViewsCache, cacheKey);
    if (cached !== undefined) {
      return { post, views: cached };
    }
    try {
      const metrics = await getPostAnalytics(post.id, days);
      const views = extractViewsTotal(metrics);
      cacheSet(postViewsCache, cacheKey, views);
      return { post, views };
    } catch {
      return { post, views: null as number | null };
    }
  });

  const topVideos: TopVideo[] = postViews
    .filter((row): row is { post: PostizPost; views: number } => row.views != null)
    .map(({ post, views }) => {
      const device = post.integration?.id
        ? deviceByIntegration.get(post.integration.id)
        : undefined;
      return {
        postId: post.id,
        title: stripHtml(post.content ?? "") || "(untitled)",
        views,
        publishDate: post.publishDate ?? null,
        releaseURL: post.releaseURL ?? null,
        thumbnailUrl: scheduleThumbForPost(post, device, scheduleItems),
        accountId: device?.id ?? null,
        creatorName: device?.name ?? post.integration?.name ?? "?",
        platform: device?.platform ?? post.integration?.providerIdentifier ?? "",
      };
    })
    .sort((a, b) => b.views - a.views)
    .slice(0, 20);

  const seriesByIntegration = new Map<string, Map<string, number>>();
  for (const d of linked) {
    seriesByIntegration.set(
      d.postizIntegrationId!,
      new Map(emptyDaySeries(fromIso, toIso).map((p) => [p.date, 0])),
    );
  }

  for (const { post, views } of postViews) {
    if (views == null || !post.integration?.id) continue;
    const dayMap = seriesByIntegration.get(post.integration.id);
    if (!dayMap) continue;
    const day = (post.publishDate ?? "").slice(0, 10);
    if (!dayMap.has(day)) continue;
    dayMap.set(day, (dayMap.get(day) ?? 0) + views);
  }

  const creators: CreatorSeries[] = linked.map((device) => {
    const integrationId = device.postizIntegrationId!;
    const dayMap = seriesByIntegration.get(integrationId)!;
    const series = [...dayMap.entries()]
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const total = series.reduce((sum, p) => sum + p.total, 0);
    return {
      accountId: device.id,
      name: device.name,
      platform: device.platform,
      integrationId,
      series,
      total,
    };
  });

  const byDate = new Map(emptyDaySeries(fromIso, toIso).map((p) => [p.date, 0]));
  for (const c of creators) {
    for (const p of c.series) {
      byDate.set(p.date, (byDate.get(p.date) ?? 0) + p.total);
    }
  }
  const total = [...byDate.entries()]
    .map(([date, t]) => ({ date, total: t }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const grandTotal = total.reduce((sum, p) => sum + p.total, 0);

  return {
    days,
    from: fromIso,
    to: toIso,
    creators: creators.sort((a, b) => b.total - a.total),
    total,
    grandTotal,
    topVideos,
    configured: true,
  };
}
