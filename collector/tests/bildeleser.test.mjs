// bildeleser.test.mjs — bildelesing uten API og uten database: hvem som
// leses, at svaret aldri overskriver kildens data, og at et event aldri
// leses (betales for) mer enn én gang.
//
// Kjør: cd collector && node --test tests/bildeleser.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skalLeseBilde, feltSomKanLesesFraBilde, flettInnFraBilde, tekstFraSvar, lesBilde } from '../core/bildeleser.js';
import { lesBilderForNyeAnbefalte } from '../run.js';

function funn(overrides = {}) {
  return {
    id: 'uuid-1',
    tittel: 'Karpe',
    start: '2026-11-12T20:00:00+01:00',
    sted: null,
    adresse: null,
    pris: null,
    prisTekst: null,
    beskrivelse: 'Konsert',
    bilde: 'https://bilde.no/karpe.jpg',
    valg: 'valgt',
    score: 70,
    mangler: ['sted', 'adresse', 'koordinater', 'pris'],
    ...overrides,
  };
}

const SVAR = { start: null, sted: 'BLÅ', adresse: 'Brenneriveien 9c', pris: 350, prisTekst: null, beskrivelse: null };

test('skalLeseBilde: bare nye, anbefalte funn med bilde og noe å lese', () => {
  const nye = new Set(['uuid-1']);
  assert.equal(skalLeseBilde(funn(), nye), true);
  assert.equal(skalLeseBilde(funn({ valg: 'usikker' }), nye), false);
  assert.equal(skalLeseBilde(funn({ valg: 'ikke-valgt' }), nye), false);
  assert.equal(skalLeseBilde(funn({ score: null }), nye), false, 'uten modell er ingenting anbefalt');
  assert.equal(skalLeseBilde(funn(), new Set()), false, 'funn fra tidligere kjøringer leses ikke');
  assert.equal(skalLeseBilde(funn({ bilde: null }), nye), false);
  assert.equal(skalLeseBilde(funn({ mangler: ['koordinater', 'lenke'] }), nye), false);
});

test('feltSomKanLesesFraBilde: koordinater/lenke/bilde kan ikke leses av en plakat', () => {
  assert.deepEqual(feltSomKanLesesFraBilde(['koordinater', 'pris', 'lenke', 'sted']), ['sted', 'pris']);
});

test('flettInnFraBilde: fyller bare tomme felt, overskriver aldri kilden', () => {
  const { event, fylt } = flettInnFraBilde(
    { sted: 'Rockefeller', adresse: null, pris: null, prisTekst: null, beskrivelse: 'Fra kilden', start: '2026-11-12T20:00:00+01:00' },
    { ...SVAR, beskrivelse: 'Fra bildet', start: '2026-11-13T21:00:00+01:00' },
  );
  assert.equal(event.sted, 'Rockefeller');
  assert.equal(event.beskrivelse, 'Fra kilden');
  assert.equal(event.start, '2026-11-12T20:00:00+01:00');
  assert.equal(event.adresse, 'Brenneriveien 9c');
  assert.equal(event.pris, 350);
  assert.deepEqual(fylt, ['adresse', 'pris']);
});

test('flettInnFraBilde: avviser ugyldige verdier fra modellen', () => {
  const { fylt } = flettInnFraBilde(
    { sted: null, pris: null, prisTekst: null, start: null },
    { start: '12. november', sted: '   ', pris: -5, prisTekst: null, adresse: null, beskrivelse: null },
  );
  assert.deepEqual(fylt, []);
  assert.deepEqual(flettInnFraBilde({ a: 1 }, null), { event: { a: 1 }, fylt: [] });
});

test('flettInnFraBilde: pristekst når prisen ikke er ett tall', () => {
  const { event, fylt } = flettInnFraBilde({ pris: null, prisTekst: null }, { pris: null, prisTekst: 'Gratis' });
  assert.equal(event.prisTekst, 'Gratis');
  assert.deepEqual(fylt, ['pris']);
});

// Falsk database: husker hvilke id-er som er reservert, akkurat som
// UPDATE … WHERE image_read_at IS NULL gjør.
function falskDb() {
  const lest = new Set();
  const lagret = [];
  return {
    lest,
    lagret,
    reserver: async (id) => (lest.has(id) ? false : (lest.add(id), true)),
    lagre: async (id, data) => { lagret.push({ id, ...data }); },
  };
}

