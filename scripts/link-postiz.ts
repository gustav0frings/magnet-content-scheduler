/**
 * Link a magnet account to a Postiz integration id.
 *
 *   npx tsx scripts/link-postiz.ts --to yanndatingcoach-fr --integration cmvkhe9ca1h17lh0yaa95t0jx
 *   npx tsx scripts/link-postiz.ts --to yanndatingcoach-fr --clear
 *
 * Env: UPLOADTHING_TOKEN
 */

import "dotenv/config";
import { parseArgs } from "node:util";
import { listDevices, updateDevice } from "../src/lib/devices";

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      to: { type: "string" },
      integration: { type: "string" },
      clear: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || !values.to || (!values.integration && !values.clear)) {
    console.log(`Usage:
  npx tsx scripts/link-postiz.ts --to <accountId> --integration <postizIntegrationId>
  npx tsx scripts/link-postiz.ts --to <accountId> --clear`);
    process.exit(values.help ? 0 : 1);
  }

  const devices = await listDevices();
  if (!devices.some((d) => d.id === values.to)) {
    console.error(`Unknown account "${values.to}"`);
    process.exit(1);
  }

  const postizIntegrationId = values.clear ? null : values.integration!.trim();
  const updated = await updateDevice(values.to!, { postizIntegrationId });
  console.log(
    updated
      ? `OK ${updated.id} postizIntegrationId=${updated.postizIntegrationId ?? "(none)"}`
      : "failed",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
