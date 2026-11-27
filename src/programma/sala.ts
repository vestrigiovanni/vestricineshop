import prisma from '@/lib/prisma';
import { pretix, quote, sale, spettacoli } from '@/biglietteria/pretix';
import { ITEM_INTERO_ID, ITEM_VIP_ID, commentoPerPretix, nomeDi, type SottoeventoPretix } from '@/biglietteria/regole';
import { romeClock, romeDate, romeToMs, romeWallToMs } from './motore/rome';
import { CLOSING_MINUTE, MIN_GAP_MINUTES, OPENING_MINUTE } from './motore/times';

/**
 * La sala su Pretix: leggere gli spettacoli di una sala, crearli, spostarli,
 * cancellarli. Dalla v1 (`adminScheduleMovie`, `adminDeleteEvent`,
 * `adminUpdateEventDate`, `getBlockedIntervals`), solo dal server.
 *
 * Qui le scritture su Pretix sono **vere**: ogni funzione che scrive è chiamata
 * solo dopo una conferma di Gio (Manda in sala, Sposta, Elimina) o dall'app.
 */

/** Gli spettacoli futuri di tutte le sale, come li dà Pretix. */
export const spettacoliFuturi = (dalVivo = false) => spettacoli({ futuri: true, dalVivo });

/** Le sale, con il nome che hanno su Pretix. Le sale di prova restano fuori. */
export async function saleDelCinema(): Promise<{ id: number; name: string; isFavorite: boolean }[]> {
  const nomi = await sale();
  return Object.entries(nomi)
    .map(([id, name]) => ({ id: Number(id), name, isFavorite: false }))
    .sort((a, b) => a.name.localeCompare(b.name, 'it'));
}

/** I metadati JSON che lo spettacolo si porta nel commento. */
export function metaDi(se: Pick<SottoeventoPretix, 'comment'>): { runtime?: number; tmdbId?: string } {
  if (typeof se.comment !== 'string') return {};
  try {
    const m = JSON.parse(se.comment);
    return m && typeof m === 'object' ? m : {};
  } catch {
    return {};
  }
}

/** Quanti biglietti pagati ci sono su uno spettacolo. Dal vivo: una risposta vecchia farebbe danni. */
export async function bigliettiVenduti(id: number): Promise<number> {
  const d = await pretix<{ count?: number }>(`/orderpositions/?subevent=${id}&order__status=p&limit=1`, {}, { dalVivo: true });
  return typeof d?.count === 'number' ? d.count : 0;
}

export const quoteDi = quote;

export interface Bloccato {
  start: number;
  end: number;
  title: string;
  runtime: number;
}

/**
 * Gli intervalli già occupati in una sala, in millisecondi, con la pausa già
 * aggiunta in fondo. La durata: i metadati dello spettacolo, poi la scheda nel
 * database, poi 120 minuti (prudente). Un `date_to` più lungo vince.
 */
export async function intervalliOccupati(salaId: number): Promise<Bloccato[]> {
  const miei = (await spettacoliFuturi(true)).filter(e => e.active === true && Number(e.seating_plan) === salaId);
  const mancano = [...new Set(miei.map(metaDi).filter(m => !m.runtime && m.tmdbId).map(m => m.tmdbId!))];
  const durate = new Map<string, number>();
  if (mancano.length) {
    const righe = await prisma.movieOverride.findMany({ where: { tmdbId: { in: mancano }, runtime: { not: null } }, select: { tmdbId: true, runtime: true } });
    for (const r of righe) durate.set(r.tmdbId, r.runtime!);
  }
  return miei.map(e => {
    const s = new Date(e.date_from).getTime();
    const m = metaDi(e);
    const runtime = m.runtime || (m.tmdbId ? durate.get(m.tmdbId) : undefined) || 120;
    let fine = s + runtime * 60_000;
    if (e.date_to) fine = Math.max(fine, new Date(e.date_to).getTime());
    return { start: s, end: fine + MIN_GAP_MINUTES * 60_000, title: nomeDi(e), runtime };
  });
}

// ─── La pianta della sala ─────────────────────────────────────────────────

