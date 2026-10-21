import { DEVICES_FILE, readJsonFile, uploadJsonFile } from "./uploadthing";

export type CountryCode = "FR" | "US" | "UK";
export type AccountPlatform = "instagram" | "tiktok";

export const COUNTRY_CODES: CountryCode[] = ["FR", "US", "UK"];
export const ACCOUNT_PLATFORMS: AccountPlatform[] = ["instagram", "tiktok"];

export const COUNTRY_FLAGS: Record<CountryCode, string> = {
  FR: "🇫🇷",
  US: "🇺🇸",
  UK: "🇬🇧",
};

export function countryFlag(country: string): string {
  return COUNTRY_FLAGS[country as CountryCode] ?? country;
}

/** One posting account (was called "device"). Schedule items still use `deviceId`. */
export type Device = {
  id: string;
  name: string;
  country: CountryCode;
  platform: AccountPlatform;
  /** Warm-up start `YYYY-MM-DD`, or null when not in warm-up. */
  warmupStartedAt: string | null;
};

/** Seed accounts when UploadThing has no devices file yet. */
export const DEFAULT_DEVICES: Device[] = [];

/** @deprecated use listDevices() — kept for static fallbacks in markup */
export const DEVICES = DEFAULT_DEVICES;

function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDayKey(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function normalizePlatform(
  raw: string | null | undefined,
): AccountPlatform {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "instagram" || value === "tiktok") return value;
  throw new Error("platform must be instagram or tiktok");
}

function coercePlatform(raw: unknown): AccountPlatform {
  try {
    return normalizePlatform(typeof raw === "string" ? raw : undefined);
  } catch {
    return "tiktok";
  }
}

function normalizeWarmupDate(raw: string | null | undefined): string | null {
  if (raw == null || raw === "") return null;
  if (!parseDayKey(raw)) throw new Error("invalid warmupStartedAt");
  return raw.trim().slice(0, 10);
}

/** Calendar days in warm-up (start day = 1). Null if not warming up. */
export function warmupDayCount(
  warmupStartedAt: string | null,
  now = new Date(),
): number | null {
  if (!warmupStartedAt) return null;
  const start = parseDayKey(warmupStartedAt);
  if (!start) return null;
  const today = parseDayKey(todayKey(now));
  if (!today) return null;
  const ms = today.getTime() - start.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / 86_400_000) + 1;
}

/** Lowercase + spaces → dashes (and strip other noise). Used for display name + id. */
export function normalizeDeviceName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function slugifyDeviceId(name: string, country: CountryCode): string {
  const base = normalizeDeviceName(name) || "account";
  const suffix = country.toLowerCase();
  if (base === suffix || base.endsWith(`-${suffix}`)) return base;
  return `${base}-${suffix}`;
}

function normalizeDevice(raw: Device): Device | null {
  if (!raw?.id || !raw?.name || !raw?.country) return null;
  if (!COUNTRY_CODES.includes(raw.country)) return null;
  return {
    id: raw.id,
    name: raw.name,
    country: raw.country,
    platform: coercePlatform(raw.platform),
    warmupStartedAt: raw.warmupStartedAt ?? null,
  };
}

export async function listDevices(): Promise<Device[]> {
  const remote = await readJsonFile<Device[]>(DEVICES_FILE);
  if (!remote || !Array.isArray(remote) || remote.length === 0) {
    return [...DEFAULT_DEVICES];
  }
  const byId = new Map<string, Device>();
  for (const d of DEFAULT_DEVICES) byId.set(d.id, d);
  for (const d of remote) {
    const next = normalizeDevice(d);
    if (next) byId.set(next.id, next);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getDevice(id: string): Promise<Device | undefined> {
  const devices = await listDevices();
  return devices.find((d) => d.id === id);
}

export async function saveDevices(devices: Device[]): Promise<void> {
  await uploadJsonFile(DEVICES_FILE, devices);
}

export async function registerDevice(input: {
  name: string;
  country: CountryCode;
  platform: string;
  warmupStartedAt?: string | null;
}): Promise<Device> {
  const displayName = input.name.trim().replace(/\s+/g, " ").slice(0, 60);
  const slug = normalizeDeviceName(displayName);
  if (!slug) throw new Error("name required");
  if (!COUNTRY_CODES.includes(input.country)) {
    throw new Error("invalid country");
  }
  const platform = normalizePlatform(input.platform);

  const devices = await listDevices();
  let id = slugifyDeviceId(slug, input.country);
  if (devices.some((d) => d.id === id)) {
    id = `${id}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const device: Device = {
    id,
    name: displayName,
    country: input.country,
    platform,
    warmupStartedAt: normalizeWarmupDate(input.warmupStartedAt),
  };
  devices.push(device);
  await saveDevices(devices);
  return device;
}

export async function updateDevice(
  id: string,
  patch: {
    name?: string;
    country?: CountryCode;
    platform?: string;
    warmupStartedAt?: string | null;
  },
): Promise<Device | null> {
  const devices = await listDevices();
  const device = devices.find((d) => d.id === id);
  if (!device) return null;

  if (patch.name !== undefined) {
    const name = patch.name.trim().replace(/\s+/g, " ").slice(0, 60);
    if (!name) throw new Error("name required");
    device.name = name;
  }
  if (patch.country !== undefined) {
    if (!COUNTRY_CODES.includes(patch.country)) {
      throw new Error("invalid country");
    }
    device.country = patch.country;
  }
  if (patch.platform !== undefined) {
    device.platform = normalizePlatform(patch.platform);
  }
  if (patch.warmupStartedAt !== undefined) {
    device.warmupStartedAt = normalizeWarmupDate(patch.warmupStartedAt);
  }

  await saveDevices(devices);
  return device;
}

export async function removeDevice(id: string): Promise<boolean> {
  const devices = await listDevices();
  const next = devices.filter((d) => d.id !== id);
  if (next.length === devices.length) return false;
  await saveDevices(next);
  return true;
}

export function countriesFrom(devices: Device[]): CountryCode[] {
  return [...new Set(devices.map((d) => d.country))];
}

export function countries(): CountryCode[] {
  return [...COUNTRY_CODES];
}
