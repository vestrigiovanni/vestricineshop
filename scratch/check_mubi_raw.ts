async function checkMubiRaw(query: string) {
  let filmId = query;
  let title = '';

  // If input is not a number, search for it first
  if (isNaN(Number(query))) {
    console.log(`🔍 Searching MUBI for: "${query}"...`);
    const searchUrl = `https://api.mubi.com/v3/search/films?query=${encodeURIComponent(query)}`;
    const searchRes = await fetch(searchUrl, { headers: { 'Client': 'web', 'Client-Country': 'IT' } });
    if (!searchRes.ok) {
      console.error(`❌ Search failed: ${searchRes.status}`);
      return;
    }
    const searchData = await searchRes.json();
    const bestMatch = (searchData.films || [])[0];
    if (!bestMatch) {
      console.error('❌ No film found for this query.');
      return;
    }
    filmId = String(bestMatch.id);
    title = bestMatch.title;
    console.log(`✅ Found: ${title} (ID: ${filmId})`);
  } else {
    console.log(`🔍 Checking MUBI raw data for film ID: ${filmId}`);
  }

  const urls = {
    details: `https://api.mubi.com/v3/films/${filmId}`,
    awards: `https://api.mubi.com/v3/films/${filmId}/industry_event_entries`
  };

  try {
    const [detailsRes, awardsRes] = await Promise.all([
      fetch(urls.details, { headers: { 'Client': 'web', 'Client-Country': 'IT' } }),
      fetch(urls.awards, { headers: { 'Client': 'web', 'Client-Country': 'IT' } })
    ]);

    if (!detailsRes.ok) {
      console.error(`❌ Details failed: ${detailsRes.status}`);
    } else {
      const details = await detailsRes.json();
      console.log(`🎬 FILM: ${details.title} (${details.year})`);
    }

    if (!awardsRes.ok) {
      console.error(`❌ Awards failed: ${awardsRes.status}`);
    } else {
      const awards = await awardsRes.json();
      console.log(`🏆 AWARDS (${awards.length} entries):`);
      console.log(JSON.stringify(awards, null, 2));
    }

  } catch (error) {
    console.error('❌ Error fetching data:', error);
  }
}

// Example: The Substance (1064213)
const query = process.argv[2] || '1064213';
checkMubiRaw(query);
