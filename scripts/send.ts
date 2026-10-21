/**
 * Upload a rendered video to UploadThing (same pattern as Astro's UTApi scripts),
 * then register it on the content scheduler.
 *
 * Usage:
 *   npm run send -- --to slim-fr --at "2026-10-21 09:00" --title "hook" ../path/to/video.mp4
 *
 * Env: UPLOADTHING_TOKEN, INBOX_SECRET
 * Optional: SCHEDULER_URL (remote register). Without it, writes data/schedule.json locally.
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

Devices: see src/lib/devices.ts`);
  process.exit(1);
}

function parseWhen(raw: string): Date {
  // Allow "2026-10-21 09:00" local wall time → ISO
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

  console.log(`Uploading ${name} (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB) → UploadThing…`);

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

  const payload = {
    deviceId: device.id,
    country: device.country,
    title,
    url,
    fileKey,
    publishAt: publishAt.toISOString(),
  };

  const schedulerUrl = process.env.SCHEDULER_URL?.replace(/\/$/, "");
  const secret = process.env.INBOX_SECRET;

  if (schedulerUrl) {
    if (!secret) {
      console.error("INBOX_SECRET required when SCHEDULER_URL is set");
      process.exit(1);
    }
    console.log(`Registering on ${schedulerUrl}…`);
    const res = await fetch(`${schedulerUrl}/api/items`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-inbox-secret": secret,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) {
      console.error("Register failed:", body);
      process.exit(1);
    }
    console.log("Scheduled:", body.item);
  } else {
    console.log("No SCHEDULER_URL — writing local data/schedule.json");
    const item = await addItem(payload);
    console.log("Scheduled:", item);
  }

  console.log(`\nDevice page filter: ? → pick "${device.name}" on the webapp`);
  console.log(`Inbox: /api/inbox/${device.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
