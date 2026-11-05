// interesse.js — lærer av hva Påby faktisk har godkjent og avslått, og
// gir hvert nytt collector-funn en interesse-score (0–100) + grunner.
// Ren modul: ingen DB, ingen fetch. Treningsdata hentes i
// store/laering.js, og modellen trenes på nytt ved HVER kjøring — det
// finnes ingen lagret modell som kan gli fra beslutningene.
//
// Modellen er bevisst enkel og forklarbar (glattet naiv Bayes over noen få
// egenskaper), ikke en svart boks: hver score kommer med de 3 egenskapene
// som trakk mest opp eller ned, f.eks. «sted:bla +1.4» eller
// «ord:quiz −0.9». Med lite data sier den heller ingenting (score = null)
// enn å late som.
//
// Positive eksempler: alt som er publisert (events) + triagert fra Fra API.
// Negative eksempler: avslått av en person — UNNTATT avslag som ikke sier
// noe om smak (duplikat, mangler info, passert dato).
//
// Bakgrunn: alt API-ene leverer som ingen har tatt stilling til ennå
// (ventende collector-funn) teller som et SVAKT «sannsynligvis ikke valgt»
// (BAKGRUNNSVEKT). Det gir agenten en bias mot det Påby har publisert før
// fra første kjøring — «ligner dette det vi pleier å ta med, sammenlignet
// med alt som finnes der ute?» — uten å vente på avslag. Ekte avslag
// teller fullt og overtar etter hvert.

import { osloKomponenter } from '../../js/application/oslo-tid.js';
import { tittelOrd, normaliserTekst } from './likhet.js';
import { stedSlug } from './kvalitet.js';

export const AVSLAGSGRUNNER = {
  'ikke-relevant':   { tekst: 'Ikke Påby',               lærer: true },
  'for-kommersielt': { tekst: 'For stort / kommersielt', lærer: true },
  'utenfor-oslo':    { tekst: 'Utenfor Oslo',            lærer: true },
  'duplikat':        { tekst: 'Duplikat',                lærer: false },
  'mangler-info':    { tekst: 'Mangler info',            lærer: false },
  'passert':         { tekst: 'Passert',                 lærer: false },
};

export function erGyldigAvslagsgrunn(grunn) {
  return Object.hasOwn(AVSLAGSGRUNNER, grunn);
}

// Under dette sier modellen ingenting — for få beslutninger til at et tall
// betyr noe. Samme tankegang som MIN_UTVALG_FOR_RATE i review/insight.js.
export const MIN_BESLUTNINGER = 12;

// Lært «hold ute»-regel: et sted eller tittelord som er avslått minst så
// mange ganger av en person, og ALDRI godkjent. Bakgrunnsfunn teller ikke —
// at Påby ennå ikke har tatt med noe fra et sted er ikke et avslag.
export const HOLD_UTE_MIN_AVSLAG = 5;

// Hvor mye ett ventende, ubehandlet funn teller som negativt eksempel,
// sammenlignet med ett ekte avslag (1). Lav, fordi mange av dem ville
// blitt valgt hvis noen hadde sett på dem.
export const BAKGRUNNSVEKT = 0.3;

// Naiv Bayes teller samme signal flere ganger når egenskaper henger
// sammen (sted ↔ kategori ↔ kilde). Gruppevekter demper det; ord-gruppen
// gjennomsnittes i stedet for å summeres, så lange titler ikke dominerer.
const GRUPPEVEKT = {
  sted: 1.0,
  ord: 1.0,
  kategori: 0.7,
  kilde: 0.5,
  pris: 0.5,
  ukedag: 0.3,
  tid: 0.3,
};

const UKEDAGER = ['son', 'man', 'tir', 'ons', 'tor', 'fre', 'lor'];

function prisBøtte(pris) {
  if (pris == null) return 'ukjent';
  if (pris === 0) return 'gratis';
  if (pris <= 200) return 'lav';
  if (pris <= 500) return 'middels';
  return 'hoy';
}

function tidBøtte(time) {
  if (time >= 22 || time < 5) return 'sen';
  if (time >= 17) return 'kveld';
  return 'dag';
}

/**
 * @param {Object} event     påby-eventform (tittel, sted, kategori, pris, start)
 * @param {{ provider?: string|null }} [valg]
 * @returns {string[]}  f.eks. ['sted:bla', 'kilde:ticketmaster', 'ord:jazz', …]
 */