interface Posto { category?: string; type?: string }
export interface Pianta { layout?: { zones?: { rows?: { seats?: Posto[] }[] }[]; objects?: Posto[]; categories?: { name?: string }[] } }

const vip = (nome?: string) => /VIP|POLTRONA/i.test(nome ?? '');

export function piantaDi(salaId: number): Promise<Pianta | null> {
  return pretix<Pianta>(`/organizers/vestri/seatingplans/${salaId}/`).catch(() => null);
}

/** Quanti posti normali e poltrone VIP ha la pianta. */
export function capienze(p: Pianta | null): { intero: number; vip: number } {
  let intero = 0;
  let poltrone = 0;
  const conta = (c?: string) => (vip(c) ? poltrone++ : intero++);
  p?.layout?.zones?.forEach(z => z.rows?.forEach(r => r.seats?.forEach(s => conta(s.category))));
  p?.layout?.objects?.forEach(o => { if (o.type === 'seat' || o.category) conta(o.category); });
  return { intero, vip: poltrone };
}

/**
 * Quale prodotto vende ogni categoria di posto. Solo le categorie che hanno
 * davvero dei posti: Pretix risponde 500 se se ne nomina una vuota.
 */
export function categorie(p: Pianta | null): Record<string, number> {
  const conPosti = new Set<string>();
  p?.layout?.zones?.forEach(z => z.rows?.forEach(r => r.seats?.forEach(s => { if (s.category) conPosti.add(s.category); })));
  p?.layout?.objects?.forEach(o => { if ((o.type === 'seat' || !o.type) && o.category) conPosti.add(o.category); });
  if (conPosti.size === 0) {
    const c = capienze(p);
    for (const k of p?.layout?.categories ?? []) {
      if (!k.name) continue;
      if (vip(k.name) ? c.vip > 0 : c.intero > 0) conPosti.add(k.name);
    }
  }
  const mappa: Record<string, number> = {};
  for (const nome of conPosti) mappa[nome] = vip(nome) ? ITEM_VIP_ID : ITEM_INTERO_ID;
  if (!Object.keys(mappa).length) mappa.INTERO = ITEM_INTERO_ID;
  return mappa;
}

// ─── Creare ───────────────────────────────────────────────────────────────

export interface DaCreare {
  tmdbId: string;
  /** Data di calendario e ora di Roma. */
  data: string;
  ora: string;
  salaId: number;
  /** Il titolo se la scheda del film non c'è ancora. */
  titolo: string;
  /** La durata se la scheda non ce l'ha. */
  durata?: number;
  /** La sala e i fratelli del piano, letti una volta per lotto. */
  bloccati: Bloccato[];
  pianta: Pianta | null;
  /** Consenso a uscire dall'orario d'apertura (e solo da quello). */
  fuoriOrario?: boolean;
}

/**
 * Crea uno spettacolo su Pretix, a 0 € con le sue quote. I controlli sono
 * quelli della v1: l'orario d'apertura (salvo consenso) e nessuna
 * sovrapposizione, pausa compresa. Risponde con l'id Pretix.
 */
