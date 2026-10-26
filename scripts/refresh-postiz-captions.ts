/**
 * Wipe QUEUE posts on every Postiz-linked Magnet account, then re-sync from
 * the phone schedule with `formatPostizCaption` (title + #tinder).
 *
 *   npx tsx scripts/refresh-postiz-captions.ts
 *   npx tsx scripts/refresh-postiz-captions.ts --dry-run
 *   npx tsx scripts/refresh-postiz-captions.ts --to yanndatingcoach-fr
 *
 * Env: UPLOADTHING_TOKEN, POSTIZ_API_KEY
 */

import "dotenv/config";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { isOnPostiz, listDevices } from "../src/lib/devices";
import { deletePostizPost, listPostizPosts } from "../src/lib/postiz";

function stripHtml(s: string): string {
  return s.replace(/<\/?p>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function runSync(accountId: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["tsx", "scripts/sync-postiz.ts", "--to", accountId, "--keep-times"],
      { stdio: "inherit", cwd: process.cwd(), env: process.env },
    );
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      to: { type: "string" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(
      `Usage: npx tsx scripts/refresh-postiz-captions.ts [--to <accountId>] [--dry-run]`,
    );
    return;
  }

  if (!process.env.POSTIZ_API_KEY?.trim()) {
    console.error("POSTIZ_API_KEY missing");
    process.exit(1);
  }

  const devices = await listDevices();
  let targets = devices.filter(isOnPostiz);
  if (values.to) {
    targets = targets.filter((d) => d.id === values.to);
    if (targets.length === 0) {
      console.error(`No Postiz-linked account ${values.to}`);
      process.exit(1);
    }
  }

  const integrationIds = new Set(
    targets.map((d) => d.postizIntegrationId!).filter(Boolean),
  );
  const idToAccount = new Map(
    targets.map((d) => [d.postizIntegrationId!, d.id]),
  );

  const start = new Date(Date.now() - 24 * 3600_000).toISOString();
  const end = new Date(Date.now() + 40 * 24 * 3600_000).toISOString();
  const posts = await listPostizPosts(start, end);
  const toDelete = posts.filter((p) => {
    if (p.state !== "QUEUE") return false;
    const iid =
      p.integration?.id ??
      (p as { integrationId?: string }).integrationId;
    return Boolean(iid && integrationIds.has(iid));
  });

  console.log(
    `Postiz QUEUE to delete: ${toDelete.length} across ${targets.map((t) => t.id).join(", ")}\n`,
  );
  for (const p of toDelete) {
    const iid =
      p.integration?.id ??
      (p as { integrationId?: string }).integrationId;
    const account = iid ? idToAccount.get(iid) ?? iid : "?";
    console.log(
      `  ${p.publishDate}  [${account}]  ${stripHtml(p.content ?? "")}`,
    );
  }

  if (values["dry-run"]) {
    console.log(
      `\nDry run — would delete ${toDelete.length}, then sync-postiz --keep-times for each account.`,
    );
    return;
  }

  let deleted = 0;
  for (const p of toDelete) {
    try {
      await deletePostizPost(p.id);
      deleted++;
      console.log(`  deleted ${p.id}`);
    } catch (err) {
      console.error(`  FAIL delete ${p.id}:`, err);
    }
  }
  console.log(`\nDeleted ${deleted}/${toDelete.length}. Re-syncing captions…\n`);

  for (const d of targets) {
    console.log(`\n======== sync ${d.id} ========`);
    const code = await runSync(d.id);
    if (code !== 0) {
      console.error(`sync-postiz failed for ${d.id} (exit ${code})`);
    }
  }

  console.log("\nDone. Captions are now: <title>\\n\\n#tinder");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
