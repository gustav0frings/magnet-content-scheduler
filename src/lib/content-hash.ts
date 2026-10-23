import { createHash } from "node:crypto";
import type { AccountPlatform, Device } from "./devices";
import type { ScheduleItem } from "./types";

/** SHA-256 hex of raw file bytes — bit-identical fingerprint. */
export function sha256Hex(buf: Buffer | Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * True when this schedule row already carries the same video on the target
 * account, or on any other account of the same platform (TT×TT / IG×IG forbidden).
 * Same bytes on a different platform (TT then IG) is allowed.
 */
export function findContentDuplicate(
  items: ScheduleItem[],
  contentHash: string,
  target: { id: string; platform: AccountPlatform },
  devices: Device[],
): ScheduleItem | undefined {
  const hash = contentHash.trim().toLowerCase();
  if (!hash) return undefined;

  return items.find((item) => {
    const itemHash = item.contentHash?.trim().toLowerCase();
    if (!itemHash || itemHash !== hash) return false;

    if (item.deviceIds.includes(target.id) || item.deviceId === target.id) {
      return true;
    }

    for (const did of item.deviceIds) {
      const d = devices.find((x) => x.id === did);
      if (d?.platform === target.platform) return true;
    }
    return false;
  });
}
