/**
 * Push upcoming phone-calendar items for a Postiz-linked account onto Postiz.
 * By default remaps each item onto the next free 09:00 / 19:00 slot (account TZ)
 * and updates the phone schedule publishAt to match.
 * Pass `--keep-times` to upload at the existing `publishAt` (no remap).
 *
 *   npx tsx scripts/sync-postiz.ts --to yanndatingcoach-fr
 *   npx tsx scripts/sync-postiz.ts --to antoine-dating-us --keep-times
 *   npx tsx scripts/sync-postiz.ts --to yanndatingcoach-fr --dry-run
 *
 * Env: UPLOADTHING_TOKEN, POSTIZ_API_KEY
 */

import "dotenv/config";
import { parseArgs } from "node:util";
import { isOnPostiz, listDevices } from "../src/lib/devices";
import {
  deletePostizPost,
  extractPostizPostId,
  formatPostizCaption,
  listPostizIntegrations,
  schedulePostizVideo,
  uploadToPostiz,
} from "../src/lib/postiz";
import { listItems, saveItems } from "../src/lib/schedule";
import {
  formatLocalAt,
  nextFreeSlot,
  tzLabel,
} from "../src/lib/slot-time";

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      to: { type: "string" },
      "dry-run": { type: "boolean" },
      "keep-times": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || !values.to) {
    console.log(
      `Usage: npx tsx scripts/sync-postiz.ts --to <accountId> [--keep-times] [--dry-run]`,
    );
    process.exit(values.help ? 0 : 1);
  }

  const keepTimes = Boolean(values["keep-times"]);

  const devices = await listDevices();
  const device = devices.find((d) => d.id === values.to);
  if (!device) {
    console.error(`Unknown account ${values.to}`);
    process.exit(1);
  }
  if (!isOnPostiz(device)) {
    console.error(`${device.id} has no postizIntegrationId`);
    process.exit(1);
  }
  if (!process.env.POSTIZ_API_KEY?.trim()) {
    console.error("POSTIZ_API_KEY missing");
    process.exit(1);
  }

  const now = Date.now();
  const all = await listItems();
  const upcoming = all
    .filter((i) => i.deviceIds.includes(device.id))
    .filter((i) => new Date(i.publishAt).getTime() >= now - 60_000)
    .sort((a, b) => a.publishAt.localeCompare(b.publishAt));

  console.log(
    keepTimes
      ? `${device.id} → Postiz ${device.postizIntegrationId} · ${upcoming.length} upcoming → keep existing publishAt\n`
      : `${device.id} → Postiz ${device.postizIntegrationId} · ${upcoming.length} upcoming → remap 09:00/19:00 ${tzLabel(device.country)}\n`,
  );

  const occupied: string[] = [];
  const plan: { id: string; title: string; url: string; publishAt: string; oldAt: string }[] =
    [];
  for (const item of upcoming) {
    const publishAt = keepTimes
      ? item.publishAt
      : (() => {
          const slot = nextFreeSlot(occupied, device.country);
          occupied.push(slot.toISOString());
          return slot.toISOString();
        })();
    plan.push({
      id: item.id,
      title: item.title,
      url: item.url,
      publishAt,
      oldAt: item.publishAt,
    });
  }

  for (const p of plan) {
    console.log(
      `→ ${formatLocalAt(new Date(p.publishAt), device.country)} ${tzLabel(device.country)}  ${p.title}`,
    );
    console.log(
      `   (was ${formatLocalAt(new Date(p.oldAt), device.country)})`,
    );
  }

  if (values["dry-run"]) {
    console.log(`\nDry run — ${plan.length} would sync + remap.`);
    return;
  }

  let identifier: string | undefined;
  try {
    const integrations = await listPostizIntegrations();
    identifier = integrations.find((i) => i.id === device.postizIntegrationId)
      ?.identifier;
  } catch {
    /* optional */
  }

  let ok = 0;
  let fail = 0;
  const byId = new Map(plan.map((p) => [p.id, p]));

  for (const p of plan) {
    console.log(
      `\n→ ${formatLocalAt(new Date(p.publishAt), device.country)}  ${p.title}`,
    );
    try {
      const row = all.find((i) => i.id === p.id);
      if (row?.postizPostId) {
        try {
          await deletePostizPost(row.postizPostId);
          console.log(`  deleted old Postiz ${row.postizPostId}`);
        } catch (err) {
          console.warn(`  delete old Postiz failed (continuing):`, err);
        }
        row.postizPostId = null;
      }

      const buf = await download(p.url);
      console.log(`  download ${(buf.byteLength / 1024 / 1024).toFixed(1)} MB…`);
      const media = await uploadToPostiz(buf, `${p.id}.mp4`);
      console.log(`  postiz media ${media.id}`);
      const caption = formatPostizCaption(p.title);
      console.log(`  caption: ${caption.replace(/\n+/g, " / ")}`);
      const posted = await schedulePostizVideo({
        integrationId: device.postizIntegrationId!,
        platform: device.platform,
        publishAt: p.publishAt,
        content: caption,
        media,
        integrationIdentifier: identifier,
      });
      const postizPostId = extractPostizPostId(posted);
      if (postizPostId) {
        console.log(`  postiz ok id=${postizPostId}`);
      } else {
        console.log(`  postiz ok`, posted);
      }

      if (row) {
        row.publishAt = p.publishAt;
        if (postizPostId) row.postizPostId = postizPostId;
      }
      ok++;
    } catch (err) {
      fail++;
      console.error(`  FAILED:`, err);
      byId.delete(p.id);
    }
  }

  // Persist remapped times for successfully synced items
  if (ok > 0) {
    await saveItems(all);
    console.log(`\nPhone schedule updated for ${ok} item(s).`);
  }
  console.log(`Done: ${ok} ok, ${fail} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
