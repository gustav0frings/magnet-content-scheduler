/**
 * List devices available for `npm run send -- --to …`
 * (defaults + anything registered in the web UI — stored on UploadThing)
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
    console.log("No devices.");
    return;
  }

  console.log("Devices (use --to <id> with npm run send):\n");
  for (const d of devices) {
    console.log(`  ${d.id.padEnd(24)}  ${d.name}  (${d.country})`);
  }
  console.log(`\n${devices.length} device(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
