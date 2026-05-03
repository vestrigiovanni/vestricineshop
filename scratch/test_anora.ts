import { fetchMubiAwards } from '../src/services/mubi';

async function testAnora() {
  const data = await fetchMubiAwards('391724', 'Anora', 'Anora', '2024');
  console.log(JSON.stringify(data, null, 2));
}

testAnora();
