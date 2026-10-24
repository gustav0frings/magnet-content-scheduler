/**
 * After bump-antoine-for-hinge: delete stale Antoine/Yannu QUEUE posts on Postiz
 * (still at old times). Keeps newly scheduled hinge posts.
 */
import "dotenv/config";
import { deletePostizPost, listPostizPosts } from "../src/lib/postiz";

const ANTOINE = "cmvl5ux4y00ivsz1cnw49bxds";
const YANNU = "cmvl7b3iq021vsz1ci7478d2q";

const keepHinge = new Set([
  "cmvmlakjy0abtp71cducxo3br",
  "cmvmlazpw0acvp71c2k93w37x",
  "cmvmlbf5k0ae5p71cbcow78tb",
  "cmvmlbvnw0afcp71coker0e0q",
  "cmvmlcayk0agnp71c7m53tqei",
]);

async function main() {
  const posts = await listPostizPosts(
    "2026-10-24T00:00:00.000Z",
    "2026-11-10T00:00:00.000Z",
  );
  const toDelete = posts.filter((p) => {
    if (p.state !== "QUEUE") return false;
    const iid =
      p.integration?.id ??
      (p as { integrationId?: string }).integrationId;
    if (iid === ANTOINE) return !keepHinge.has(p.id);
    if (iid === YANNU) return true;
    return false;
  });

  console.log(`Deleting ${toDelete.length} Postiz QUEUE posts…`);
  let ok = 0;
  for (const p of toDelete) {
    const title = (p.content ?? "").replace(/<\/?p>/g, "");
    try {
      await deletePostizPost(p.id);
      ok++;
      console.log(`  ok ${p.publishDate}  ${title}`);
    } catch (e) {
      console.error(`  FAIL ${p.id} ${title}:`, e);
    }
  }
  console.log(`Done: ${ok}/${toDelete.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