export async function creaSpettacolo(c: DaCreare): Promise<number> {
  const scheda = await prisma.movieOverride.findUnique({ where: { tmdbId: c.tmdbId }, include: { awards: true } });
  const durata = scheda?.runtime || c.durata || 120;
  const titolo = (scheda?.customTitle && scheda.customTitle !== 'Caricamento...' ? scheda.customTitle : '') || c.titolo;

  const inizio = romeWallToMs(c.data, c.ora);
  const fine = inizio + durata * 60_000;
  const fineConPausa = fine + MIN_GAP_MINUTES * 60_000;

  if (!c.fuoriOrario) {
    const giorno = romeDate(inizio);
    if (inizio < romeToMs(giorno, OPENING_MINUTE)) throw new Error('Orario non consentito: il primo spettacolo non può iniziare prima delle 10:00.');
    if (fine > romeToMs(giorno, CLOSING_MINUTE)) {
      throw new Error(`Orario non consentito: l'ultimo spettacolo deve terminare entro l'01:00 (il film terminerebbe alle ${romeClock(fine)}).`);
    }
  }
  const scontro = c.bloccati.find(b => inizio < b.end && fineConPausa > b.start);
  if (scontro) throw new Error(`Conflitto rilevato: l'orario scelto si sovrappone alla proiezione di "${scontro.title}" (incluse pulizie sala).`);

  const base = commentoPerPretix(c.tmdbId, scheda ?? {});
  const commento = {
    ...base,
    runtime: durata,
    tagline: scheda?.tagline ?? '',
    genres: (scheda?.genres ?? []).join(', '),
    year: scheda?.releaseDate?.slice(0, 4) ?? '',
  };
  const lingua = scheda?.versionLanguage?.trim() || 'ITA';
  const sottotitoli = scheda?.subtitles?.trim() || 'NESSUNO';

  const nuovo = await pretix<{ id: number }>('/subevents/', {
    method: 'POST',
    body: JSON.stringify({
      name: { it: titolo },
      active: true,
      is_public: true,
      date_from: new Date(inizio).toISOString(),
      date_to: new Date(fine).toISOString(),
      frontpage_text: { it: `${titolo} - VESTRI CINEMA` },
      comment: JSON.stringify(commento),
      seating_plan: c.salaId,
      meta_data: { lingua, sottotitoli },
      seat_category_mapping: categorie(c.pianta),
    }),
  });

  const { intero, vip: poltrone } = capienze(c.pianta);
  const quota = (name: string, size: number, item: number) =>
    pretix('/quotas/', {
      method: 'POST',
      body: JSON.stringify({ name, size, items: [item], subevent: nuovo.id, close_when_sold_out: false, closed: false, ignore_for_event_availability: false }),
    });
  await Promise.all([
    pretix(`/subevents/${nuovo.id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ subevent_item_overrides: [{ item: ITEM_INTERO_ID, price: '0.00' }, { item: ITEM_VIP_ID, price: '0.00' }] }),
    }),
    intero > 0 || poltrone === 0 ? quota('Quota Intero', intero || 1000, ITEM_INTERO_ID) : null,
    poltrone > 0 ? quota('Quota Poltrona', poltrone, ITEM_VIP_ID) : null,
  ]);
  return nuovo.id;
}

// ─── Cancellare e spostare ────────────────────────────────────────────────

/** Toglie lo spettacolo da Pretix e dal database; se era l'ultimo del film, anche la scheda (come nella v1). */
export async function eliminaSpettacolo(id: number): Promise<void> {
  const riga = await prisma.pretixSync.findUnique({ where: { pretixId: id }, select: { tmdbId: true } });
  await pretix(`/subevents/${id}/`, { method: 'DELETE' });
  try {
    await prisma.pretixSync.delete({ where: { pretixId: id } });
    if (riga?.tmdbId && (await prisma.pretixSync.count({ where: { tmdbId: riga.tmdbId } })) === 0) {
      await prisma.movieOverride.delete({ where: { tmdbId: riga.tmdbId } }).catch(() => null);
    }
  } catch {
    // Già sparito dal database: va bene così.
  }
}

/** Porta lo spettacolo a un'altra data e ora di Roma, con la stessa durata. */
export async function spostaSpettacolo(id: number, data: string, ora: string): Promise<void> {
  const se = await pretix<SottoeventoPretix>(`/subevents/${id}/`, {}, { dalVivo: true });
  const durata = se.date_to ? new Date(se.date_to).getTime() - new Date(se.date_from).getTime() : 120 * 60_000;
  const dal = new Date(romeWallToMs(data, ora));
  const al = new Date(dal.getTime() + durata);
  await pretix(`/subevents/${id}/`, { method: 'PATCH', body: JSON.stringify({ date_from: dal.toISOString(), date_to: al.toISOString() }) });
  await prisma.pretixSync
    .update({ where: { pretixId: id }, data: { dateFrom: dal, dateTo: al, startTime: romeClock(dal), endTime: romeClock(al) } })
    .catch(e => console.error(`[sala] spostamento di ${id} non scritto nel database:`, e));
}
