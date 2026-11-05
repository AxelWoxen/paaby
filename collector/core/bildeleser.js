// bildeleser.js — leser eventbildet (plakat/flyer) med en bildemodell i
// Azure AI Foundry (OpenAI Responses API) og fyller inn
// informasjonen kilden ikke oppga: starttid, sted, adresse og pris.
// Beskrivelse leses bevisst IKKE: i test gjentok modellen bare dato og
// tittel fra plakaten, ofte på engelsk — det gir ikke et bedre kort.
//
// Koster penger per bilde, derfor strenge regler for HVEM som leses
// (skalLeseBilde) og at hvert event leses høyst én gang (se
// store/bildelesing.js og 013_bildelesing.sql). Resten av filen er rene
// funksjoner som kan testes uten API.

// Navnet på deployment-en i Foundry-ressursen. Kan overstyres med
// BILDELESER_MODELL.
export const STANDARD_MODELL = 'gpt-5.4-mini';

/** Er det satt opp nøkkel og endepunkt? Uten dem hoppes bildelesing over. */
export function harBildeleser(env = process.env) {
  return Boolean(env.AIFOUNDRY_API_KEY && env.FOUNDRY_ENDPOINT);
}

// Felt fra core/kvalitet.js:manglendeFeltnavn som et bilde realistisk kan
// inneholde. Koordinater, lenke og bilde kan ikke leses av en plakat.
const FELT_FRA_BILDE = ['start', 'sted', 'adresse', 'pris'];

const HAR_TIDSSONE = /Z$|[+-]\d{2}:\d{2}$/;

function tom(verdi) {
  return verdi === null || verdi === undefined || (typeof verdi === 'string' && verdi.trim() === '');
}

export function feltSomKanLesesFraBilde(mangler = []) {
  return FELT_FRA_BILDE.filter((f) => mangler.includes(f));
}

/**
 * Bare NYE funn (fra denne kjøringen) som agenten faktisk anbefaler —
 * ikke «usikre», ikke «ikke valgt», og ikke når agenten mangler modell
 * (score null betyr at ingenting er vurdert, ikke at det er anbefalt).
 *
 * @param {Object} e  rad fra run.js:scorVentendePåNytt ({ id, valg, score, bilde, mangler, … })
 * @param {Set<string>} nyeIder  candidate-UUID-er opprettet i denne kjøringen
 */
export function skalLeseBilde(e, nyeIder) {
  return Boolean(
    e
    && nyeIder?.has(e.id)
    && e.valg === 'valgt'
    && e.score != null
    && !tom(e.bilde)
    && feltSomKanLesesFraBilde(e.mangler).length > 0,
  );
}

// Det modellen skal svare med. null = står ikke i bildet.
const SVAR_SKJEMA = {
  type: 'object',
  properties: {
    start: { type: ['string', 'null'], description: 'ISO 8601 med tidssone, f.eks. 2026-11-12T20:00:00+01:00' },
    sted: { type: ['string', 'null'], description: 'Navn på scene/lokale' },
    adresse: { type: ['string', 'null'], description: 'Gateadresse, gjerne med postnummer og by' },
    pris: { type: ['number', 'null'], description: 'Laveste ordinære billettpris i NOK' },
    prisTekst: { type: ['string', 'null'], description: 'Pris som tekst når den ikke er ett tall, f.eks. «Gratis» eller «150–250 kr»' },
  },
  required: ['start', 'sted', 'adresse', 'pris', 'prisTekst'],
  additionalProperties: false,
};

export function lagPrompt(event, felt) {
  return [
    `Dette er bildet til eventet «${event.tittel}»${event.start ? ` (${event.start})` : ''}${event.sted ? ` på ${event.sted}` : ''}.`,
    `Vi mangler: ${felt.join(', ')}.`,
    'Les KUN det som faktisk står i bildet. Gjett aldri — sett null for alt som ikke står der, også for felt vi ikke mangler.',
    'Tider er i Oslo-tid: bruk +01:00 om vinteren og +02:00 om sommeren. Står det bare dato uten klokkeslett, sett start til null.',
    'Hører bildet tydelig til et annet event enn tittelen over, sett alt til null.',
  ].join('\n');
}

/**
 * Validerer modellens svar og fyller KUN felt som mangler — overskriver
 * aldri noe kilden faktisk oppga (samme regel som berikFraKjentSted).
 *
 * @returns {{ event: Object, fylt: string[] }}
 */
export function flettInnFraBilde(event, funn) {
  if (!funn || typeof funn !== 'object') return { event, fylt: [] };
  const ut = { ...event };
  const fylt = [];
  const tekst = (v, maks) => (typeof v === 'string' && v.trim() && v.trim().length <= maks ? v.trim() : null);

  if (tom(ut.start) || !HAR_TIDSSONE.test(ut.start)) {
    const start = tekst(funn.start, 40);
    if (start && HAR_TIDSSONE.test(start) && !Number.isNaN(new Date(start).getTime())) {
      ut.start = start;
      fylt.push('start');
    }
  }

  const sted = tekst(funn.sted, 120);
  if (tom(ut.sted) && sted) { ut.sted = sted; fylt.push('sted'); }

  const adresse = tekst(funn.adresse, 200);
  if (tom(ut.adresse) && adresse) { ut.adresse = adresse; fylt.push('adresse'); }

  if (ut.pris == null && tom(ut.prisTekst)) {
    const pris = funn.pris;
    const prisTekst = tekst(funn.prisTekst, 80);
    if (typeof pris === 'number' && Number.isFinite(pris) && pris >= 0 && pris < 100000) {
      ut.pris = pris;
      fylt.push('pris');
    } else if (prisTekst) {
      ut.prisTekst = prisTekst;
      fylt.push('pris');
    }
  }


  return { event: ut, fylt };
}

/** Henter teksten ut av et svar fra Responses API (null ved avslag). */
export function tekstFraSvar(svar) {
  for (const del of svar?.output ?? []) {
    if (del.type !== 'message') continue;
    for (const c of del.content ?? []) {
      if (c.type === 'refusal') return null;
      if (c.type === 'output_text' && c.text) return c.text;
    }
  }
  return null;
}

/**
 * Ett kall til bildemodellen. Kaster ved HTTP-feil; returnerer null hvis
 * modellen avslo eller svaret ikke var gyldig JSON.
 *
 * @param {Object} event
 * @param {string[]} felt  fra feltSomKanLesesFraBilde
 */
export async function lesBilde(event, felt, {
  env = process.env,
  modell = env.BILDELESER_MODELL || STANDARD_MODELL,
  hent = fetch,
} = {}) {
  const res = await hent(env.FOUNDRY_ENDPOINT, {
    method: 'POST',
    headers: { 'api-key': env.AIFOUNDRY_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: modell,
      max_output_tokens: 4000,
      reasoning: { effort: 'low' },
      text: {
        format: { type: 'json_schema', name: 'eventinfo', strict: true, schema: SVAR_SKJEMA },
      },
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: lagPrompt(event, felt) },
          { type: 'input_image', image_url: event.bilde },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const detaljer = (await res.text()).slice(0, 300);
    throw new Error(`bildemodell svarte ${res.status}: ${detaljer}`);
  }
  const tekst = tekstFraSvar(await res.json());
  if (!tekst) return null;
  try {
    return JSON.parse(tekst);
  } catch {
    return null;
  }
}
