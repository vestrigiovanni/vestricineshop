import { getMovieDetails, getEnhancedRating } from '../src/services/tmdb';

async function test() {
  const id = '937287'; // Challengers
  const details = await getMovieDetails(id);
  if (details) {
    const rating = await getEnhancedRating(details);
    console.log(`Rating per Challengers: ${rating}`);
  } else {
    console.log('Dettagli non trovati');
  }
}

test();
