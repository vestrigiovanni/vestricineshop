import { fetchMubiAwards } from '../src/services/mubi';

async function checkDiaz() {
  const data = await fetchMubiAwards('96714', 'Diaz - Non pulire questo sangue', 'Diaz', '2012');
  console.log(JSON.stringify(data, null, 2));
}

checkDiaz();
