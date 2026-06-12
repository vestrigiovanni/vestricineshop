import { adminScheduleMovie } from '../src/actions/adminActions';

async function runTest() {
  console.log('--- STARTING SCHEDULE TEST ---');
  
  const movieData = {
    id: '1064213', // TMDB ID for Anora
    title: 'Anora',
    overview: 'Anora, a young sex worker from Brooklyn, gets her chance at a Cinderella story...',
    posterPath: '/42o153hE2wA63WOCjphgHh1Wb97.jpg',
    language: 'English',
    subtitles: 'Italiano',
    versionLanguage: 'Versione Originale Sottotitolata'
  };

  const dateStr = '2026-06-20';
  const timeStr = '20:30';
  const seatingPlanId = 6439; // SALA AGOSTINO FOSSATI

  try {
    const result = await adminScheduleMovie(
      movieData,
      dateStr,
      timeStr,
      seatingPlanId,
      false, // override
      0, // buffer
      true // skipSync (to isolate the creation itself)
    );
    console.log('Result:', result);
  } catch (error: any) {
    console.error('CRITICAL ERROR CAUGHT:', error);
    if (error.stack) {
      console.error(error.stack);
    }
  }

  console.log('--- END SCHEDULE TEST ---');
}

runTest().catch(console.error);
