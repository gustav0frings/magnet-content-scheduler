/**
 * Suggest the next free 09:00 / 19:00 slot for an account (local TZ by country).
 *
 *   npx tsx scripts/next-slot.ts --to yanndatingcoach-fr   # Europe/Paris
 *   npx tsx scripts/next-slot.ts --to antoine-dating-us    # America/New_York (ET)
 *
 * Env: UPLOADTHING_TOKEN
 */

import "dotenv/config";
import { parseArgs } from "node:util";
import { listDevices } from "../src/lib/devices";
import {
  formatLocalAt,
  nextFreeSlot,
  tzLabel,
} from "../src/lib/slot-time";
import { listItems } from "../src/lib/schedule";

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      to: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  const devices = await listDevices();
  if (values.help || !values.to) {
    console.log(
      `Usage: npx tsx scripts/next-slot.ts --to <accountId>\nAccounts: ${devices.map((d) => d.id).join(", ")}`,
    );
    process.exit(values.help ? 0 : 1);
  }

  const device = devices.find((d) => d.id === values.to);
  if (!device) {
    console.error(`Unknown account "${values.to}"`);
    process.exit(1);
  }

  const items = await listItems();
  const occupied = items
    .filter((i) => i.deviceIds.includes(device.id))
    .map((i) => i.publishAt);
  const slot = nextFreeSlot(occupied, device.country);
  const at = formatLocalAt(slot, device.country);
  const tz = tzLabel(device.country);
  console.log(`${device.id}  next free: ${at} ${tz}`);
  console.log(
    `npm run send -- --to ${device.id} --at "${at}" --title "…" ./video.mp4`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
