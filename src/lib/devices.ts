import {
  DEVICES_CUSTOM_ID,
  readJsonFile,
  uploadJsonFile,
} from "./uploadthing";

export type CountryCode = "FR" | "US" | "UK";

export const COUNTRY_CODES: CountryCode[] = ["FR", "US", "UK"];

export type Device = {
  id: string;
  name: string;
  country: CountryCode;
};

/** Seed devices when UploadThing has no devices file yet. */
export const DEFAULT_DEVICES: Device[] = [
  { id: "slim-fr", name: "Slim FR", country: "FR" },
  { id: "slim-us", name: "Slim US", country: "US" },
];

/** @deprecated use listDevices() — kept for static fallbacks in markup */
export const DEVICES = DEFAULT_DEVICES;

export function slugifyDeviceId(name: string, country: CountryCode): string {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const slug = base || "device";
  return `${slug}-${country.toLowerCase()}`;
}

export async function listDevices(): Promise<Device[]> {
  const remote = await readJsonFile<Device[]>(DEVICES_CUSTOM_ID);
  if (!remote || !Array.isArray(remote) || remote.length === 0) {
    return [...DEFAULT_DEVICES];
  }
  // Keep defaults present even if someone wiped them remotely
  const byId = new Map<string, Device>();
  for (const d of DEFAULT_DEVICES) byId.set(d.id, d);
  for (const d of remote) {
    if (d?.id && d?.name && d?.country) byId.set(d.id, d);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getDevice(id: string): Promise<Device | undefined> {
  const devices = await listDevices();
  return devices.find((d) => d.id === id);
}

export async function saveDevices(devices: Device[]): Promise<void> {
  await uploadJsonFile(DEVICES_CUSTOM_ID, "devices.json", devices);
}

export async function registerDevice(input: {
  name: string;
  country: CountryCode;
}): Promise<Device> {
  const name = input.name.trim();
  if (!name) throw new Error("name required");
  if (!COUNTRY_CODES.includes(input.country)) {
    throw new Error("invalid country");
  }

  const devices = await listDevices();
  let id = slugifyDeviceId(name, input.country);
  if (devices.some((d) => d.id === id)) {
    id = `${id}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const device: Device = { id, name, country: input.country };
  devices.push(device);
  await saveDevices(devices);
  return device;
}

export function countriesFrom(devices: Device[]): CountryCode[] {
  return [...new Set(devices.map((d) => d.country))];
}

export function countries(): CountryCode[] {
  return [...COUNTRY_CODES];
}
