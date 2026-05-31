import prisma from '../src/lib/prisma';
import { saveOverride } from '../src/services/db.service';
import { syncPretixToDatabase } from '../src/services/sync.service';

async function test() {
  const TEST_TMDB_ID = '1064213'; // TMDB ID for Anora, which is in programmazione
  console.log('--- START TEST SYNC LOGO ---');
  
  // 1. Fetch current movie override
  const original = await prisma.movieOverride.findUnique({
    where: { tmdbId: TEST_TMDB_ID }
  });
  console.log('Original customLogoPath:', original?.customLogoPath);
  console.log('Original isManualOverride:', original?.isManualOverride);

  // 2. Save a custom logo path
  const customPath = '/custom-logo-test-' + Date.now() + '.png';
  console.log('Saving custom logo:', customPath);
  await saveOverride(TEST_TMDB_ID, {
    customLogoPath: customPath,
    isManualOverride: true,
  });

  // Verify it is in DB
  const afterSave = await prisma.movieOverride.findUnique({
    where: { tmdbId: TEST_TMDB_ID }
  });
  console.log('DB customLogoPath after save:', afterSave?.customLogoPath);

  // 3. Run sync (which might overwrite if there's a bug)
  console.log('Running syncPretixToDatabase...');
  await syncPretixToDatabase({ forceMetadataRefresh: false, skipPush: true });

  // 4. Verify after sync
  const afterSync = await prisma.movieOverride.findUnique({
    where: { tmdbId: TEST_TMDB_ID }
  });
  console.log('DB customLogoPath after sync:', afterSync?.customLogoPath);
  
  if (afterSync?.customLogoPath === customPath) {
    console.log('✅ Custom logo preserved through sync!');
  } else {
    console.log('❌ BUG: Custom logo was OVERWRITTEN by sync!');
  }

  // Restore original if there was one
  if (original) {
    await saveOverride(TEST_TMDB_ID, {
      customLogoPath: original.customLogoPath,
      isManualOverride: original.isManualOverride,
    });
  } else {
    await prisma.movieOverride.delete({ where: { tmdbId: TEST_TMDB_ID } }).catch(() => {});
  }

  console.log('--- END TEST ---');
}

test().catch(console.error);
