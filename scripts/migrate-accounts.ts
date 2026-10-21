/**
 * One-shot: rename slim/corentin accounts + remap schedule videos.
 *
 *   npx tsx scripts/migrate-accounts.ts
 *   npx tsx scripts/migrate-accounts.ts --dry-run
 */

import "dotenv/config";
import type { Device } from "../src/lib/devices";
import { saveDevices } from "../src/lib/devices";
import { listItems, normalizeItem, saveItems } from "../src/lib/schedule";

const dryRun = process.argv.includes("--dry-run");

const NEW_ACCOUNTS: Device[] = [
  {
    id: "ben-walker-us",
    name: "ben-walker",
    country: "US",
    platform: "tiktok",
    warmupStartedAt: null,
  },
  {
    id: "yanndtingcoach-fr",
    name: "yanndtingcoach",
    country: "FR",
    platform: "instagram",
    warmupStartedAt: null,
  },
  {
    id: "antoine-dating-us",
    name: "antoine.dating",
    country: "US",
    platform: "tiktok",
    warmupStartedAt: null,
  },
  {
    id: "corentin-nope-fr",
    name: "corentin.nope",
    country: "FR",
    platform: "instagram",
    warmupStartedAt: null,
  },
  {
    id: "kylliandatingexpert-fr",
    name: "kylliandatingexpert",
    country: "FR",
    platform: "tiktok",
    warmupStartedAt: null,
  },
];

/** Old account id → new account id(s). */
const REMAP: Record<string, string[]> = {
  "slim-iphone-1-fr": ["yanndtingcoach-fr"],
  "slim-iphone-1-us": ["antoine-dating-us"],
  "corentin-fr": ["corentin-nope-fr", "kylliandatingexpert-fr"],
  "ben-walker-us": ["ben-walker-us"],
};

async function main() {
  if (!process.env.UPLOADTHING_TOKEN) {
    console.error("UPLOADTHING_TOKEN missing (.env)");
    process.exit(1);
  }

  console.log(dryRun ? "DRY RUN — no writes\n" : "Migrating accounts + videos…\n");

  console.log("Accounts:");
  for (const a of NEW_ACCOUNTS) {
    console.log(`  ${a.id.padEnd(28)} ${a.name}  ${a.platform}/${a.country}`);
  }

  const items = await listItems();
  const countryById = new Map(NEW_ACCOUNTS.map((a) => [a.id, a.country]));
  let remapped = 0;

  const nextItems = items.map((raw) => {
    const item = normalizeItem(raw);
    const mapped = item.deviceIds.flatMap((id) => REMAP[id] ?? [id]);
    const deviceIds = [...new Set(mapped)];
    const changed =
      deviceIds.length !== item.deviceIds.length ||
      deviceIds.some((id, i) => id !== item.deviceIds[i]);
    if (changed) remapped += 1;
    const primary = deviceIds[0];
    return normalizeItem({
      ...item,
      deviceIds,
      deviceId: primary,
      country: countryById.get(primary) ?? item.country,
    });
  });

  console.log(`\nVideos: ${items.length} total, ${remapped} remapped`);
  for (const item of nextItems) {
    console.log(
      `  ${item.publishAt.slice(0, 16)}  [${item.deviceIds.join(", ")}]  ${item.title}`,
    );
  }

  if (dryRun) {
    console.log("\nDry run done — re-run without --dry-run to apply.");
    return;
  }

  await saveDevices(NEW_ACCOUNTS);
  console.log("\nSaved magnet-devices.json");
  await saveItems(nextItems);
  console.log("Saved magnet-schedule.json");
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
