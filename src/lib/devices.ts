export type CountryCode = "FR" | "US" | "UK";

export type Device = {
  id: string;
  name: string;
  country: CountryCode;
};

/** Hardcoded phones that receive scheduled content. Edit this list to add devices. */
export const DEVICES: Device[] = [
  { id: "slim-fr", name: "Slim FR", country: "FR" },
  { id: "slim-us", name: "Slim US", country: "US" },
];

export function getDevice(id: string): Device | undefined {
  return DEVICES.find((d) => d.id === id);
}

export function countries(): CountryCode[] {
  return [...new Set(DEVICES.map((d) => d.country))];
}
