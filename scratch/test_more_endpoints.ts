async function test(url: string) {
  console.log(`\n--- Fetching: ${url} ---`);
  const response = await fetch(url, {
    headers: { 'Client': 'web', 'Client-Country': 'IT' }
  });
  console.log(`Status: ${response.status}`);
  if (response.ok) {
    const data = await response.json();
    if (data.industry_events) console.log(`Found ${data.industry_events.length} events.`);
    else if (Array.isArray(data)) console.log(`Found ${data.length} items.`);
    else console.log('Keys:', Object.keys(data).slice(0, 10));
  }
}

async function run() {
  const id = '384905';
  await test(`https://api.mubi.com/v3/films/${id}/industry_event_entries`);
  await test(`https://api.mubi.com/v3/films/${id}/award_indices`);
  await test(`https://api.mubi.com/v3/films/${id}/industry_events_indices`);
}

run();
