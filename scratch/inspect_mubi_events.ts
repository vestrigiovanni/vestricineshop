async function inspectMubiEvents(filmId: string) {
  const detailsUrl = `https://api.mubi.com/v3/films/${filmId}`;
  const detailsResponse = await fetch(detailsUrl, {
    headers: { 'Client': 'web', 'Client-Country': 'IT' }
  });
  const filmData = await detailsResponse.json();
  console.log(`🎬 FILM: ${filmData.title}`);
  console.log('📅 EVENTS:', JSON.stringify(filmData.industry_events, null, 2));
}

// Anora: 1064213
inspectMubiEvents('1064213');
