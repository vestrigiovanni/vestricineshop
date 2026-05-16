
import { getItems, listSubEvents, listQuotas } from '../src/services/pretix';

async function debug() {
  console.log("--- PRETIX ITEMS ---");
  const items = await getItems();
  items.forEach((it: any) => {
    console.log(`ID: ${it.id} | Name: ${it.name.it || it.name.en || it.name}`);
  });

  console.log("\n--- RECENT SUBEVENTS ---");
  const events = await listSubEvents(true);
  const latest = events.slice(0, 5); // listSubEvents(true) returns futureOnly sorted by date_from
  for (const ev of latest) {
    console.log(`\nEvent: ${ev.name.it || ev.name} (ID: ${ev.id}) | Date: ${ev.date_from}`);
    const quotas = await listQuotas(ev.id);
    quotas.forEach((q: any) => {
      console.log(`  Quota: ${q.name} | Size: ${q.size} | Items: ${q.items} | Avail: ${q.available_number}`);
    });
  }
}

debug().catch(console.error);
