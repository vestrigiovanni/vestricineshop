import { fetchMubiAwards } from '../src/services/mubi';

async function testMubiAwards() {
  const movies = [
    { id: '1064213', title: 'Anora' },
    { id: '1026227', title: "C'è ancora domani" },
    { id: '87502', title: 'Flight' },
    { id: '1013860', title: 'Dahomey' }, // Berlin Golden Bear 2024
    { id: '1026436', title: 'Conclave' },
    { id: '950396', title: 'Oppenheimer' } // BAFTA
  ];

  for (const m of movies) {
    console.log(`\n🔍 Testando ${m.title}...`);
    const data = await fetchMubiAwards(m.id, m.title);
    if (data && data.awards.length > 0) {
      console.log(`✅ Trovati ${data.awards.length} premi:`);
      data.awards.forEach(a => console.log(`   - ${a.label} (${a.type}): ${a.details} [${a.year}]`));
    } else {
      console.log(`❌ Nessun premio rilevante trovato.`);
    }
  }
}

testMubiAwards();
