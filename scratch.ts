import { listQuotas, listEvents, listSubEvents } from './src/services/pretix.ts';
async function test() {
  const events = await listSubEvents(true);
  if (events.length > 0) {
    console.log("Checking subevent:", events[0].id);
    const quotas = await listQuotas(events[0].id);
    console.dir(quotas.map(q => ({id: q.id, size: q.size, available: q.available, available_number: q.available_number})));
  }
}
test();
