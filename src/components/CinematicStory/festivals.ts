// Risoluzione award.type → festival: chiavi e loghi allineati a
// getFestivalConfig in MovieAwards (stessi alias, stesso fallback Oscar).

export interface FestivalInfo {
  key: string;
  name: string;
  logo: string;
  logoWidth: number;
  logoHeight: number;
}

const STD = { logoWidth: 95, logoHeight: 95 };

export const FESTIVALS: Record<string, FestivalInfo> = {
  cannes: { key: 'cannes', name: 'Festival di Cannes', logo: '/logos/cannes_v1.png', ...STD },
  venice: { key: 'venice', name: "Mostra Internazionale d'Arte Cinematografica di Venezia", logo: '/logos/venezia_v1.png', ...STD },
  berlin: { key: 'berlin', name: 'Berlinale', logo: '/logos/berlinale_v1.png', ...STD },
  oscar: { key: 'oscar', name: 'Academy Awards', logo: '/logos/oscars_v1.png', ...STD },
  bafta: { key: 'bafta', name: 'BAFTA', logo: '/logos/bafta_v1.png', ...STD },
  ssiff: { key: 'ssiff', name: 'Festival di San Sebastián', logo: '/logos/ssiff_v1.png', ...STD },
  telluride: { key: 'telluride', name: 'Telluride Film Festival', logo: '/logos/telluride_v1.png', ...STD },
  toronto: { key: 'toronto', name: 'Toronto International Film Festival', logo: '/logos/tiff.png', logoWidth: 200, logoHeight: 95 },
  locarno: { key: 'locarno', name: 'Locarno Film Festival', logo: '/logos/locarno.png', ...STD },
  davids: { key: 'davids', name: 'David di Donatello', logo: '/logos/david.png', ...STD },
  nastri: { key: 'nastri', name: "Nastri d'Argento", logo: '/logos/nastri.png', ...STD },
  romacinemafest: { key: 'romacinemafest', name: 'Festa del Cinema di Roma', logo: '/logos/roma.png', ...STD },
};

/** Festival mostrati nella sezione homepage "Dai festival alla nostra sala". */
export const FESTIVAL_HOMEPAGE = new Set(['cannes', 'oscar', 'venice', 'davids']);

/** Tie-break nell'ordinamento dei blocchi festival. */
export const FESTIVAL_PRESTIGE = [
  'cannes', 'venice', 'berlin', 'oscar', 'bafta', 'toronto',
  'ssiff', 'locarno', 'telluride', 'davids', 'nastri', 'romacinemafest',
];

/** Stessa logica di getFestivalConfig: alias Toronto/TIFF, fallback Oscar. */
export function resolveFestival(type: string): FestivalInfo {
  const t = (type || '').toLowerCase().trim();
  if (t === 'toronto' || t === 'tiff' || t.includes('toronto') || t.includes('tiff')) {
    return FESTIVALS.toronto;
  }
  return FESTIVALS[t] || FESTIVALS.oscar;
}
