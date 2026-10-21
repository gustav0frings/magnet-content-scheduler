import type { APIRoute } from "astro";
import { json } from "../../lib/auth";
import {
  COUNTRY_CODES,
  type CountryCode,
  listDevices,
  registerDevice,
} from "../../lib/devices";

export const prerender = false;

export const GET: APIRoute = async () => {
  const devices = await listDevices();
  return json({ devices });
};

export const POST: APIRoute = async ({ request }) => {
  let body: { name?: string; country?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const name = body.name?.trim();
  const country = body.country?.toUpperCase() as CountryCode | undefined;
  if (!name) return json({ error: "name required" }, 400);
  if (!country || !COUNTRY_CODES.includes(country)) {
    return json({ error: `country must be one of ${COUNTRY_CODES.join(", ")}` }, 400);
  }

  try {
    const device = await registerDevice({ name, country });
    return json({ device }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "register failed";
    return json({ error: message }, 500);
  }
};
