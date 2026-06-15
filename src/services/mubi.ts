
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

    // Track wins and nominations separately so the UI can distinguish them.
    const awardsByFestival: Record<string, {
      type: string,
      label: string,
      won: Set<string>,
      nominated: Set<string>,
      selection: boolean,
      year: number | null
    }> = {};

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

          if (!match) return;

          if (!awardsByFestival[match.id]) {
            awardsByFestival[match.id] = {
              type: match.id,
              label: match.label,
              won: new Set<string>(),
              nominated: new Set<string>(),
              selection: false,
              year: entry.year || null
            };
          }

          const bucket = awardsByFestival[match.id];
          const status = (entry.status || '').toLowerCase();
          const cleanedText = (entry.display_text || '').replace(/^.*?tra cui:\s*/i, '').trim();

          if (status === 'won') {
            // Authoritative win from MUBI
            if (cleanedText) bucket.won.add(cleanedText);
            else bucket.selection = true;
          } else if (status === 'screening' || !cleanedText) {
            // Pure festival presence with no specific prize
            bucket.selection = true;
          } else {
            // nominated, shortlisted, second_place, ... → it's a nomination, not a win
            bucket.nominated.add(cleanedText);
          }
        });
      }
    }

    const resultAwards: MubiAward[] = [];
    Object.values(awardsByFestival).forEach((info) => {
      const won = Array.from(info.won);
      const nominated = Array.from(info.nominated);

      // Build a human-readable string that clearly separates wins from nominations.
      // Use ' · ' between the two groups and ', ' within each group.
      const parts: string[] = [];
      if (won.length) parts.push(`Vincitore: ${won.join(', ')}`);
      if (nominated.length) parts.push(`Candidatura: ${nominated.join(', ')}`);
      if (!parts.length && info.selection) parts.push('Selezione Ufficiale');

      if (parts.length) {
        resultAwards.push({
          type: info.type,
          label: info.label,
          details: parts.join(' · '),
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

/**
 * MANUAL OVERRIDES: For very new films (like Familia) not yet on MUBI.
 */
export function getManualAwards(tmdbId: string): MubiAward[] | null {
  const overrides: Record<string, MubiAward[]> = {
    "1313006": [ // Familia (2024)
      {
        type: 'venice',
        label: "Mostra internazionale d'arte cinematografica la biennale di venezia",
        details: "Vincitore: Premio Orizzonti per il miglior attore (Francesco Gheghi)",
        year: 2024
      }
    ]
  };
  return overrides[tmdbId] || null;
}
