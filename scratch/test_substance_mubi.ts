import { fetchMubiAwards } from '../src/services/mubi';

async function main() {
  const result = await fetchMubiAwards('933260', 'The Substance', 'The Substance', '2024');
  console.log('MUBI Awards result:', JSON.stringify(result, null, 2));
}

main().catch(console.error);
