/**
 * Rename yanndtingcoach → yanndatingcoach (missing "a" in dating) + remap schedule.
 *
 *   npx tsx scripts/rename-yanndatingcoach.ts
 *   npx tsx scripts/rename-yanndatingcoach.ts --dry-run
 */

import "dotenv/config";
import { listDevices, saveDevices } from "../src/lib/devices";
import { listItems, normalizeItem, saveItems } from "../src/lib/schedule";

const dryRun = process.argv.includes("--dry-run");

const FROM_ID = "yanndtingcoach-fr";
const TO_ID = "yanndatingcoach-fr";
const TO_NAME = "yanndatingcoach";

async function main() {
  if (!process.env.UPLOADTHING_TOKEN) {
    console.error("UPLOADTHING_TOKEN missing (.env)");
    process.exit(1);
  }

  console.log(dryRun ? "DRY RUN — no writes\n" : `Rename ${FROM_ID} → ${TO_ID}\n`);

  const devices = await listDevices();
  const from = devices.find((d) => d.id === FROM_ID);
  if (!from) {
    console.error(`Account ${FROM_ID} not found`);
    process.exit(1);
  }
  if (devices.some((d) => d.id === TO_ID)) {
    console.error(`Target ${TO_ID} already exists`);
    process.exit(1);
  }

  const nextDevices = devices.map((d) =>
    d.id === FROM_ID ? { ...d, id: TO_ID, name: TO_NAME } : d,
  );

  const items = await listItems();
  let remapped = 0;
  const nextItems = items.map((raw) => {
    const item = normalizeItem(raw);
    if (!item.deviceIds.includes(FROM_ID) && item.deviceId !== FROM_ID) {
      return item;
    }
    remapped += 1;
    const deviceIds = [
      ...new Set(item.deviceIds.map((id) => (id === FROM_ID ? TO_ID : id))),
    ];
    return normalizeItem({
      ...item,
      deviceIds,
      deviceId: item.deviceId === FROM_ID ? TO_ID : item.deviceId,
    });
  });

  console.log(`Account: ${from.name} (${FROM_ID}) → ${TO_NAME} (${TO_ID})`);
  console.log(`Videos remapped: ${remapped} / ${items.length}`);
  for (const item of nextItems.filter((i) => i.deviceIds.includes(TO_ID))) {
    console.log(
      `  ${item.publishAt.slice(0, 16)}  [${item.deviceIds.join(", ")}]  ${item.title}`,
    );
  }

  if (dryRun) {
    console.log("\nDry run done — re-run without --dry-run to apply.");
    return;
  }

  await saveDevices(nextDevices);
  console.log("\nSaved magnet-devices.json");
  await saveItems(nextItems);
  console.log("Saved magnet-schedule.json");
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
