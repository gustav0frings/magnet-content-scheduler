/** Europe/Paris wall-clock helpers for schedule slots. */

export const PARIS_TZ = "Europe/Paris";

/** Preferred publish hours in Paris (never schedule outside these). */
export const PARIS_SLOT_HOURS = [9, 19] as const;

/**
 * Parse `--at "YYYY-MM-DD HH:mm"` (or ISO) as Europe/Paris local time → UTC Date.
 * Bare datetimes without offset are treated as Paris, not the machine timezone.
 */
export function parseParisLocal(raw: string): Date {
  const trimmed = raw.trim();
  // Explicit offset / Z → trust Date
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
      `Invalid --at date: ${raw} (want "YYYY-MM-DD HH:mm" Paris time)`,
    );
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = Number(m[6] ?? "0");

  // Binary-search UTC instant whose Paris wall time matches.
  let lo = Date.UTC(y, mo - 1, d, h - 14, mi, s); // Paris never ahead >14h of UTC
  let hi = Date.UTC(y, mo - 1, d, h + 14, mi, s);
  for (let i = 0; i < 48; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const parts = parisParts(new Date(mid));
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
  throw new Error(`Could not resolve Paris time: ${raw}`);
}

function parisParts(date: Date): {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
} {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: PARIS_TZ,
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

/** Paris calendar day key `YYYY-MM-DD` for an instant. */
export function parisDayKey(date: Date): string {
  const p = parisParts(date);
  return `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Paris hour (0–23) for an instant. */
export function parisHour(date: Date): number {
  return parisParts(date).h;
}

/** True if publishAt falls on an allowed slot hour (9 or 19 Paris). */
export function isAllowedParisSlot(date: Date): boolean {
  const h = parisHour(date);
  return (PARIS_SLOT_HOURS as readonly number[]).includes(h);
}

/**
 * Next free slot for an account: 09:00 then 19:00 Paris, day by day.
 * `occupied` = ISO publishAt strings already booked for that account.
 */
export function nextFreeParisSlot(
  occupiedIso: string[],
  from = new Date(),
): Date {
  const taken = new Set(
    occupiedIso.map((iso) => {
      const d = new Date(iso);
      return `${parisDayKey(d)}T${String(parisHour(d)).padStart(2, "0")}`;
    }),
  );

  // Start from today (Paris), or tomorrow if both slots today are past.
  const nowP = parisParts(from);
  for (let dayOffset = 0; dayOffset < 60; dayOffset++) {
    const probe = new Date(
      Date.UTC(nowP.y, nowP.mo - 1, nowP.d + dayOffset, 12, 0, 0),
    );
    const day = parisDayKey(probe);
    const [y, mo, d] = day.split("-").map(Number);
    for (const hour of PARIS_SLOT_HOURS) {
      const slot = parseParisLocal(
        `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")} ${String(hour).padStart(2, "0")}:00`,
      );
      if (slot.getTime() <= from.getTime()) continue;
      const key = `${day}T${String(hour).padStart(2, "0")}`;
      if (!taken.has(key)) return slot;
    }
  }
  throw new Error("No free Paris slot in the next 60 days");
}

/** Format a Date as `YYYY-MM-DD HH:mm` in Paris (for --at). */
export function formatParisLocal(date: Date): string {
  const p = parisParts(date);
  return `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")} ${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
}
