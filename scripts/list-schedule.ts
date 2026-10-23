import "dotenv/config";
import { listItems } from "../src/lib/schedule";

async function main() {
  const items = await listItems();
  for (const i of items) {
    console.log(
      `${i.publishAt}  ${i.deviceId.padEnd(20)}  ${i.title}  [${i.id}]`,
    );
  }
  console.log(`\nTOTAL ${items.length}`);
}

main();
