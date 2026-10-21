/**
 * Delete scheduled videos older than N days (default 7):
 * removes UploadThing files + schedule rows.
 *
 *   npm run clear-old
 *   npm run clear-old -- --days 14
 *   npm run clear-old -- --dry-run
 *
 * Env: UPLOADTHING_TOKEN
 */

import "dotenv/config";
import { parseArgs } from "node:util";
import { clearOlderThan, listItems } from "../src/lib/schedule";

async function main() {
  if (!process.env.UPLOADTHING_TOKEN) {
    console.error("UPLOADTHING_TOKEN missing (.env)");
    process.exit(1);
  }

  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      days: { type: "string", default: "7" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(`Usage:
  npm run clear-old
  npm run clear-old -- --days 14
  npm run clear-old -- --dry-run`);
    process.exit(0);
  }

  const days = Number(values.days);
  if (!Number.isFinite(days) || days < 1) {
    console.error("--days must be a positive number");
    process.exit(1);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  if (values["dry-run"]) {
    const items = await listItems();
    const stale = items.filter(
      (i) => new Date(i.publishAt).getTime() < cutoff.getTime(),
    );
    console.log(
      `Dry run: would remove ${stale.length} item(s) older than ${days}d (before ${cutoff.toISOString()}):\n`,
    );
    for (const i of stale) {
      console.log(`  ${i.publishAt}  ${i.deviceId}  ${i.title}  ${i.fileKey}`);
    }
    return;
  }

  console.log(
    `Clearing videos with publishAt older than ${days}d (before ${cutoff.toISOString()})…`,
  );
  const { removed, kept } = await clearOlderThan(days);
  console.log(`Removed ${removed.length} item(s), ${kept} remaining.`);
  for (const i of removed) {
    console.log(`  - ${i.publishAt}  ${i.deviceId}  ${i.title}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
