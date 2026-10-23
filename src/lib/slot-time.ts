/**
 * Local wall-clock helpers for schedule slots.
 * FR → Europe/Paris, US → America/New_York (ET), UK → Europe/London.
 * Slots are always 09:00 and 19:00 in that timezone.
 */

import type { CountryCode } from "./devices";

export const SLOT_HOURS = [9, 19] as const;

export const TZ_BY_COUNTRY: Record<CountryCode, string> = {
  FR: "Europe/Paris",
  US: "America/New_York",
  UK: "Europe/London",
};

export function tzForCountry(country: CountryCode | string): string {
  return TZ_BY_COUNTRY[country as CountryCode] ?? TZ_BY_COUNTRY.FR;
}

export function tzLabel(country: CountryCode | string): string {
  const tz = tzForCountry(country);
  if (country === "US") return `${tz} (ET)`;
  return tz;
}

type WallParts = {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
};

function wallParts(date: Date, timeZone: string): WallParts {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") bag[p.type] = p.value;
  }
  return {
    y: Number(bag.year),
    mo: Number(bag.month),
    d: Number(bag.day),
    h: Number(bag.hour),
    mi: Number(bag.minute),
    s: Number(bag.second),
  };
}

/**
 * Parse `--at "YYYY-MM-DD HH:mm"` as local time in the account's country TZ → UTC Date.
 * Bare datetimes without offset use that TZ (not the machine timezone).
 */
export function parseLocalAt(raw: string, country: CountryCode | string): Date {
  const timeZone = tzForCountry(country);
  const trimmed = raw.trim();
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T"));
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid --at date: ${raw}`);
    return d;
  }

  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(
    trimmed,
  );
  if (!m) {
    throw new Error(
      `Invalid --at date: ${raw} (want "YYYY-MM-DD HH:mm" ${tzLabel(country)})`,
    );
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = Number(m[6] ?? "0");

  let lo = Date.UTC(y, mo - 1, d, h - 14, mi, s);
  let hi = Date.UTC(y, mo - 1, d, h + 14, mi, s);
  for (let i = 0; i < 48; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const parts = wallParts(new Date(mid), timeZone);
    const cmp =
      parts.y !== y
        ? parts.y - y
        : parts.mo !== mo
          ? parts.mo - mo
          : parts.d !== d
            ? parts.d - d
            : parts.h !== h
              ? parts.h - h
              : parts.mi !== mi
                ? parts.mi - mi
                : parts.s - s;
    if (cmp === 0) return new Date(mid);
    if (cmp < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  throw new Error(`Could not resolve ${tzLabel(country)} time: ${raw}`);
}

export function dayKeyInTz(date: Date, country: CountryCode | string): string {
  const p = wallParts(date, tzForCountry(country));
  return `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function hourInTz(date: Date, country: CountryCode | string): number {
  return wallParts(date, tzForCountry(country)).h;
}

export function isAllowedSlot(
  date: Date,
  country: CountryCode | string,
): boolean {
  return (SLOT_HOURS as readonly number[]).includes(hourInTz(date, country));
}

/**
 * Next free slot for an account: 09:00 then 19:00 in the account's TZ.
 * `occupied` = ISO publishAt strings already booked for that account.
 */
export function nextFreeSlot(
  occupiedIso: string[],
  country: CountryCode | string,
  from = new Date(),
): Date {
  const timeZone = tzForCountry(country);
  const taken = new Set(
    occupiedIso.map((iso) => {
      const d = new Date(iso);
      return `${dayKeyInTz(d, country)}T${String(hourInTz(d, country)).padStart(2, "0")}`;
    }),
  );

  const nowP = wallParts(from, timeZone);
  for (let dayOffset = 0; dayOffset < 60; dayOffset++) {
    // Noon UTC on a shifted civil date ≈ stable probe for the calendar day
    const probe = new Date(
      Date.UTC(nowP.y, nowP.mo - 1, nowP.d + dayOffset, 12, 0, 0),
    );
    const day = dayKeyInTz(probe, country);
    const [y, mo, d] = day.split("-").map(Number);
    for (const hour of SLOT_HOURS) {
      const slot = parseLocalAt(
        `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")} ${String(hour).padStart(2, "0")}:00`,
        country,
      );
      if (slot.getTime() <= from.getTime()) continue;
      const key = `${day}T${String(hour).padStart(2, "0")}`;
      if (!taken.has(key)) return slot;
    }
  }
  throw new Error(`No free ${tzLabel(country)} slot in the next 60 days`);
}

/** Format a Date as `YYYY-MM-DD HH:mm` in the account's TZ (for --at). */
export function formatLocalAt(
  date: Date,
  country: CountryCode | string,
): string {
  const p = wallParts(date, tzForCountry(country));
  return `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")} ${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
}