test('lesBilderForNyeAnbefalte: leser kun anbefalte, og aldri samme event to ganger', async () => {
  const db = falskDb();
  let kall = 0;
  const les = async () => { kall++; return SVAR; };
  const env = { AIFOUNDRY_API_KEY: 'test', FOUNDRY_ENDPOINT: 'https://x.test/openai/v1/responses' };
  const nyeIder = new Set(['uuid-1', 'uuid-2', 'uuid-3']);
  const lagVentende = () => [
    funn(),
    funn({ id: 'uuid-2', valg: 'usikker' }),
    funn({ id: 'uuid-3', valg: 'ikke-valgt' }),
    funn({ id: 'uuid-gammel' }),
  ];

  const første = await lesBilderForNyeAnbefalte(lagVentende(), { nyeIder, env, les, ...db });
  assert.equal(kall, 1);
  assert.deepEqual(første, { lest: 1, beriket: 1, feil: 0 });
  assert.deepEqual(db.lagret[0].fylt, ['sted', 'adresse', 'pris']);

  // Ny kjøring med samme events: allerede lest → ingen nye kall.
  const andre = await lesBilderForNyeAnbefalte(lagVentende(), { nyeIder, env, les, ...db });
  assert.equal(kall, 1);
  assert.equal(andre.lest, 0);
});

test('lesBilderForNyeAnbefalte: feil i API-kallet prøves ikke på nytt', async () => {
  const db = falskDb();
  let kall = 0;
  const les = async () => { kall++; throw new Error('400 ugyldig bilde'); };
  const env = { AIFOUNDRY_API_KEY: 'test', FOUNDRY_ENDPOINT: 'https://x.test/openai/v1/responses' };
  const nyeIder = new Set(['uuid-1']);

  const r = await lesBilderForNyeAnbefalte([funn()], { nyeIder, env, les, ...db });
  assert.equal(r.feil, 1);
  assert.equal(db.lagret[0].resultat.feil, '400 ugyldig bilde');
  await lesBilderForNyeAnbefalte([funn()], { nyeIder, env, les, ...db });
  assert.equal(kall, 1);
});

test('lesBilderForNyeAnbefalte: uten AIFOUNDRY_API_KEY/FOUNDRY_ENDPOINT kalles ingenting og ingenting reserveres', async () => {
  const db = falskDb();
  let kall = 0;
  const r = await lesBilderForNyeAnbefalte([funn()], {
    nyeIder: new Set(['uuid-1']), env: {}, les: async () => { kall++; }, ...db,
  });
  assert.equal(kall, 0);
  assert.equal(db.lest.size, 0, 'ingenting merket som lest');
  assert.equal(r.lest, 0);
});

test('tekstFraSvar: henter output_text, null ved avslag', () => {
  const svar = (c) => ({ output: [{ type: 'reasoning' }, { type: 'message', content: [c] }] });
  assert.equal(tekstFraSvar(svar({ type: 'output_text', text: '{"a":1}' })), '{"a":1}');
  assert.equal(tekstFraSvar(svar({ type: 'refusal', refusal: 'nei' })), null);
  assert.equal(tekstFraSvar({}), null);
});

test('lesBilde: sender bildet og nøkkelen til endepunktet, kaster ved HTTP-feil', async () => {
  const env = { AIFOUNDRY_API_KEY: 'nøkkel', FOUNDRY_ENDPOINT: 'https://x.test/openai/v1/responses' };
  let sendt;
  const hent = async (url, init) => {
    sendt = { url, init, body: JSON.parse(init.body) };
    return { ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(SVAR) }] }] }) };
  };
  const svar = await lesBilde(funn(), ['sted'], { env, hent });
  assert.deepEqual(svar, SVAR);
  assert.equal(sendt.url, env.FOUNDRY_ENDPOINT);
  assert.equal(sendt.init.headers['api-key'], 'nøkkel');
  assert.equal(sendt.body.model, 'gpt-5.4-mini');
  assert.equal(sendt.body.input[0].content[1].image_url, 'https://bilde.no/karpe.jpg');

  const feiler = async () => ({ ok: false, status: 400, text: async () => 'ugyldig bilde' });
  await assert.rejects(lesBilde(funn(), ['sted'], { env, hent: feiler }), /400/);
});
