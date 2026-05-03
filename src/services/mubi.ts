
export interface MubiAward {
  type: string;
  label: string;
  details: string;
  year?: number;
}

export interface MubiAwardData {
  awards: MubiAward[];
  mubiId: string | undefined;
}

/**
 * Fetches and parses film awards from MUBI internal API (v3).
 * Now supports: Oscars, Cannes, Venice, Berlin, San Sebastián, BAFTA, Telluride.
 */
export async function fetchMubiAwards(tmdbId: string, title: string, originalTitle?: string, year?: string): Promise<MubiAwardData | null> {
  try {
    const searchUrl = `https://api.mubi.com/v3/search/films?query=${encodeURIComponent(title)}`;
    const searchResponse = await fetch(searchUrl, {
      headers: { 'Client': 'web', 'Client-Country': 'IT' }
    });
    
    if (!searchResponse.ok) return null;
    const searchData = await searchResponse.json();
    const films = searchData.films || [];
    if (films.length === 0) return null;

    // Find the best match: by title match and optionally by year
    let bestMatch = films.find((f: any) => {
      const titleMatch = f.title.toLowerCase() === title.toLowerCase() || 
                        (originalTitle && f.original_title?.toLowerCase() === originalTitle.toLowerCase());
      const yearMatch = year ? (f.year?.toString() === year) : true;
      return titleMatch && yearMatch;
    });

    // Fallback to title only if year doesn't match
    if (!bestMatch) {
      bestMatch = films.find((f: any) => 
        f.title.toLowerCase() === title.toLowerCase() || 
        (originalTitle && f.original_title?.toLowerCase() === originalTitle.toLowerCase())
      );
    }

    // Ultimate fallback to first result
    if (!bestMatch) bestMatch = films[0];

    const detailsUrl = `https://api.mubi.com/v3/films/${bestMatch.id}`;
    const detailsResponse = await fetch(detailsUrl, {
      headers: { 'Client': 'web', 'Client-Country': 'IT' }
    });
    if (!detailsResponse.ok) return null;
    const filmData = await detailsResponse.json();

    const events = filmData.industry_events || [];
    if (events.length === 0) return { awards: [], mubiId: bestMatch.id.toString() };

    const majorAwardKeywords = [
      'vincitore', 'winner', 'palma', 'palme', 'grand prix', 'leone', 'lion', 
      'oscar', 'miglior', 'best', 'prix', 'jury', 'giuria', 'pardo', 'silver', 
      'argento', 'oro', 'golden', 'bear', 'orso', 'concha', 'shell', 'bafta', 
      'telluride', 'official selection', 'selezione ufficiale'
    ];

    const festivalMapping = [
      { id: 'oscar', keywords: ['academy award', 'oscar'], label: 'Academy Awards', eventType: 'academy_award' },
      { id: 'cannes', keywords: ['cannes'], label: 'Festival de Cannes' },
      { id: 'venice', keywords: ['venice', 'venezia'], label: 'Mostra internazionale d\'arte cinematografica la biennale di venezia' },
      { id: 'berlin', keywords: ['berlinale', 'berlin'], label: 'Berlin International Film Festival' },
      { id: 'ssiff', keywords: ['san sebastián', 'san sebastian', 'ssiff'], label: 'San Sebastián International Film Festival' },
      { id: 'bafta', keywords: ['bafta'], label: 'BAFTA Awards' },
      { id: 'telluride', keywords: ['telluride'], label: 'Telluride Film Festival' }
    ];

    const awardsByFestival: Record<string, { details: Set<string>, year: number | null }> = {};

    events.forEach((e: any) => {
      const festivalName = (e.name || '').toLowerCase();
      const eventType = e.event_type;
      
      const match = festivalMapping.find(f => 
        f.keywords.some(k => festivalName.includes(k)) || 
        (f.eventType && eventType === f.eventType)
      );

      if (match) {
        if (!awardsByFestival[match.id]) {
          awardsByFestival[match.id] = { details: new Set(), year: e.year || null };
        }
        
        const entries = e.entries || [];
        const filteredEntries = entries.filter((entry: any) => {
          const entryText = typeof entry === 'string' ? entry : (entry.award_name || '');
          const entryName = entryText.toLowerCase();
          return majorAwardKeywords.some(k => entryName.includes(k));
        });

        if (filteredEntries.length > 0) {
          const winners = filteredEntries.filter((entry: any) => {
            if (typeof entry === 'string') {
              const lower = entry.toLowerCase();
              return lower.includes('vincitore') || lower.includes('winner') || lower.includes('premi');
            }
            return entry.winner;
          });
          
          const others = filteredEntries.filter((entry: any) => !winners.includes(entry));

          if (winners.length > 0) {
            const winnersText = winners.map((entry: any) => {
              const text = typeof entry === 'string' ? entry : entry.award_name;
              return text.split('|').pop()?.trim() || text;
            }).join(', ');
            awardsByFestival[match.id].details.add(winnersText);
          }
          
          if (others.length > 0) {
            const othersCount = others.length;
            const highlights = others.slice(0, 2).map((entry: any) => {
              const text = typeof entry === 'string' ? entry : entry.award_name;
              return text.split('|').pop()?.trim() || text;
            }).join(', ');
            awardsByFestival[match.id].details.add(`${othersCount} candidature, tra cui: ${highlights}`);
          }
        } else if (
          match.id !== 'oscar' && // Gli oscar hanno sempre entry specifiche se rilevanti
          (entries.length > 0 || festivalName.includes('selezione ufficiale') || festivalName.includes('competition'))
        ) {
          // Se siamo in un festival di prestigio e c'è almeno un'entrata (anche solo l'anno),
          // lo consideriamo Selezione Ufficiale
          awardsByFestival[match.id].details.add('Selezione Ufficiale');
        }
      }
    });

    const resultAwards: any[] = [];
    Object.entries(awardsByFestival).forEach(([type, info]) => {
      const festivalInfo = festivalMapping.find(f => f.id === type);
      if (info.details.size > 0) {
        resultAwards.push({
          type,
          label: festivalInfo?.label || type,
          details: Array.from(info.details).join(', '),
          year: info.year
        });
      }
    });

    return {
      awards: resultAwards,
      mubiId: bestMatch.id.toString()
    };

  } catch (error) {
    console.error(`[MUBI] Error fetching awards for ${title}:`, error);
    return null;
  }
}
