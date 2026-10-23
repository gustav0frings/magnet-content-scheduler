import type { APIRoute } from "astro";
import { performanceLastDays } from "../../../lib/analytics";
import { json } from "../../../lib/auth";
import { listDevices } from "../../../lib/devices";

export const prerender = false;

/**
 * 7-day (default) views series per Postiz-linked creator + total.
 * GET /api/analytics/performance?days=7
 */
export const GET: APIRoute = async ({ url }) => {
  const daysRaw = Number(url.searchParams.get("days") ?? "7");
  const days = Number.isFinite(daysRaw)
    ? Math.min(90, Math.max(1, Math.round(daysRaw)))
    : 7;

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
        configured: false,
        error: "analytics_failed",
      },
      200,
    );
  }
};
