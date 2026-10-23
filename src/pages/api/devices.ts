import type { APIRoute } from "astro";
import { json } from "../../lib/auth";
import {
  COUNTRY_CODES,
  type CountryCode,
  listDevices,
  registerDevice,
  removeDevice,
  updateDevice,
} from "../../lib/devices";

export const prerender = false;

export const GET: APIRoute = async () => {
  const devices = await listDevices();
  return json({ devices });
};

export const POST: APIRoute = async ({ request }) => {
  let body: {
    name?: string;
    country?: string;
    platform?: string;
    warmupStartedAt?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const name = body.name?.trim();
  const country = body.country?.toUpperCase() as CountryCode | undefined;
  if (!name) return json({ error: "name required" }, 400);
  if (!country || !COUNTRY_CODES.includes(country)) {
    return json(
      { error: `country must be one of ${COUNTRY_CODES.join(", ")}` },
      400,
    );
  }

  try {
    const device = await registerDevice({
      name,
      country,
      platform: body.platform ?? "",
      warmupStartedAt: body.warmupStartedAt,
    });
    return json({ device }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "register failed";
    return json({ error: message }, 400);
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  let body: {
    id?: string;
    name?: string;
    country?: string;
    platform?: string;
    warmupStartedAt?: string | null;
    postizIntegrationId?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body.id) return json({ error: "id required" }, 400);

  const patch: {
    name?: string;
    country?: CountryCode;
    platform?: string;
    warmupStartedAt?: string | null;
    postizIntegrationId?: string | null;
  } = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.platform !== undefined) patch.platform = body.platform;
  if (body.warmupStartedAt !== undefined) {
    patch.warmupStartedAt = body.warmupStartedAt;
  }
  if (body.postizIntegrationId !== undefined) {
    patch.postizIntegrationId = body.postizIntegrationId;
  }
  if (body.country !== undefined) {
    const country = body.country.toUpperCase() as CountryCode;
    if (!COUNTRY_CODES.includes(country)) {
      return json(
        { error: `country must be one of ${COUNTRY_CODES.join(", ")}` },
        400,
      );
    }
    patch.country = country;
  }

  try {
    const device = await updateDevice(body.id, patch);
    if (!device) return json({ error: "Not found" }, 404);
    return json({ device });
  } catch (err) {
    const message = err instanceof Error ? err.message : "update failed";
    return json({ error: message }, 400);
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body.id) return json({ error: "id required" }, 400);
  const ok = await removeDevice(body.id);
  if (!ok) return json({ error: "Not found" }, 404);
  return json({ ok: true });
};
