/**
 * Upload a video to UploadThing, then append it to the schedule JSON
 * (also on UploadThing — no Vercel storage, no redeploy).
 *
 * Usage:
 *   npm run send -- --to yanndtingcoach-fr --at "2026-10-21 09:00" --title "hook" ./video.mp4
 *   npm run send -- --to yanndtingcoach-fr,kylliandatingexpert-fr --at "..." ./video.mp4
 *
 * Env: UPLOADTHING_TOKEN
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { UTApi, UTFile } from "uploadthing/server";
import { listDevices } from "../src/lib/devices";
import { addItem, clearOlderThan } from "../src/lib/schedule";

const AUTO_CLEAR_DAYS = 7;

function usage(accountIds?: string[]): never {
  console.error(`Usage:
  npm run send -- --to <accountId[,accountId…]> --at "<YYYY-MM-DD HH:mm>" [--title "..."] <file.mp4>

Accounts (--to ids, comma-separated for multi-post): ${accountIds?.join(", ") || "listDevices() / UploadThing + defaults"}
Schedule + video both live on UploadThing (free). No Vercel Blob, no redeploy.`);
  process.exit(1);
}

function parseWhen(raw: string): Date {
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid --at date: ${raw}`);
  }
  return d;
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

  // Never schedule onto accounts still warming up (warmupStartedAt set).
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
  const name = path.basename(abs);
  const title = values.title?.trim() || name.replace(/\.[^.]+$/, "");
  const publishAt = parseWhen(values.at);
  const primary = targets[0];

  console.log(
    `Uploading ${name} (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB) → UploadThing…`,
  );

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
    publishAt: publishAt.toISOString(),
  });
  console.log("Scheduled:", item);
  for (const d of targets) {
    console.log(`  → ${d.name} (${d.platform}/${d.country})  inbox /api/inbox/${d.id}`);
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
