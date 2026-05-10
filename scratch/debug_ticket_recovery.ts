/**
 * Script diagnostico: testa l'endpoint /subevents/ con vari formati di data
 * per capire quale range trova gli spettacoli di OGGI (2026-05-06) da Pretix.
 *
 * Esegui con: npx tsx scratch/debug_ticket_recovery.ts
 */

const PRETIX_TOKEN = 'Token uqvj3n2vyn1yc0xzqqcqw44f93ug86s8x8l5uj61jb2wd3aywsfdfmyq9apshgjb';
const PRETIX_API_URL = 'https://pretix.eu/api/v1';
const PRETIX_ORG = 'vestri';
const PRETIX_EVENT = 'npkez';
const BASE = `${PRETIX_API_URL}/organizers/${PRETIX_ORG}/events/${PRETIX_EVENT}`;

const headers = {
  'Authorization': PRETIX_TOKEN,
  'Content-Type': 'application/json',
};

async function fetchSubevents(after: string, before: string, label: string) {
  const url = `${BASE}/subevents/?date_from_after=${encodeURIComponent(after)}&date_from_before=${encodeURIComponent(before)}&ordering=date_from&limit=100`;
  console.log(`\n[${label}] URL: ${url}\n`);
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(`  ERROR ${res.status}:`, await res.text());
    return;
  }
  const data = await res.json();
  console.log(`  → ${data.count} totali, ${data.results?.length} in questa pagina`);
  if (data.results?.length > 0) {
    data.results.slice(0, 5).forEach((se: any) => {
      console.log(`    ID=${se.id} | ${se.name?.it || se.name} | date_from=${se.date_from}`);
    });
  }
  return data;
}

async function fetchOrderPositions(subeventIds: number[]) {
  if (subeventIds.length === 0) { console.log('  Nessun subevent da testare'); return; }
  const params = subeventIds.map(id => `subevent=${id}`).join('&');
  const url = `${BASE}/orderpositions/?${params}&order__status=p&expand=subevent&expand=item&expand=order&limit=25`;
  console.log(`\n[OrderPositions] URL: ${url.substring(0, 200)}...`);
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(`  ERROR ${res.status}:`, await res.text());
    return;
  }
  const data = await res.json();
  console.log(`  → ${data.count} biglietti totali, ${data.results?.length} in questa pagina`);
  data.results?.slice(0, 3).forEach((pos: any) => {
    console.log(`    PosID=${pos.positionid} | order=${pos.order?.code} | subevent=${typeof pos.subevent === 'object' ? pos.subevent?.id + ' date_from=' + pos.subevent?.date_from : pos.subevent}`);
  });
}

async function main() {
  const dateStr = '2026-05-06'; // OGGI

  console.log('=== DIAGNOSTICA RECUPERO BIGLIETTI PRETIX ===');
  console.log(`Data target: ${dateStr} (Europe/Rome = UTC+2 CEST)`);

  // Test 1: UTC puro (il metodo ORIGINALE - sbagliato)
  const d1 = await fetchSubevents(`${dateStr}T00:00:00Z`, `${dateStr}T23:59:59Z`, 'TEST-1 UTC puro (originale)');
  
  // Test 2: RFC3339 con offset +02:00 (il metodo NUOVO con encode)
  const d2 = await fetchSubevents(`${dateStr}T00:00:00+02:00`, `${dateStr}T23:59:59+02:00`, 'TEST-2 +02:00 encoded');
  
  // Test 3: UTC equivalente esplicito (midnight Roma = 22:00 UTC giorno prima)
  // 2026-05-06T00:00:00+02:00 = 2026-05-05T22:00:00Z
  // 2026-05-06T23:59:59+02:00 = 2026-05-06T21:59:59Z
  const d3 = await fetchSubevents('2026-05-05T22:00:00Z', '2026-05-06T21:59:59Z', 'TEST-3 UTC equivalente esplicito');

  // Test 4: Senza encodeURIComponent, con + nel parametro
  const url4 = `${BASE}/subevents/?date_from_after=${dateStr}T00:00:00%2B02:00&date_from_before=${dateStr}T23:59:59%2B02:00&ordering=date_from&limit=100`;
  console.log(`\n[TEST-4 +02:00 pre-encoded] URL: ${url4}`);
  const res4 = await fetch(url4, { headers });
  const d4 = await res4.json();
  console.log(`  → ${d4.count} totali, ${d4.results?.length} in questa pagina`);
  d4.results?.slice(0, 3).forEach((se: any) => {
    console.log(`    ID=${se.id} | ${se.name?.it} | date_from=${se.date_from}`);
  });

  // Identifica il test vincente e recupera i biglietti
  const winner = [d1, d2, d3, d4].find(d => d?.count > 0);
  if (winner) {
    const ids = winner.results.map((se: any) => se.id);
    console.log(`\n=== Subevent IDs trovati (${ids.length}): ${ids.join(', ')}`);
    await fetchOrderPositions(ids);
  } else {
    console.log('\n❌ NESSUN TEST ha trovato subevents per oggi!');
    console.log('Verifica che ci siano spettacoli programmati per', dateStr, 'su Pretix.');
  }
}

main().catch(console.error);
// NEVER MIND - test separato
