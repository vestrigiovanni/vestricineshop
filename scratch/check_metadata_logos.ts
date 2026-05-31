import prisma from '../src/lib/prisma';
import { getEnrichedMovieMetadata } from '../src/services/tmdb';
import { saveOverride } from '../src/services/db.service';

async function run() {
  console.log('--- START CHECK METADATA LOGOS ---');
  
  // 1. Fetch all movie overrides
  const overrides = await prisma.movieOverride.findMany({});
  console.log(`Analyzing ${overrides.length} movie overrides...`);
  
  for (const o of overrides) {
    const tmdbId = o.tmdbId;
    console.log(`\nChecking TMDB ID: ${tmdbId} | Title: ${o.customTitle}`);
    
    // Fetch enriched metadata
    try {
      // Clear cache first to get fresh data
      const { deleteMovieMetadata } = await import('../src/services/db.service');
      deleteMovieMetadata(tmdbId);
      
      const metadata = await getEnrichedMovieMetadata(tmdbId);
      if (!metadata) {
        console.log(`⚠️ No metadata found for TMDB ID ${tmdbId}`);
        continue;
      }
      
      const freshLogo = metadata.logo_path;
      const currentLogo = o.customLogoPath;
      
      console.log(`- TMDB logo: ${freshLogo}`);
      console.log(`- Current DB logo: ${currentLogo}`);
      
      // If DB logo is missing or empty, but TMDB has a fresh logo, update it!
      if (freshLogo && (!currentLogo || currentLogo.trim() === '')) {
        console.log(`⚡ Updating logo for ${o.customTitle} to: ${freshLogo}`);
        await prisma.movieOverride.update({
          where: { tmdbId },
          data: {
            customLogoPath: freshLogo,
            // Only flag as manual override if it was already manual or if needed,
            // but let's keep the existing manual flag to be safe.
          }
        });
        console.log('✅ Updated!');
      } else {
        console.log('ℹ️ No update needed.');
      }
    } catch (e: any) {
      console.error(`❌ Error checking/updating TMDB ID ${tmdbId}:`, e.message || e);
    }
  }
  
  console.log('\n--- END METADATA LOGOS CHECK ---');
}

run().catch(console.error);
