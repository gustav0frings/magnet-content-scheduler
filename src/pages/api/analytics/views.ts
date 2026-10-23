import type { APIRoute } from "astro";
import { viewsForItems } from "../../../lib/analytics";
import { json } from "../../../lib/auth";
import { listDevices } from "../../../lib/devices";
import { listItems } from "../../../lib/schedule";

export const prerender = false;

/**
 * Lazy per-video views for calendar cards.
 * GET /api/analytics/views?ids=uuid1,uuid2
 * Never blocks the calendar SSR — call after paint.
 */
export const GET: APIRoute = async ({ url }) => {
  const raw = url.searchParams.get("ids")?.trim() ?? "";
  const ids = [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].slice(0, 80);

  if (ids.length === 0) {
    return json({ views: [], configured: false }, 200);
  }

  const daysRaw = Number(url.searchParams.get("days") ?? "7");
  const days = Number.isFinite(daysRaw)
    ? Math.min(90, Math.max(1, Math.round(daysRaw)))
    : 7;

  try {
    const [allItems, devices] = await Promise.all([listItems(), listDevices()]);
    const idSet = new Set(ids);
    const items = allItems.filter((i) => idSet.has(i.id));
    const views = await viewsForItems(items, devices, days);
    // Keep request order for missing ids
    const byId = new Map(views.map((v) => [v.id, v]));
    const ordered = ids.map(
      (id) =>
        byId.get(id) ?? {
          id,
          views: null,
          postizPostId: null,
          status: "unavailable" as const,
        },
    );

    return new Response(JSON.stringify({ views: ordered }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "private, max-age=120",
      },
    });
  } catch (err) {
    console.error("analytics/views", err);
    return json(
      {
        views: ids.map((id) => ({
          id,
          views: null,
          postizPostId: null,
          status: "error",
        })),
        error: "analytics_failed",
      },
      200,
    );
  }
};