export function trekkUtEgenskaper(event, { provider = null } = {}) {
  const e = event ?? {};
  const ut = [];

  if (e.sted) ut.push(`sted:${stedSlug(e.sted)}`);
  if (provider) ut.push(`kilde:${provider}`);
  if (e.kategori) ut.push(`kategori:${e.kategori}`);
  ut.push(`pris:${prisBøtte(typeof e.pris === 'number' ? e.pris : null)}`);

  const start = e.start ? new Date(e.start) : null;
  if (start && !Number.isNaN(start.getTime())) {
    const k = osloKomponenter(start);
    ut.push(`ukedag:${UKEDAGER[k.ukedag]}`);
    ut.push(`tid:${tidBøtte(k.time)}`);
  }

  for (const ord of new Set(tittelOrd(e.tittel).filter((o) => o.length >= 3).slice(0, 8))) {
    ut.push(`ord:${ord}`);
  }

  return ut;
}

/**
 * Hva sier en beslutning om smak?
 *
 * @param {{ status: string, rejectReason?: string|null, reviewedAt?: string|Date|null, start?: string|null }} rad
 * @returns {'positiv'|'negativ'|null}  null = ikke et læringseksempel
 */
export function merkUtfall({ status, rejectReason = null, reviewedAt = null, start = null }) {
  if (status === 'approved' || status === 'triaged' || status === 'published') return 'positiv';
  if (status !== 'rejected') return null;

  if (rejectReason && AVSLAGSGRUNNER[rejectReason] && !AVSLAGSGRUNNER[rejectReason].lærer) return null;

  // Avslag gjort ETTER at eventet startet er nesten alltid «Avslå alle
  // passerte»-opprydding (også fra før reject_reason fantes), ikke en
  // vurdering av eventet.
  if (reviewedAt && start && new Date(reviewedAt) > new Date(start)) return null;

  return 'negativ';
}

/**
 * @param {{ egenskaper: string[], utfall: 'positiv'|'negativ', bakgrunn?: boolean }[]} eksempler
 *   bakgrunn: true = ubehandlet funn, teller som negativt med BAKGRUNNSVEKT
 * @returns {{ pos: number, neg: number, telling: Map, antall: { med: number, avslått: number, bakgrunn: number } }}
 *   pos/neg er VEKTEDE summer (brukes i sannsynlighetene); telling[f].avvist
 *   er antall EKTE avslag (brukes av hold-ute-regelen).
 */
export function trenModell(eksempler) {
  const telling = new Map();
  const antall = { med: 0, avslått: 0, bakgrunn: 0 };
  let pos = 0;
  let neg = 0;

  for (const { egenskaper, utfall, bakgrunn = false } of eksempler) {
    if (utfall !== 'positiv' && utfall !== 'negativ') continue;
    const vekt = bakgrunn ? BAKGRUNNSVEKT : 1;
    if (utfall === 'positiv') pos += vekt; else neg += vekt;
    if (bakgrunn) antall.bakgrunn++;
    else if (utfall === 'positiv') antall.med++;
    else antall.avslått++;

    for (const f of new Set(egenskaper)) {
      const t = telling.get(f) ?? { pos: 0, neg: 0, avvist: 0 };
      t[utfall === 'positiv' ? 'pos' : 'neg'] += vekt;
      if (utfall === 'negativ' && !bakgrunn) t.avvist++;
      telling.set(f, t);
    }
  }

  return { pos, neg, telling, antall };
}

function gruppe(egenskap) {
  return egenskap.slice(0, egenskap.indexOf(':'));
}

function bidrag(t, modell) {
  const α = 1;
  const n = t.pos + t.neg;
  const lr = Math.log((t.pos + α) / (modell.pos + 2 * α)) - Math.log((t.neg + α) / (modell.neg + 2 * α));
  // Én observasjon skal ikke kunne snu et event — tilliten vokser med n.
  return lr * (n / (n + 3));
}

/**
 * @returns {{ score: number|null, grunner: { egenskap: string, vekt: number }[] }}
 */
