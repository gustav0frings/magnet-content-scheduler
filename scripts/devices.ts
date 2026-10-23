/**
 * List accounts available for `npm run send -- --to …`
 * (stored on UploadThing as magnet-devices.json)
 *
 *   npm run devices
 *
 * Env: UPLOADTHING_TOKEN
 */

import "dotenv/config";
import { listDevices } from "../src/lib/devices";

async function main() {
  if (!process.env.UPLOADTHING_TOKEN) {
    console.error("UPLOADTHING_TOKEN missing (.env)");
    process.exit(1);
  }

  const devices = await listDevices();
  if (devices.length === 0) {
    console.log("No accounts.");
    return;
  }

  console.log("Accounts (use --to <id> with npm run send):\n");
  for (const d of devices) {
    const plat = d.platform === "instagram" ? "IG" : "TT";
    const warm = d.warmupStartedAt ? ` warmup=${d.warmupStartedAt}` : "";
    const postiz = d.postizIntegrationId ? " postiz" : "";
    console.log(
      `  ${d.id.padEnd(24)}  ${d.name}  (${d.country}, ${plat})${warm}${postiz}`,
    );
  }
  console.log(`\n${devices.length} account(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
