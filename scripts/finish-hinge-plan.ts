/**
 * Dedupe yannu hinge duals + finish Postiz resync for remaining yannu (non-hinge).
 */
import "dotenv/config";
import { listDevices } from "../src/lib/devices";
import {
  deletePostizPost,
  extractPostizPostId,
  listPostizIntegrations,
  listPostizPosts,
  schedulePostizVideo,
  uploadToPostiz,
} from "../src/lib/postiz";
import { listItems, saveItems } from "../src/lib/schedule";
import { getUtApi } from "../src/lib/uploadthing";

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const items = await listItems();
  const devices = await listDevices();
  const yannu = devices.find((d) => d.id === "yannudating-fr")!;
  const integrations = await listPostizIntegrations();
  const yannuIdent = integrations.find(
    (i) => i.id === yannu.postizIntegrationId,
  )?.identifier;

  // --- Deduplicate hinge duals on yannudating (same title + same minute) ---
  const hingeYannu = items
    .filter(
      (i) =>
        i.deviceIds.includes("yannudating-fr") &&
        /^ben hinge study/i.test(i.title),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const keep = new Set<string>();
  const drop: typeof hingeYannu = [];
  const seen = new Set<string>();
  for (const i of hingeYannu) {
    const key = `${i.title}|${i.publishAt}`;
    if (seen.has(key)) drop.push(i);
    else {
      seen.add(key);
      keep.add(i.id);
    }
  }
  console.log(`Hinge yannu: keep ${keep.size}, drop ${drop.length}`);

  // Delete duplicate Postiz posts for dropped titles at that time (match content)
  const posts = await listPostizPosts(
    "2026-10-24T00:00:00.000Z",
    "2026-10-27T00:00:00.000Z",
  );
  const yannuHingePosts = posts.filter((p) => {
    const iid =
      p.integration?.id ??
      (p as { integrationId?: string }).integrationId;
    if (iid !== yannu.postizIntegrationId) return false;
    if (p.state !== "QUEUE") return false;
    return /ben hinge study/i.test(p.content ?? "");
  });
  // Keep one Postiz per title; delete extras
  const seenTitle = new Set<string>();
  for (const p of yannuHingePosts.sort((a, b) =>
    (a.publishDate ?? "").localeCompare(b.publishDate ?? ""),
  )) {
    const title = (p.content ?? "").replace(/<\/?p>/g, "");
    if (seenTitle.has(title)) {
      try {
        await deletePostizPost(p.id);
        console.log(`  deleted dup Postiz ${title} ${p.id}`);
      } catch (e) {
        console.error(`  FAIL delete ${p.id}`, e);
      }
    } else {
      seenTitle.add(title);
      console.log(`  keep Postiz ${title} ${p.id}`);
    }
  }

  const dropKeys = new Set(drop.map((d) => d.fileKey).filter(Boolean));
  // Only delete UT file if no other item uses it
  const kept = items.filter((i) => !drop.some((d) => d.id === i.id));
  const usedKeys = new Set(kept.map((i) => i.fileKey).filter(Boolean));
  const orphanKeys = [...dropKeys].filter((k) => !usedKeys.has(k));
  if (orphanKeys.length) {
    const utapi = getUtApi();
    await utapi.deleteFiles(orphanKeys);
    console.log(`Deleted ${orphanKeys.length} orphan UT file(s)`);
  }
  await saveItems(kept);
  console.log(`Schedule now ${kept.length} items`);

  // --- Finish yannu Postiz for non-hinge from Oct 27 onwards missing on Postiz ---
  const now = Date.now() - 60_000;
  const need = kept
    .filter(
      (i) =>
        i.deviceIds.includes("yannudating-fr") &&
        new Date(i.publishAt).getTime() >= now &&
        !/^ben hinge study/i.test(i.title),
    )
    .sort((a, b) => a.publishAt.localeCompare(b.publishAt));

  const existing = await listPostizPosts(
    "2026-10-27T00:00:00.000Z",
    "2026-11-10T00:00:00.000Z",
  );
  const already = new Set(
    existing
      .filter((p) => {
        const iid =
          p.integration?.id ??
          (p as { integrationId?: string }).integrationId;
        return iid === yannu.postizIntegrationId && p.state === "QUEUE";
      })
      .map((p) => (p.content ?? "").replace(/<\/?p>/g, "").replace(/&amp;/g, "&")),
  );

  console.log(`\nYannu remaining to Postiz: checking ${need.length}…`);
  for (const item of need) {
    if (already.has(item.title)) {
      console.log(`  skip (already) ${item.title}`);
      continue;
    }
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const buf = Buffer.from(await (await fetch(item.url)).arrayBuffer());
        const media = await uploadToPostiz(buf, `${item.id}.mp4`);
        const posted = await schedulePostizVideo({
          integrationId: yannu.postizIntegrationId!,
          platform: yannu.platform,
          publishAt: item.publishAt,
          content: item.title,
          media,
          integrationIdentifier: yannuIdent,
        });
        console.log(
          `  ok ${item.publishAt}  ${item.title}  ${JSON.stringify(posted)}`,
        );
        already.add(item.title);
        break;
      } catch (e) {
        console.error(`  attempt ${attempt} FAIL ${item.title}:`, e);
        await sleep(3000 * attempt);
        if (attempt === 4) throw e;
      }
    }
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