export function scorEvent(egenskaper, modell) {
  // Krever nok EKTE beslutninger (publisert/triagert/avslått) — bakgrunn
  // alene kan aldri gi en score — og noe å sammenligne med på begge sider.
  const ekte = modell ? (modell.antall?.med ?? modell.pos) + (modell.antall?.avslått ?? modell.neg) : 0;
  if (!modell || ekte < MIN_BESLUTNINGER || modell.pos === 0 || modell.neg === 0) {
    return { score: null, grunner: [] };
  }

  const perGruppe = new Map();
  for (const f of new Set(egenskaper)) {
    const t = modell.telling.get(f);
    if (!t) continue; // aldri sett før — sier ingenting, verken opp eller ned
    const g = gruppe(f);
    const liste = perGruppe.get(g) ?? [];
    liste.push({ egenskap: f, vekt: bidrag(t, modell) * (GRUPPEVEKT[g] ?? 0.3) });
    perGruppe.set(g, liste);
  }

  // Nøytral prior (ikke ln(pos/neg)): 50 = ingen signal, over 50 = ligner
  // det Påby har tatt med. Rekkefølgen blir den samme uansett, men tallet
  // betyr det samme selv om historikken er skjev (f.eks. 64 kuraterte
  // seed-events og få avslag).
  let logit = 0;
  const alleBidrag = [];
  for (const [g, liste] of perGruppe) {
    const sum = liste.reduce((s, b) => s + b.vekt, 0);
    if (g === 'ord') {
      const snitt = sum / liste.length;
      logit += snitt;
      for (const b of liste) alleBidrag.push({ egenskap: b.egenskap, vekt: b.vekt / liste.length });
    } else {
      logit += sum;
      alleBidrag.push(...liste);
    }
  }

  const score = Math.round(100 / (1 + Math.exp(-logit)));
  const grunner = alleBidrag
    .filter((b) => Math.abs(b.vekt) >= 0.05)
    .sort((a, b) => Math.abs(b.vekt) - Math.abs(a.vekt))
    .slice(0, 3)
    .map((b) => ({ egenskap: b.egenskap, vekt: Math.round(b.vekt * 100) / 100 }));

  return { score, grunner };
}

/**
 * Skal agenten holde dette eventet ute av «Fra API»? Manuelle regler
 * (config/kuratering.js) vinner over lærte; ALLTID_MED vinner over alt.
 *
 * @param {Object}   event
 * @param {string[]} egenskaper  fra trekkUtEgenskaper()
 * @param {Object}   modell      fra trenModell()
 * @param {{ holdUte?: { steder?: string[], ord?: string[] }, alltidMed?: { steder?: string[], ord?: string[] } }} regler
 * @returns {string|null}  lesbar grunn, eller null = vis som vanlig
 */
export function finnHoldUteGrunn(event, egenskaper, modell, regler = {}) {
  const tittel = ` ${normaliserTekst(event?.tittel)} `;
  const sted = stedSlug(event?.sted);
  const treffer = ({ steder = [], ord = [] } = {}) =>
    steder.find((s) => stedSlug(s) === sted && sted !== '') ??
    ord.find((o) => tittel.includes(` ${normaliserTekst(o)} `));

  if (treffer(regler.alltidMed)) return null;

  const manuell = treffer(regler.holdUte);
  if (manuell) return `regel: «${manuell}»`;

  for (const f of egenskaper) {
    const g = gruppe(f);
    if (g !== 'sted' && g !== 'ord') continue;
    const t = modell?.telling.get(f);
    if (t && t.pos === 0 && (t.avvist ?? 0) >= HOLD_UTE_MIN_AVSLAG) {
      return `lært: ${f} avslått ${t.avvist}×, aldri godkjent`;
    }
  }
  return null;
}

// Grensene for agentens tre grupper i «Fra API». Satt etter fordelingen på
// ekte data (2026-11-04, 137 events neste 14 dager): ≥ 40 gir ~4 i
// utvalget per dag. Scoren ligger lavt fordi API-bakgrunnen er stor
// sammenlignet med Påbys egen historikk — juster her hvis utvalget blir
// for smalt eller bredt.
export const VALGT_FRA_SCORE = 40;
export const USIKKER_FRA_SCORE = 25;

// Før en person har avslått så mange events selv, bygger scoren bare på
// tidligere publiserte events mot bakgrunnen — nok til å sortere, ikke nok
// til å legge noe til side. Lav score havner da i «usikker», og bare
// regler kan gi «ikke-valgt».
export const MIN_AVSLAG_FOR_BORTVALG = 5;

/**
 * Hvilken gruppe agenten plasserer et ventende funn i.
 *
 *   valgt      — score ≥ 40, lagt i utvalget manuelt, eller ingen score
 *                ennå (uten modell skjuler agenten ingenting)
 *   usikker    — score 25–39
 *   ikke-valgt — score < 25 (når nok er avslått, se MIN_AVSLAG_FOR_BORTVALG),
 *                eller holdt ute av en regel
 *
 * @param {{ score?: number|null, holdtUte?: string|null, inkludertManuelt?: boolean, antallAvslag?: number }} v
 *   antallAvslag: ekte avslag som lærer agenten noe (se merkUtfall)
 * @returns {'valgt'|'usikker'|'ikke-valgt'}
 */
export function agentensValg({ score = null, holdtUte = null, inkludertManuelt = false, antallAvslag = Infinity }) {
  if (inkludertManuelt) return 'valgt';
  if (holdtUte) return 'ikke-valgt';
  if (typeof score !== 'number') return 'valgt';
  if (score >= VALGT_FRA_SCORE) return 'valgt';
  if (score >= USIKKER_FRA_SCORE || antallAvslag < MIN_AVSLAG_FOR_BORTVALG) return 'usikker';
  return 'ikke-valgt';
}
