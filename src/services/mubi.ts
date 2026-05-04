
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
 * Now supports all major festivals by fetching the complete entry list.
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

    if (!bestMatch) {
      bestMatch = films.find((f: any) => 
        f.title.toLowerCase() === title.toLowerCase() || 
        (originalTitle && f.original_title?.toLowerCase() === originalTitle.toLowerCase())
      );
    }

    if (!bestMatch) bestMatch = films[0];

    const mubiId = bestMatch.id;
    const majorAwardKeywords = [
      'vincitore', 'winner', 'palma', 'palme', 'grand prix', 'leone', 'lion', 
      'oscar', 'miglior', 'best', 'prix', 'jury', 'giuria', 'pardo', 'silver', 
      'argento', 'oro', 'golden', 'bear', 'orso', 'concha', 'shell', 'bafta', 
      'telluride', 'official selection', 'selezione ufficiale', 'premio', 'vinto', 'vinta', 'award'
    ];

    const festivalMapping = [
      { id: 'oscar', keywords: ['academy award', 'oscar'], label: 'Academy Awards', eventType: 'academy_award' },
      { id: 'cannes', keywords: ['cannes'], label: 'Festival de Cannes' },
      { id: 'venice', keywords: ['venice', 'venezia'], label: 'Mostra internazionale d\'arte cinematografica la biennale di venezia' },
      { id: 'berlin', keywords: ['berlinale', 'berlin'], label: 'Berlin International Film Festival' },
      { id: 'ssiff', keywords: ['san sebastián', 'san sebastian', 'ssiff'], label: 'San Sebastián International Film Festival' },
      { id: 'bafta', keywords: ['bafta', 'british academy'], label: 'BAFTA Awards' },
      { id: 'telluride', keywords: ['telluride'], label: 'Telluride Film Festival' },
      { id: 'toronto', keywords: ['toronto', 'tiff'], label: 'Toronto International Film Festival' },
      { id: 'locarno', keywords: ['locarno', 'pardo'], label: 'Locarno International Film Festival' },
      { id: 'davids', keywords: ['david di donatello', 'david'], label: 'David di Donatello' },
      { id: 'nastri', keywords: ['nastri d\'argento', 'sindacato nazionale giornalisti cinematografici', 'nastri'], label: 'Nastri d\'Argento' },
      { id: 'romacinemafest', keywords: ['rome film festival', 'roma cinema fest', 'festa del cinema di roma', 'romacinemafest', 'fondazione cinema per roma'], label: 'Festa del cinema di Roma' }
    ];

    const awardsByFestival: Record<string, { type: string, label: string, details: Set<string>, year: number | null }> = {};

    // Use the full industry_event_entries endpoint to get ALL awards
    const awardsUrl = `https://api.mubi.com/v3/films/${mubiId}/industry_event_entries`;
    const awardsResponse = await fetch(awardsUrl, {
      headers: { 'Client': 'web', 'Client-Country': 'IT' },
      cache: 'no-store'
    });

    if (awardsResponse.ok) {
      const allEntries = await awardsResponse.json();
      if (Array.isArray(allEntries)) {
        allEntries.forEach((entry: any) => {
          const festival = entry.industry_event;
          if (!festival) return;

          const festivalName = (festival.name || '').toLowerCase();
          const eventType = festival.type || 'generic';

          const match = festivalMapping.find(f => 
            f.keywords.some(k => festivalName.includes(k)) || 
            (f.eventType && eventType === f.eventType)
          );

          if (match) {
            if (!awardsByFestival[match.id]) {
              awardsByFestival[match.id] = {
                type: match.id,
                label: match.label,
                details: new Set<string>(),
                year: entry.year || null
              };
            }

            const isWinner = entry.status === 'won';
            const awardText = entry.display_text || '';

            if (isWinner || majorAwardKeywords.some(k => awardText.toLowerCase().includes(k))) {
              const cleanedText = awardText.replace(/^.*?tra cui:\s*/i, '').trim();
              if (cleanedText) awardsByFestival[match.id].details.add(cleanedText);
            } else if (awardsByFestival[match.id].details.size === 0) {
              // Add Official Selection only if we haven't found any specific award yet
              awardsByFestival[match.id].details.add('Selezione Ufficiale');
            }
          }
        });
      }
    }

    const resultAwards: MubiAward[] = [];
    Object.entries(awardsByFestival).forEach(([type, info]) => {
      // Remove "Selezione Ufficiale" if there are other more specific awards
      if (info.details.size > 1 && info.details.has('Selezione Ufficiale')) {
        info.details.delete('Selezione Ufficiale');
      }

      if (info.details.size > 0) {
        resultAwards.push({
          type,
          label: info.label,
          details: Array.from(info.details).join(', '),
          year: info.year || undefined
        });
      }
    });

    return {
      awards: resultAwards,
      mubiId: mubiId.toString()
    };

  } catch (error) {
    console.error(`[MUBI] Error fetching awards for ${title}:`, error);
    return null;
  }
}
