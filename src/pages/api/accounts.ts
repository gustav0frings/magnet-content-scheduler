import type { APIRoute } from "astro";
import {
  addAccount,
  listAccounts,
  removeAccount,
  updateAccount,
} from "../../lib/accounts";
import { json } from "../../lib/auth";
import { getDevice } from "../../lib/devices";

export const prerender = false;

async function resolveDeviceId(
  raw: string | null | undefined,
): Promise<string | null | { error: string }> {
  if (raw == null || raw === "") return null;
  const device = await getDevice(raw);
  if (!device) return { error: "Unknown deviceId" };
  return device.id;
}

export const GET: APIRoute = async () => {
  const accounts = await listAccounts();
  return json({ accounts });
};

export const POST: APIRoute = async ({ request }) => {
  let body: {
    name?: string;
    deviceId?: string | null;
    warmupStartedAt?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const deviceId = await resolveDeviceId(body.deviceId);
  if (deviceId && typeof deviceId === "object") {
    return json({ error: deviceId.error }, 400);
  }

  try {
    const account = await addAccount({
      name: body.name ?? "",
      deviceId,
      warmupStartedAt: body.warmupStartedAt,
    });
    return json({ account }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "create failed";
    return json({ error: message }, 400);
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  let body: {
    id?: string;
    name?: string;
    deviceId?: string | null;
    warmupStartedAt?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body.id) return json({ error: "id required" }, 400);

  const patch: {
    name?: string;
    deviceId?: string | null;
    warmupStartedAt?: string | null;
  } = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.warmupStartedAt !== undefined) {
    patch.warmupStartedAt = body.warmupStartedAt;
  }
  if (body.deviceId !== undefined) {
    const deviceId = await resolveDeviceId(body.deviceId);
    if (deviceId && typeof deviceId === "object") {
      return json({ error: deviceId.error }, 400);
    }
    patch.deviceId = deviceId;
  }

  try {
    const account = await updateAccount(body.id, patch);
    if (!account) return json({ error: "Not found" }, 404);
    return json({ account });
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
  const ok = await removeAccount(body.id);
  if (!ok) return json({ error: "Not found" }, 404);
  return json({ ok: true });
};
