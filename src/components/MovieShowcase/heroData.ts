/**
 * I dati dell'hero, già pronti da disegnare. Niente React qui dentro: così
 * ogni regola (quale orario si accende, quale premio va in alto, che lingua si
 * scrive) si prova con vitest.
 */
import { normalizeProjectionSpecs, projectionSpec } from '@/constants/projectionSpecs';
import { getFullLanguageName } from '@/constants/languages';
import { formatShowDayLabel, formatShowTime } from '@/utils/cinemaDate';
import { awardHighlight } from '@/components/CinematicStory/storyBuilder';
import { FESTIVAL_PRESTIGE, resolveFestival } from '@/components/CinematicStory/festivals';

/** Uno spettacolo come arriva da app/page.tsx. */
export interface SubeventLike {
  id: number;
  date: string;
  dayLabel?: string;
  timeLabel?: string;
  isSoldOut?: boolean;
  language?: string;
  subtitles?: string;
  specs?: unknown;
  specsNote?: string;
}

export interface HeroShowtime {
  id: number;
  time: string;
  isSoldOut: boolean;
  /** Il prossimo spettacolo che si può prenotare: acceso in ambra. */
  isNext: boolean;
  /** Solo quello che vale per questa replica e non per tutte. */
  tags: string[];
}

export interface HeroShowtimeDay {
  dayLabel: string;
  shows: HeroShowtime[];
}

export interface HeroLanguage {
  language: string;
  subtitles: string;
}

const norm = (value?: string | null) => (value || '').trim().toLowerCase();

function hasSubtitles(subtitles?: string | null): boolean {
  const s = norm(subtitles);
  return s !== '' && s !== 'nessuno';
}

/** Le stesse sigle di LanguageBadge: ITA, ENG, V.O. */
function shortLanguage(lang: string): string {
  const l = norm(lang);
  if (l === 'italiano' || l === 'ita') return 'ITA';
  if (l === 'francese' || l === 'fra') return 'FRA';
  if (l === 'inglese' || l === 'eng' || l === 'english') return 'ENG';
  if (l === 'giapponese' || l === 'jpn' || l === 'gia') return 'GIA';
  if (l === 'lingua originale' || l === 'originale') return 'V.O.';
  return lang.trim().toUpperCase().substring(0, 3);
}

function displayLanguage(lang: string): string {
  const l = norm(lang);
  if (l === 'ita' || l === 'italiano') return 'ITALIANO';
  if (l === 'fra' || l === 'francese') return 'FRANCESE';
  if (l === 'eng' || l === 'inglese' || l === 'english') return 'INGLESE';
  if (l === 'gia' || l === 'jpn' || l === 'giapponese') return 'GIAPPONESE';
  if (l === 'lingua originale' || l === 'originale') return 'V.O.';
  return getFullLanguageName(lang.trim()).toUpperCase();
}

/** "V.O. · SOTT. ITA · 3D": la lingua come si scrive nella riga dei dati. */
export function languageLabel(language?: string, subtitles?: string, version?: string): string {
  const parts: string[] = [];
  if (language && language.trim()) parts.push(displayLanguage(language));
  if (subtitles && hasSubtitles(subtitles)) parts.push(`SOTT. ${shortLanguage(subtitles)}`);
  if (version && version.trim() && version !== 'Versione Originale') parts.push(version.trim().toUpperCase());
  return parts.join(' · ');
}

/**
 * La lingua da scrivere nell'hero. La home legge la lingua dalla singola
 * proiezione (`metaLingua`): se tutti gli spettacoli dicono la stessa cosa vale
 * quella, altrimenti quella della scheda film, e le differenze si leggono
 * accanto ai singoli orari.
 */
export function heroLanguage(subevents: SubeventLike[], fallback: HeroLanguage): HeroLanguage {
  const first = subevents[0];
  if (!first || !norm(first.language)) return fallback;
  const same = subevents.every(
    s => norm(s.language) === norm(first.language) && norm(s.subtitles) === norm(first.subtitles)
  );
  return same ? { language: first.language || '', subtitles: first.subtitles || '' } : fallback;
}

/**
 * Gli spettacoli raggruppati per giorno, nell'ordine in cui arrivano (la query
 * della home li ordina già per data). `commonSpecs` sono le specifiche che
 * valgono per tutte le repliche: stanno nella riga dei dati, non qui.
 */
export function showtimeDays(
  subevents: SubeventLike[],
  lang: HeroLanguage,
  commonSpecs: unknown
): HeroShowtimeDay[] {
  const nextId = subevents.find(s => !s.isSoldOut)?.id;
  const common = new Set(normalizeProjectionSpecs(commonSpecs));
  const days: HeroShowtimeDay[] = [];

  for (const s of subevents) {
    const tags: string[] = [];
    if (s.language && norm(s.language) && norm(s.language) !== norm(lang.language)) {
      tags.push(shortLanguage(s.language));
    }
    if (s.subtitles && hasSubtitles(s.subtitles) && norm(s.subtitles) !== norm(lang.subtitles)) {
      tags.push(`SOTT. ${shortLanguage(s.subtitles)}`);
    }
    for (const code of normalizeProjectionSpecs(s.specs)) {
      if (!common.has(code)) tags.push(projectionSpec(code)!.publicLabel);
    }
    const note = (s.specsNote || '').trim();
    if (note) tags.push(note.toUpperCase());

    const show: HeroShowtime = {
      id: s.id,
      time: s.timeLabel || formatShowTime(s.date),
      isSoldOut: !!s.isSoldOut,
      isNext: s.id === nextId,
      tags,
    };
    const dayLabel = s.dayLabel || formatShowDayLabel(s.date);
    const last = days[days.length - 1];
    if (last && last.dayLabel === dayLabel) last.shows.push(show);
    else days.push({ dayLabel, shows: [show] });
  }
  return days;
}

/** Il bottone "Prenota …": oggi basta l'ora, un altro giorno serve anche il giorno. */
export function bookLabel(days: HeroShowtimeDay[]): { id: number; label: string } | null {
  for (const day of days) {
    const show = day.shows.find(s => s.isNext);
    if (show) return { id: show.id, label: day.dayLabel === 'Oggi' ? show.time : `${day.dayLabel} ${show.time}` };
  }
  return null;
}

/**
 * Il premio da scrivere in cima all'hero: solo un premio vinto, e fra più
 * premi quello del festival più prestigioso. Le candidature restano nella
 * colonna dei loghi.
 */
export function mainAwardLabel(
  awards?: { type?: string; details?: string | null; year?: number | null }[]
): string | null {
  let best: { text: string; prestige: number } | null = null;
  for (const award of awards || []) {
    const { text, rank } = awardHighlight(award);
    if (rank < 2 || !text) continue;
    const i = FESTIVAL_PRESTIGE.indexOf(resolveFestival(award.type || '').key);
    const prestige = i === -1 ? FESTIVAL_PRESTIGE.length : i;
    if (!best || prestige < best.prestige) best = { text, prestige };
  }
  return best ? best.text : null;
}

/**
 * `?film=<tmdbId>`: il film da cui parte l'hero. Serve ai vecchi link della
 * pagina film, che ora portano alla home. Un film che non è in programmazione
 * si ignora.
 */
export function pickInitialMovieId(
  movies: { id: number }[],
  film?: string | string[] | null
): number | null {
  const raw = Array.isArray(film) ? film[0] : film;
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return movies.some(m => m.id === id) ? id : null;
}
