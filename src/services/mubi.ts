
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
 * Translates/normalizes an award category to a uniform Italian label.
 * MUBI returns mixed Italian/English text (e.g. "Oscar al miglior film in lingua
 * straniera" alongside "Best Sound"); this harmonizes everything to Italian.
 */
function italianizeAward(raw: string): string {
  let t = (raw || '').trim();
  // Strip redundant "Oscar al/alla/allo/agli/ai/alle/all'" prefix for uniformity.
  // Articles are ordered longest-first so e.g. "alla" matches before "al".
  t = t.replace(/^oscar\s+(?:all['’]|alle|alla|allo|agli|ai|al)\s*/i, '').replace(/^oscar\s+/i, '').trim();

  const key = t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const map: Record<string, string> = {
    'best sound': 'Miglior sonoro',
    'sound': 'Miglior sonoro',
    'best picture': 'Miglior film',
    'best film': 'Miglior film',
    'best director': 'Miglior regia',
    'best cinematography': 'Miglior fotografia',
    'best editing': 'Miglior montaggio',
    'best film editing': 'Miglior montaggio',
    'best production design': 'Miglior scenografia',
    'best costume': 'Migliori costumi',
    'best costume design': 'Migliori costumi',
    'best original score': 'Miglior colonna sonora',
    'best music score': 'Miglior colonna sonora',
    'best original music': 'Miglior colonna sonora',
    'best supporting actress': 'Miglior attrice non protagonista',
    'best supporting actor': 'Miglior attore non protagonista',
    'best actress': 'Miglior attrice',
    'best actor': 'Miglior attore',
    'best lead performance': 'Miglior interpretazione',
    'best adapted screenplay': 'Miglior sceneggiatura non originale',
    'best screenplay adapted': 'Miglior sceneggiatura non originale',
    'best original screenplay': 'Miglior sceneggiatura originale',
    'best screenplay': 'Miglior sceneggiatura',
    'best international film': 'Miglior film internazionale',
    'best international feature': 'Miglior film internazionale',
    'best international feature film': 'Miglior film internazionale',
    'best foreign language film': 'Miglior film internazionale',
    'best foreign film': 'Miglior film internazionale',
    'best non english language film': 'Miglior film non in lingua inglese',
    'film not in the english language': 'Miglior film non in lingua inglese',
    'best film not in the english language': 'Miglior film non in lingua inglese',
    'best british film': 'Miglior film britannico',
    'best european film': 'Miglior film europeo',
    'best documentary': 'Miglior documentario',
    'best animated feature': "Miglior film d'animazione",
    'best visual effects': 'Migliori effetti speciali',
    'best makeup': 'Miglior trucco e acconciatura',
    'best makeup and hairstyling': 'Miglior trucco e acconciatura',
  };

  if (map[key]) return map[key];
  // Keep original casing, just ensure the first letter is capitalized.
  return t.charAt(0).toUpperCase() + t.slice(1);
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

    // Normalize titles for robust comparison (case, accents, punctuation insensitive).
    const norm = (s?: string) => (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

    const nTitle = norm(title);
    const nOriginal = norm(originalTitle);

    // CRITICAL: only accept films whose title (or original title) actually matches.
    // Never fall back to films[0] — that produced awards for a completely different
    // film when the real one wasn't on MUBI (e.g. "Mia" → "Mia madre").
    const titleMatches = films.filter((f: any) => {
      const ft = norm(f.title);
      const fo = norm(f.original_title);
      return ft === nTitle || ft === nOriginal || (nOriginal && fo === nOriginal) || fo === nTitle;
    });

    // Year sanity check: if we know the release year, reject matches that are off
    // by more than one year (handles festival-vs-release year differences).
    const yearOk = (f: any) => {
      if (!year || !f.year) return true;
      return Math.abs(Number(f.year) - Number(year)) <= 1;
    };
    const candidates = titleMatches.filter(yearOk);

    let bestMatch: any = null;
    if (year) {
      bestMatch = candidates.find((f: any) => f.year?.toString() === year) || candidates[0] || null;
    } else {
      bestMatch = candidates[0] || null;
    }

    // No confident match → return empty awards rather than wrong ones.
    if (!bestMatch) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[MUBI] Nessun match affidabile per "${title}" (${year || 'anno n/d'}), premi non assegnati.`);
      }
      return { awards: [], mubiId: undefined };
    }

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
          const rawText = (entry.display_text || '').replace(/^.*?tra cui:\s*/i, '').trim();
          const cleanedText = rawText ? italianizeAward(rawText) : '';

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
