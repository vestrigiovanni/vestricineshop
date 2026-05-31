import prisma from '../src/lib/prisma';
import { saveOverride } from '../src/services/db.service';

async function test() {
  const TEST_TMDB_ID = 'test_movie_logo_id';
  console.log('--- START TEST SAVE OVERRIDE LOGO ---');
  
  // 1. Cleanup
  await prisma.movieOverride.delete({ where: { tmdbId: TEST_TMDB_ID } }).catch(() => {});
  
  // 2. Save override with a logo
  console.log('Saving override with customLogoPath...');
  const success = await saveOverride(TEST_TMDB_ID, {
    customTitle: 'Test Movie For Logo',
    customLogoPath: 'https://images.tmdb.org/t/p/w500/test-logo-path.png',
    isManualOverride: true,
  });
  
  console.log('Save status:', success);
  
  // 3. Fetch from DB
  const fetched = await prisma.movieOverride.findUnique({
    where: { tmdbId: TEST_TMDB_ID }
  });
  
  console.log('Fetched customLogoPath:', fetched?.customLogoPath);
  
  // 4. Cleanup again
  await prisma.movieOverride.delete({ where: { tmdbId: TEST_TMDB_ID } }).catch(() => {});
  
  console.log('--- END TEST ---');
}

test().catch(console.error);
