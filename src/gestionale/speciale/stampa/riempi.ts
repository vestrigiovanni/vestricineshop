import sharp from 'sharp';
import prisma from '@/lib/prisma';
import { apriZip, cartellaDrive, eZip, idCartellaDrive, risolvi, scarica, type Trovata, type Voce } from './distributori';
import { eImmagine, iBanner, laLocandina, leFoto, misureDalNome, trailerVerticale, type File } from './scegli';

/**
 * Dal materiale trovato alla bozza della stanza "Speciale": scarica solo quello
 * che serve (banner, locandina, foto; mai trailer e DCP), apre zip e cartelle
 * Drive, sceglie, riduce come fa il browser quando trascini (3840 px, JPEG
 * 0,90; i PNG restano PNG) e salva le immagini. Non salva la proiezione: la
 * bozza la controlla Giovanni.
 */

export interface Caricata {
  src: string;
  w: number;
  h: number;
}

export interface DalDistributore {
  distributore: string;
  pagina: string;
  banner: { orizzontale?: Caricata; verticale?: Caricata };
  locandina?: Caricata;
  foto: Caricata[];
  /** Il trailer verticale va ridotto a mano: qui solo dove scaricarlo. */
  trailerVerticale?: string;
  /** Tutti i link della pagina, per il resto (trailer DCP, pressbook…). */
  voci: Voce[];
  avvisi: string[];
}

const LATO = 3840;
const SERVE = /banner|poster|locandina|foto|photo|still|immagini|materiali|press|stampa|web|area|street/i;
/** Trailer, DCP, documenti e i formati da stampa o da social: alla home non servono. */
const MAI = /trailer|teaser|dcp|clip|\bspot\b|video|scheda|pressbook|caption|h264|\bmp4\b|\bmov\b|quad|instagram|feed|social|esec|70.?100|100.?140|140.?200|33.?70/i;

interface Candidato extends File {
  url?: string;
  dati?: Uint8Array;
}

async function datiDi(c: Candidato): Promise<Uint8Array> {
  if (!c.dati) c.dati = (await scarica(c.url!)).dati;
  return c.dati;
}

async function misura(c: Candidato): Promise<void> {
  if (c.w && c.h) return;
  const m = await sharp(await datiDi(c)).metadata();
  if (m.width && m.height) { c.w = m.width; c.h = m.height; }
}

/** Ogni voce utile diventa uno o più candidati: un'immagine, i file di uno zip, una cartella Drive. */
async function candidati(voci: Voce[], avvisi: string[]): Promise<Candidato[]> {
  const utili = voci.filter(v => SERVE.test(v.etichetta) || FILE_IMG.test(v.url));
  const out: Candidato[] = [];
  await Promise.all(utili.map(async v => {
    try {
      const url = await risolvi(v.url);
      const cartella = idCartellaDrive(url);
      if (cartella) {
        for (const f of await cartellaDrive(cartella)) out.push({ percorso: `${v.etichetta}/${f.percorso}`, url: f.url, ...misureDalNome(f.percorso) });
        return;
      }
      if (/dropbox\.com\/(scl\/fo|sh)\//.test(url)) return; // una cartella Dropbox intera: solo il link
      if (FILE_IMG.test(new URL(url).pathname)) {
        const nome = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
        out.push({ percorso: `${v.etichetta}/${nome}`, url, ...misureDalNome(nome) });
        return;
      }
      // Un file Drive (o altro) di cui non si sa cosa sia: lo si scarica e si guarda.
      const s = await scarica(url);
      if (eZip(s)) {
        for (const f of apriZip(s.dati)) out.push({ percorso: `${v.etichetta}/${f.nome}`, dati: f.dati, ...misureDalNome(f.nome) });
      } else if (/^image\//.test(s.tipo) || eImmagine(s.nome)) {
        out.push({ percorso: `${v.etichetta}/${s.nome}`, dati: s.dati, ...misureDalNome(s.nome) });
      }
    } catch (err) {
      avvisi.push(`«${v.etichetta || v.url}»: ${err instanceof Error ? err.message : String(err)}`);
    }
  }));
  return out;
}
const FILE_IMG = /\.(jpe?g|png|webp)(\?|$)/i;

async function salva(c: Candidato): Promise<Caricata> {
  const dati = await datiDi(c);
  const img = sharp(dati, { failOn: 'none' }).rotate();
  const m = await img.metadata();
  const png = m.format === 'png';
  const { data, info } = await img
    .resize({ width: LATO, height: LATO, fit: 'inside', withoutEnlargement: true })
    [png ? 'png' : 'jpeg'](png ? {} : { quality: 90, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const nome = (c.percorso.split('/').pop() || 'immagine').replace(/\.\w+$/, png ? '.png' : '.jpg').slice(0, 200);
  const riga = await prisma.immagineSpeciale.create({
    data: { nome, tipo: png ? 'image/png' : 'image/jpeg', w: info.width, h: info.height, dati: new Uint8Array(data) },
    select: { id: true, w: true, h: true },
  });
  return { src: `/api/speciale/immagine/${riga.id}`, w: riga.w, h: riga.h };
}

/** La scelta, senza salvare niente: banner, locandina e foto fra i file della pagina. */
export async function scegliDalDistributore(t: Trovata, avvisi: string[], quanteFoto = 12) {
  // I formati da stampa (pdf giganti), i quad e i trailer non servono alla home: non si scaricano.
  const voci = t.voci.filter(v => !MAI.test(v.etichetta));
  const tutti = await candidati(voci, avvisi);

  // Banner: si misurano quelli senza misure nel nome (al massimo 30).
  const banner = tutti.filter(c => /banner|cover/i.test(c.percorso));
  await Promise.all(banner.filter(c => !(c.w && c.h)).slice(0, 30).map(c => misura(c).catch(() => {})));
  const b = iBanner(banner);

  let locandina = laLocandina(tutti);
  if (locandina) {
    await misura(locandina).catch(() => {});
    if (locandina.w && locandina.h && locandina.w >= locandina.h) locandina = undefined;
  }

  const foto = leFoto(tutti.filter(c => c !== locandina && c !== b.orizzontale && c !== b.verticale), quanteFoto);
  return { orizzontale: b.orizzontale, verticale: b.verticale, locandina, foto, tutti: tutti.length };
}

export async function riempi(t: Trovata, quanteFoto = 12): Promise<DalDistributore> {
  const avvisi: string[] = [];
  const { orizzontale: bo, verticale: bv, locandina, foto } = await scegliDalDistributore(t, avvisi, quanteFoto);

  const prova = async (c: Candidato | undefined, cosa: string) => {
    if (!c) return undefined;
    try {
      // Icone, miniature e bollini: sotto i 700 px non sono materiale per la home.
      await misura(c);
      if (c.w && c.h && Math.max(c.w, c.h) < 700) return undefined;
      return await salva(c);
    } catch (err) {
      avvisi.push(`${cosa}: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  };
  const [orizzontale, verticale, loc, ...lefoto] = await Promise.all([
    prova(bo, 'banner orizzontale'),
    prova(bv, 'banner verticale'),
    prova(locandina, 'locandina'),
    ...foto.map(f => prova(f, `foto ${f.percorso.split('/').pop()}`)),
  ]);

  const tv = trailerVerticale(t.voci);
  return {
    distributore: t.distributore,
    pagina: t.pagina,
    banner: { orizzontale, verticale },
    locandina: loc,
    foto: lefoto.filter((x): x is Caricata => !!x),
    trailerVerticale: tv ? await risolvi(tv.url).catch(() => tv.url) : undefined,
    voci: t.voci,
    avvisi,
  };
}
