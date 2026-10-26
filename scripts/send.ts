/**
 * Upload a video to UploadThing, then append it to the schedule JSON
 * (also on UploadThing — no Vercel storage, no redeploy).
 * If the target account has `postizIntegrationId`, also schedule on Postiz.
 *
 * Refuses bit-identical duplicates (SHA-256) on the same account or another
 * account of the same platform — covers phone calendar + Postiz dual-schedule.
 *
 * Usage:
 *   npm run send -- --to yanndatingcoach-fr --at "2026-10-21 09:00" --title "hook" ./video.mp4
 *
 * `--at` = local time of the account country:
 *   FR → Europe/Paris, US → America/New_York (ET), UK → Europe/London.
 * Allowed hours: **09:00** or **19:00**. Never two at the same slot on the same account.
 *
 * Env: UPLOADTHING_TOKEN, POSTIZ_API_KEY (when target is on Postiz)
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { UTApi, UTFile } from "uploadthing/server";
import {
  findContentDuplicate,
  sha256Hex,
} from "../src/lib/content-hash";
import { isOnPostiz, listDevices } from "../src/lib/devices";
import {
  dayKeyInTz,
  formatLocalAt,
  hourInTz,
  isAllowedSlot,
  parseLocalAt,
  tzLabel,
} from "../src/lib/slot-time";
import {
  extractPostizPostId,
  formatPostizCaption,
  listPostizIntegrations,
  schedulePostizVideo,
  uploadToPostiz,
} from "../src/lib/postiz";
import {
  addItem,
  clearOlderThan,
  listItems,
  setPostizPostId,
} from "../src/lib/schedule";

const AUTO_CLEAR_DAYS = 7;

function usage(accountIds?: string[]): never {
  console.error(`Usage:
  npm run send -- --to <accountId> --at "<YYYY-MM-DD HH:mm>" [--title "..."] <file.mp4>

--at is local to the account country (FR=Paris, US=ET/New_York, UK=London).
Slots: 09:00 or 19:00 only. One account per send.
Never two videos at the same slot on the same account.
Bit-identical mp4 (SHA-256) refused on the same account / same platform.
Accounts on Postiz (postizIntegrationId) are also scheduled via Postiz.
Known accounts: ${accountIds?.join(", ") || "listDevices() / UploadThing + defaults"}`);
  process.exit(1);
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      to: { type: "string" },
      at: { type: "string" },
      title: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  const devices = await listDevices();
  if (values.help) usage(devices.map((d) => d.id));
  const filePath = positionals[0];
  if (!values.to || !values.at || !filePath) usage(devices.map((d) => d.id));

  const toIds = [
    ...new Set(
      values.to
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  if (toIds.length !== 1) {
    console.error(
      "Refuse: --to must be exactly one account (never 2× same platform / same video).",
    );
    process.exit(1);
  }

  const targets = toIds.map((id) => {
    const device = devices.find((d) => d.id === id);
    if (!device) {
      console.error(
        `Unknown account "${id}". Known: ${devices.map((d) => d.id).join(", ")}.`,
      );
      process.exit(1);
    }
    return device;
  });

  const warming = targets.filter((d) => d.warmupStartedAt);
  if (warming.length > 0) {
    console.error(
      `Refuse: account(s) still in warmup — do not push until warmup is cleared:\n${warming
        .map((d) => `  - ${d.id} (${d.name}) warmupStartedAt=${d.warmupStartedAt}`)
        .join("\n")}\nPick a ready account (no warmup=… in \`npm run devices\`).`,
    );
    process.exit(1);
  }

  const token = process.env.UPLOADTHING_TOKEN;
  if (!token) {
    console.error("UPLOADTHING_TOKEN missing (.env)");
    process.exit(1);
  }

  const abs = path.resolve(filePath);
  const buf = await readFile(abs);
  const contentHash = sha256Hex(buf);
  const name = path.basename(abs);
  const title = values.title?.trim() || name.replace(/\.[^.]+$/, "");
  const primary = targets[0];
  const country = primary.country;
  const publishAt = parseLocalAt(values.at!, country);
  const tz = tzLabel(country);

  if (!isAllowedSlot(publishAt, country)) {
    console.error(
      `Refuse: --at must be 09:00 or 19:00 ${tz} (got ${formatLocalAt(publishAt, country)}).`,
    );
    process.exit(1);
  }

  const existing = await listItems();

  const dup = findContentDuplicate(existing, contentHash, primary, devices);
  if (dup) {
    console.error(
      `Refuse: bit-identical video already scheduled (sha256 ${contentHash.slice(0, 12)}…):\n  ${dup.title} [${dup.id}] → ${dup.deviceIds.join(",")} @ ${dup.publishAt}\nSame bytes on the same account or same platform (TT×TT / IG×IG) are blocked — phone calendar and Postiz.\nTT + IG with the same file is OK (different platform). Re-encode / change the file if this is intentional.`,
    );
    process.exit(1);
  }

  const day = dayKeyInTz(publishAt, country);
  const hour = hourInTz(publishAt, country);
  const clash = existing.find((item) => {
    if (!item.deviceIds.includes(primary.id)) return false;
    const at = new Date(item.publishAt);
    return dayKeyInTz(at, country) === day && hourInTz(at, country) === hour;
  });
  if (clash) {
    console.error(
      `Refuse: ${primary.id} already has a video at ${formatLocalAt(publishAt, country)} ${tz}:\n  ${clash.title} [${clash.id}]\nPick the other slot (09:00 / 19:00) or another day (\`npm run next-slot -- --to ${primary.id}\`).`,
    );
    process.exit(1);
  }

  console.log(
    `Uploading ${name} (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB) → UploadThing…`,
  );
  console.log(`  sha256: ${contentHash.slice(0, 16)}…`);
  console.log(`  slot: ${formatLocalAt(publishAt, country)} ${tz}`);

  const utapi = new UTApi({ token });
  const file = new UTFile([buf], name, { type: "video/mp4" });
  const result = await utapi.uploadFiles(file);

  if (result.error || !result.data) {
    console.error("Upload failed:", result.error);
    process.exit(1);
  }

  const url = result.data.ufsUrl ?? result.data.url;
  const fileKey = result.data.key;
  console.log(`  url: ${url}`);
  console.log(`  key: ${fileKey}`);

  console.log("Updating schedule on UploadThing…");
  const item = await addItem({
    deviceIds: targets.map((d) => d.id),
    country: primary.country,
    title,
    url,
    fileKey,
    contentHash,
    publishAt: publishAt.toISOString(),
  });
  console.log("Scheduled (phone calendar):", item);
  for (const d of targets) {
    console.log(`  → ${d.name} (${d.platform}/${d.country})  inbox /api/inbox/${d.id}`);
  }

  for (const d of targets) {
    if (!isOnPostiz(d)) {
      console.log(`  Postiz: skip ${d.id} (no postizIntegrationId)`);
      continue;
    }
    if (!process.env.POSTIZ_API_KEY?.trim()) {
      console.error(
        `  Postiz: ${d.id} is linked but POSTIZ_API_KEY missing — phone schedule ok, Postiz NOT scheduled.`,
      );
      continue;
    }
    try {
      console.log(`  Postiz: uploading for ${d.id} (${d.postizIntegrationId})…`);
      const media = await uploadToPostiz(buf, name);
      let identifier: string | undefined;
      try {
        const integrations = await listPostizIntegrations();
        identifier = integrations.find((i) => i.id === d.postizIntegrationId)
          ?.identifier;
      } catch {
        /* fall back to platform map */
      }
      const posted = await schedulePostizVideo({
        integrationId: d.postizIntegrationId!,
        platform: d.platform,
        publishAt: publishAt.toISOString(),
        content: formatPostizCaption(title),
        media,
        integrationIdentifier: identifier,
      });
      const postizPostId = extractPostizPostId(posted);
      if (postizPostId) {
        await setPostizPostId(item.id, postizPostId);
        console.log(`  Postiz: scheduled id=${postizPostId}`);
      } else {
        console.log(`  Postiz: scheduled`, posted);
      }
    } catch (err) {
      console.error(
        `  Postiz: FAILED for ${d.id} (phone schedule still ok):`,
        err,
      );
    }
  }

  console.log(`Clearing videos older than ${AUTO_CLEAR_DAYS}d…`);
  try {
    const { removed, kept } = await clearOlderThan(AUTO_CLEAR_DAYS);
    if (removed.length === 0) {
      console.log(`  nothing to purge (${kept} kept)`);
    } else {
      console.log(`  removed ${removed.length}, ${kept} remaining`);
      for (const r of removed) {
        console.log(
          `  - ${r.publishAt}  [${r.deviceIds.join(",")}]  ${r.title}`,
        );
      }
    }
  } catch (err) {
    console.error("  clear-old failed (send still ok):", err);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
