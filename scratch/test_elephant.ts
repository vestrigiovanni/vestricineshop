import { getMovieDetails, getEnhancedRating } from '../src/services/tmdb';

async function test() {
  const id = '10534'; // Elephant
  const details = await getMovieDetails(id);
  if (details) {
    const rating = await getEnhancedRating(details);
    console.log(`Rating per Elephant: ${rating}`);
  } else {
    console.log('Dettagli non trovati');
  }
}

test();
