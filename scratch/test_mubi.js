
const title = 'Familia';
const year = '2024';

async function test() {
  try {
    const searchUrl = `https://api.mubi.com/v3/search/films?query=Poor%20Things`;
    const searchResponse = await fetch(searchUrl, {
      headers: { 'Client': 'web', 'Client-Country': 'IT' }
    });
    
    if (!searchResponse.ok) {
        console.error('Search failed');
        return;
    }
    const searchData = await searchResponse.json();
    const films = searchData.films || [];
    console.log('Search Results:', films.map(f => `${f.title} (${f.year}) id:${f.id}`));
    
    const bestMatch = films.find(f => f.year === 2023 || f.year === 2024);
    
    if (!bestMatch) {
        console.error('Movie not found on MUBI');
        return;
    }

    console.log('Found Match:', bestMatch.title, 'ID:', bestMatch.id);

    const awardsUrl = `https://api.mubi.com/v3/films/${bestMatch.id}/industry_event_entries`;
    const awardsResponse = await fetch(awardsUrl, {
      headers: { 'Client': 'web', 'Client-Country': 'IT' }
    });

    if (awardsResponse.ok) {
      const allEntries = await awardsResponse.json();
      console.log('Awards/Entries:', JSON.stringify(allEntries, null, 2));
    } else {
        console.error('Awards fetch failed');
    }
  } catch (e) {
    console.error(e);
  }
}

test();
