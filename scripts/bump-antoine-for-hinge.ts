/**
 * Push upcoming antoine (+ paired yannudating duals) forward by N slots
 * so hinge-study variants can take tonight + next days.
 *
 *   npx tsx scripts/bump-antoine-for-hinge.ts --dry-run --slots 5
 *   npx tsx scripts/bump-antoine-for-hinge.ts --slots 5
 */

import "dotenv/config";
import { deletePostizPost } from "../src/lib/postiz";
import { listItems, saveItems } from "../src/lib/schedule";
import {
  formatLocalAt,
  nextFreeSlot,
  parseLocalAt,
  tzLabel,
} from "../src/lib/slot-time";

const dryRun = process.argv.includes("--dry-run");
const slotsIdx = process.argv.indexOf("--slots");
const nSlots = slotsIdx >= 0 ? Number(process.argv[slotsIdx + 1]) : 5;
if (!Number.isFinite(nSlots) || nSlots < 1) {
  console.error("--slots must be a positive number");
  process.exit(1);
}

const ANTOINE = "antoine-dating-us";
const YANNU = "yannudating-fr";

/**
 * Probe before tonight's 19:00 ET so nextFreeSlot can return that slot
 * (it skips slots with `slot <= from`). Morning 09:00 already posted.
 */
const FROM_LOCAL = "2026-10-24 12:00";

async function main() {
  const items = await listItems();
  const from = parseLocalAt(FROM_LOCAL, "US");
  const fromMs = from.getTime();

  const antoineUpcoming = items
    .filter((i) => i.deviceIds.includes(ANTOINE) || i.deviceId === ANTOINE)
    .filter((i) => new Date(i.publishAt).getTime() >= fromMs)
    .sort((a, b) => a.publishAt.localeCompare(b.publishAt));

  // Reserve first N free Antoine slots (from tonight) for hinge — leave them empty.
  const reserved: string[] = [];
  // Past / kept Antoine before FROM stay occupied so nextFreeSlot won't reuse them.
  for (const i of items) {
    if (!(i.deviceIds.includes(ANTOINE) || i.deviceId === ANTOINE)) continue;
    if (new Date(i.publishAt).getTime() < fromMs) {
      reserved.push(i.publishAt);
    }
  }
  for (let k = 0; k < nSlots; k++) {
    const slot = nextFreeSlot(reserved, "US", from);
    reserved.push(slot.toISOString());
  }
  const hingeSlots = reserved.slice(-nSlots);
  console.log(
    `Reserving ${nSlots} Antoine slots for hinge (${tzLabel("US")}):\n` +
      hingeSlots
        .map((s) => `  ${formatLocalAt(new Date(s), "US")}`)
        .join("\n"),
  );

  // Remap all Antoine upcoming onto slots AFTER the reserved block.
  const occupied = [...reserved];
  const plan: {
    id: string;
    title: string;
    account: string;
    oldAt: string;
    newAt: string;
  }[] = [];

  for (const item of antoineUpcoming) {
    const slot = nextFreeSlot(occupied, "US", from);
    occupied.push(slot.toISOString());
    plan.push({
      id: item.id,
      title: item.title,
      account: ANTOINE,
      oldAt: item.publishAt,
      newAt: slot.toISOString(),
    });
    item.publishAt = slot.toISOString();
  }

  // Dual IG: same title as an Antoine item that moved, within ±5 min of old Antoine+20.
  const titleToNewAntoine = new Map(
    plan.map((p) => [p.title, p.newAt] as const),
  );
  const yannuMoved: typeof plan = [];
  for (const item of items) {
    if (!(item.deviceIds.includes(YANNU) || item.deviceId === YANNU)) continue;
    const newAntoineAt = titleToNewAntoine.get(item.title);
    if (!newAntoineAt) continue;
    // Only bump if this yannu was near the old Antoine time (dual pattern +20).
    const oldAntoine = plan.find((p) => p.title === item.title);
    if (!oldAntoine) continue;
    const delta =
      new Date(item.publishAt).getTime() -
      new Date(oldAntoine.oldAt).getTime();
    if (delta < 0 || delta > 40 * 60_000) continue; // not a dual of that Antoine post
    const dualAt = new Date(new Date(newAntoineAt).getTime() + 20 * 60_000);
    yannuMoved.push({
      id: item.id,
      title: item.title,
      account: YANNU,
      oldAt: item.publishAt,
      newAt: dualAt.toISOString(),
    });
    item.publishAt = dualAt.toISOString();
  }

  console.log(`\nBump Antoine ${plan.length} · Yannu duals ${yannuMoved.length}:\n`);
  for (const p of [...plan, ...yannuMoved]) {
    console.log(
      `  [${p.account}] ${p.title}\n    ${formatLocalAt(new Date(p.oldAt), "US")} → ${formatLocalAt(new Date(p.newAt), "US")}`,
    );
  }

  if (dryRun) {
    console.log(`\nDry run — no write.`);
    return;
  }

  const bumpedIds = new Set([...plan, ...yannuMoved].map((p) => p.id));
  const toDelete: { id: string; title: string; postizPostId: string }[] = [];
  for (const item of items) {
    if (!bumpedIds.has(item.id) || !item.postizPostId) continue;
    toDelete.push({
      id: item.id,
      title: item.title,
      postizPostId: item.postizPostId,
    });
    item.postizPostId = null;
  }

  console.log(`\nDeleting ${toDelete.length} old Postiz post(s)…`);
  for (const d of toDelete) {
    try {
      await deletePostizPost(d.postizPostId);
      console.log(`  deleted ${d.postizPostId}  ${d.title}`);
    } catch (err) {
      console.error(`  FAILED delete ${d.postizPostId} ${d.title}:`, err);
    }
  }

  await saveItems(items);
  console.log(
    `\nSaved. Next: send hinge into reserved slots, then:\n  npx tsx scripts/sync-postiz.ts --to antoine-dating-us --keep-times\n  npx tsx scripts/sync-postiz.ts --to yannudating-fr --keep-times`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
