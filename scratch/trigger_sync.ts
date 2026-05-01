import { syncPretixToDatabase } from '../src/services/sync.service';

async function main() {
  console.log('Starting manual sync...');
  const result = await syncPretixToDatabase({ forceMetadataRefresh: true });
  console.log('Sync result:', JSON.stringify(result, null, 2));
}

main().catch(console.error);
