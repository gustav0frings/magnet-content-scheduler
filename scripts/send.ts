/**
 * Upload a video to UploadThing, then append it to the schedule JSON
 * (also on UploadThing — no Vercel storage, no redeploy).
 *
 * Usage:
 *   npm run send -- --to slim-fr --at "2026-10-21 09:00" --title "hook" ./video.mp4
 *
 * Env: UPLOADTHING_TOKEN
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { UTApi, UTFile } from "uploadthing/server";
import { getDevice } from "../src/lib/devices";
import { addItem } from "../src/lib/schedule";

function usage(): never {
  console.error(`Usage:
  npm run send -- --to <deviceId> --at "<YYYY-MM-DD HH:mm>" [--title "..."] <file.mp4>

Devices: see src/lib/devices.ts
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

  if (values.help) usage();
  const filePath = positionals[0];
  if (!values.to || !values.at || !filePath) usage();

  const device = getDevice(values.to);
  if (!device) {
    console.error(`Unknown device "${values.to}". Edit src/lib/devices.ts.`);
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
    deviceId: device.id,
    country: device.country,
    title,
    url,
    fileKey,
    publishAt: publishAt.toISOString(),
  });
  console.log("Scheduled:", item);
  console.log(`Device: ${device.name} (${device.country})`);
  console.log(`Inbox: /api/inbox/${device.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
