import { 
  adminPrepareMetadata, 
  adminScheduleMovie, 
  adminSyncNewlyCreatedEvents,
  adminListEvents 
} from '../src/actions/adminActions';

async function runTest() {
  console.log('--- STARTING FULL FLOW TEST ---');
  
  const tmdbId = '1064213'; // Anora
  
  try {
    // 1. Prepare Metadata
    console.log('1. Calling adminPrepareMetadata...');
    const enrichedMetadata = await adminPrepareMetadata(tmdbId);
    console.log('Metadata prepared:', enrichedMetadata ? 'SUCCESS' : 'FAILED');

    // 2. Schedule Movie
    console.log('2. Calling adminScheduleMovie...');
    const movieData = {
      id: tmdbId,
      title: 'Anora',
      overview: 'Anora, a young sex worker from Brooklyn...',
      posterPath: '/42o153hE2wA63WOCjphgHh1Wb97.jpg',
      language: 'English',
      subtitles: 'Italiano',
      versionLanguage: 'Versione Originale Sottotitolata'
    };

    const dateStr = '2026-06-21';
    const timeStr = '18:00';
    const seatingPlanId = 6439; // SALA AGOSTINO FOSSATI

    const scheduleResult = await adminScheduleMovie(
      movieData,
      dateStr,
      timeStr,
      seatingPlanId,
      false, // override
      0, // buffer
      true, // skipSync
      enrichedMetadata
    );
    console.log('Schedule result:', scheduleResult);

    if (scheduleResult.success && scheduleResult.subeventId) {
      // 3. Surgical Sync
      console.log('3. Calling adminSyncNewlyCreatedEvents...');
      const syncResult = await adminSyncNewlyCreatedEvents([scheduleResult.subeventId]);
      console.log('Sync result:', syncResult);
    }

    // 4. List Events
    console.log('4. Calling adminListEvents...');
    const events = await adminListEvents();
    console.log('List events returned count:', events?.length);

  } catch (error: any) {
    console.error('CRITICAL ERROR CAUGHT:', error);
    if (error.stack) {
      console.error(error.stack);
    }
  }

  console.log('--- END FULL FLOW TEST ---');
}

runTest().catch(console.error);
