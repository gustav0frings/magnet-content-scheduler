import type { APIRoute } from "astro";
import { performanceLastDays } from "../../../lib/analytics";
import { json } from "../../../lib/auth";
import { listDevices } from "../../../lib/devices";

export const prerender = false;

/**
 * Views series per Postiz-linked creator + total + top videos.
 * GET /api/analytics/performance?days=7|15|30
 */
export const GET: APIRoute = async ({ url }) => {
  const allowed = new Set([7, 15, 30]);
  const daysRaw = Number(url.searchParams.get("days") ?? "7");
  const days = allowed.has(daysRaw) ? daysRaw : 7;

  try {
    const devices = await listDevices();
    const payload = await performanceLastDays(devices, days);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "private, max-age=120",
      },
    });
  } catch (err) {
    console.error("analytics/performance", err);
    return json(
      {
        days,
        from: "",
        to: "",
        creators: [],
        total: [],
        grandTotal: 0,
        topVideos: [],
        configured: false,
        error: "analytics_failed",
      },
      200,
    );
  }
};
