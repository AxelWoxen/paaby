// agent.test.mjs — ren logikktest av agentens byggeklosser: likhet
// (kryss-kilde-dedupe), kvalitet (manglende felt, berikelse fra kjent sted)
// og interesse (egenskaper, læring, score, hold-ute). Ingen database.
//
// Kjør: cd collector && node --test tests/agent.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tittelLikhet, sammeSted, sammenlign } from '../core/likhet.js';
import { finnManglendeFelter, manglendeFeltnavn, berikFraKjentSted, stedSlug } from '../core/kvalitet.js';
import {
  trekkUtEgenskaper, merkUtfall, trenModell, scorEvent, finnHoldUteGrunn, agentensValg,
  MIN_BESLUTNINGER, HOLD_UTE_MIN_AVSLAG,
} from '../core/interesse.js';
import { finnEksisterendeMatch } from '../core/sync.js';
import { lesHorisontDager, innenforHorisont, skrivOppsummering } from '../run.js';

function event(overrides = {}) {
  return {
    id: 'bla-karpe-2026-11-12',
    tittel: 'Karpe',
    kategori: 'musikk',
    sted: 'BLÅ',
    adresse: 'Brenneriveien 9c, 0182 Oslo',
    lat: 59.92035,
    lng: 10.75279,
    start: '2026-11-12T20:00:00+01:00',
    slutt: null,
    pris: 350,
    prisTekst: null,
    beskrivelse: 'Konsert',
    kuratortekst: null,
    lenke: 'https://tm.no/karpe',
    bilde: 'https://bilde.no/karpe.jpg',
    ...overrides,
  };
}

// ─── likhet ─────────────────────────────────────────────────────────────────

test('tittelLikhet: støyord, år og tegnsetting teller ikke', () => {
  assert.equal(tittelLikhet('Karpe', 'KARPE – Utsolgt! 2026'), 1);
  assert.equal(tittelLikhet('Frank Znort Quartet', 'Frank Znort Quartet (live)'), 1);
});

test('tittelLikhet: kort tittel inneholdt i lang teller, men ett kort fellesord gjør det ikke', () => {
  assert.ok(tittelLikhet('Kaizers Orchestra', 'Kaizers Orchestra – Violeta Violeta-turné') >= 0.85);
  assert.ok(tittelLikhet('Jazz', 'Jazz på Blå med Trio X') < 0.85);
  assert.ok(tittelLikhet('Quiz', 'Musikkquiz') < 0.85);
});

test('sammeSted: koordinater vinner, ellers navn med inneholdt-sjekk', () => {
  assert.equal(sammeSted({ lat: 59.9203, lng: 10.7527 }, { lat: 59.9210, lng: 10.7530 }), true);
  assert.equal(sammeSted({ lat: 59.9203, lng: 10.7527 }, { lat: 59.9139, lng: 10.7522 }), false);
  assert.equal(sammeSted({ sted: 'Rockefeller' }, { sted: 'Rockefeller Music Hall' }), true);
  assert.equal(sammeSted({ sted: null }, { sted: null }), null);
});

test('sammenlign: sikker krever samme dag, ≤30 min, lik tittel og samme sted', () => {
  const a = event();
  assert.equal(sammenlign(a, event({ tittel: 'KARPE (Utsolgt)', start: '2026-11-12T20:30:00+01:00' })).nivå, 'sikker');
  assert.equal(sammenlign(a, event({ start: '2026-11-12T22:00:00+01:00' })).nivå, 'lignende'); // to visninger
  assert.equal(sammenlign(a, event({ start: '2026-11-13T20:00:00+01:00' })).nivå, null);       // annen dag
  assert.equal(sammenlign(a, event({ tittel: 'Helt annet band' })).nivå, null);
});

test('finnEksisterendeMatch: kryss bare mot ANNEN kilde — samme kilde blir fuzzy', () => {
  const ny = event({ lenke: 'https://tickster.no/karpe' });
  const fraTicketmaster = { ...event(), _erCandidate: true, _dbId: 'c1', _providere: ['ticketmaster'] };

  assert.equal(finnEksisterendeMatch(ny, [fraTicketmaster], { provider: 'tickster' }).type, 'kryss');
  assert.equal(finnEksisterendeMatch(ny, [fraTicketmaster], { provider: 'ticketmaster' }).type, 'fuzzy');
  assert.equal(finnEksisterendeMatch(ny, [fraTicketmaster]).type, 'fuzzy'); // ukjent kilde → aldri kryss
});

test('finnEksisterendeMatch: lik tittel samme dag, annet klokkeslett → lignende (flagget, ikke koblet)', () => {
  const ny = event({ tittel: 'Karpe – ekstrakonsert', start: '2026-11-12T23:00:00+01:00', lenke: 'https://x.no/2' });
  const eksisterende = [{ ...event(), _erCandidate: true, _dbId: 'c1', _providere: ['ticketmaster'] }];
  assert.equal(finnEksisterendeMatch(ny, eksisterende, { provider: 'tickster' }).type, 'lignende');
});

// ─── kvalitet ───────────────────────────────────────────────────────────────

test('finnManglendeFelter: komplett event mangler kun kuratortekst', () => {
  assert.deepEqual(finnManglendeFelter(event()).map((m) => m.felt), ['kuratortekst']);
  assert.deepEqual(manglendeFeltnavn(event()), []);
});

test('finnManglendeFelter: tom collector-candidate gir viktige felt, og kritisk ved feil tidssone', () => {
  const felt = manglendeFeltnavn(event({
    adresse: null, lat: null, lng: null, bilde: null, pris: null, beskrivelse: null,
  }));
  assert.deepEqual(felt, ['adresse', 'koordinater', 'bilde', 'pris', 'beskrivelse']);

  const kritisk = finnManglendeFelter(event({ start: '2026-11-12T20:00:00' })).filter((m) => m.nivå === 'kritisk');
  assert.deepEqual(kritisk.map((m) => m.felt), ['start']);
});

test('berikFraKjentSted: fyller kun tomme felt, overskriver aldri kilden', () => {
  const kjente = new Map([[stedSlug('BLÅ'), { address: 'Brenneriveien 9c', latitude: 59.92, longitude: 10.75 }]]);

  const { event: beriket, fylt } = berikFraKjentSted(event({ adresse: null, lat: null, lng: null }), kjente);
  assert.deepEqual(fylt, ['adresse', 'koordinater']);
  assert.equal(beriket.lat, 59.92);

  const { event: urørt, fylt: ingenting } = berikFraKjentSted(event({ adresse: 'Kildens adresse' }), kjente);
  assert.deepEqual(ingenting, []);
  assert.equal(urørt.adresse, 'Kildens adresse');
});

test('stedSlug: samme slug som venues.slug for æøå/diakritikk', () => {
  assert.equal(stedSlug('BLÅ'), 'bla');
  assert.equal(stedSlug('Kafé Hærverk'), 'kafe-haerverk');
  assert.equal(stedSlug('Søstrene Karlsen'), 'sostrene-karlsen');
});

// ─── interesse ──────────────────────────────────────────────────────────────

test('trekkUtEgenskaper: sted, kilde, kategori, pris, ukedag, tid og tittelord', () => {
  const f = trekkUtEgenskaper(event({ tittel: 'Jazzjam med Trio Bris' }), { provider: 'tickster' });
  assert.ok(f.includes('sted:bla'));
  assert.ok(f.includes('kilde:tickster'));
  assert.ok(f.includes('kategori:musikk'));
  assert.ok(f.includes('pris:middels'));
  assert.ok(f.includes('ukedag:tor')); // 2026-11-12 er en torsdag
  assert.ok(f.includes('tid:kveld'));
  assert.ok(f.includes('ord:jazzjam') && f.includes('ord:trio') && f.includes('ord:bris'));
  assert.ok(!f.includes('ord:med'));
});

test('merkUtfall: avslag som ikke handler om smak lærer ingenting', () => {
  assert.equal(merkUtfall({ status: 'published' }), 'positiv');
  assert.equal(merkUtfall({ status: 'triaged' }), 'positiv');
  assert.equal(merkUtfall({ status: 'rejected' }), 'negativ');
  assert.equal(merkUtfall({ status: 'rejected', rejectReason: 'ikke-relevant' }), 'negativ');
  assert.equal(merkUtfall({ status: 'rejected', rejectReason: 'duplikat' }), null);
  assert.equal(merkUtfall({ status: 'rejected', rejectReason: 'passert' }), null);
  // Avslått etter at eventet startet = «avslå alle passerte», ikke smak
  assert.equal(merkUtfall({ status: 'rejected', start: '2026-10-01T20:00:00+02:00', reviewedAt: '2026-10-05T10:00:00Z' }), null);
  assert.equal(merkUtfall({ status: 'pending' }), null);
});

function lagHistorikk() {
  const eksempler = [];
  const legg = (e, utfall, provider = 'ticketmaster') =>
    eksempler.push({ egenskaper: trekkUtEgenskaper(event(e), { provider }), utfall });

  for (let i = 0; i < 8; i++) legg({ tittel: `Jazzkveld ${i}`, sted: 'BLÅ', pris: 150 }, 'positiv');
  for (let i = 0; i < 8; i++) legg({ tittel: `Arenashow ${i}`, sted: 'Unity Arena', pris: 900 }, 'negativ');
  for (let i = 0; i < HOLD_UTE_MIN_AVSLAG; i++) legg({ tittel: `Bedriftskurs ${i}`, sted: 'Konferansehotellet' }, 'negativ', 'billetto');
  return trenModell(eksempler);
}

test('scorEvent: null med for lite data, ellers høyere for det som ligner det godkjente', () => {
  const lite = trenModell([{ egenskaper: ['sted:bla'], utfall: 'positiv' }]);
  assert.equal(scorEvent(['sted:bla'], lite).score, null);
  assert.ok(MIN_BESLUTNINGER > 1);

  const modell = lagHistorikk();
  const bra = scorEvent(trekkUtEgenskaper(event({ tittel: 'Ny jazzkveld', sted: 'BLÅ', pris: 150 }), { provider: 'ticketmaster' }), modell);
  const dårlig = scorEvent(trekkUtEgenskaper(event({ tittel: 'Stort arenashow', sted: 'Unity Arena', pris: 900 }), { provider: 'ticketmaster' }), modell);

  assert.ok(bra.score > 60, `forventet høy score, fikk ${bra.score}`);
  assert.ok(dårlig.score < 40, `forventet lav score, fikk ${dårlig.score}`);
  assert.ok(bra.grunner.some((g) => g.egenskap === 'sted:bla' && g.vekt > 0));
  assert.ok(dårlig.grunner.length <= 3);
});

test('finnHoldUteGrunn: lært regel etter gjentatte avslag, manuelle regler, og ALLTID_MED vinner', () => {
  const modell = lagHistorikk();
  const kurs = event({ tittel: 'Nytt bedriftskurs', sted: 'Konferansehotellet' });
  const f = trekkUtEgenskaper(kurs, { provider: 'billetto' });

  assert.match(finnHoldUteGrunn(kurs, f, modell), /^lært: sted:konferansehotellet avslått 5×/);
  assert.equal(finnHoldUteGrunn(kurs, f, modell, { alltidMed: { steder: ['Konferansehotellet'] } }), null);

  const jazz = event({ tittel: 'Jazzkveld med Keramikk-kurs', sted: 'BLÅ' });
  const fj = trekkUtEgenskaper(jazz);
  assert.equal(finnHoldUteGrunn(jazz, fj, modell), null);
  assert.equal(finnHoldUteGrunn(jazz, fj, modell, { holdUte: { ord: ['kurs'] } }), 'regel: «kurs»');
  assert.equal(finnHoldUteGrunn(event({ tittel: 'Kursiv' }), [], modell, { holdUte: { ord: ['kurs'] } }), null);
});

// ─── run.js: horisont og oppsummering ───────────────────────────────────────

test('lesHorisontDager: --dager=14 gir 14, ugyldig/mangler gir 30', () => {
  assert.equal(lesHorisontDager(['node', 'run.js', '--dager=14']), 14);
  assert.equal(lesHorisontDager(['node', 'run.js']), 30);
  assert.equal(lesHorisontDager(['node', 'run.js', '--dager=abc']), 30);
});

test('innenforHorisont: 14 dager slipper ikke gjennom dag 20', () => {
  const nå = new Date('2026-11-01T12:00:00Z');
  assert.equal(innenforHorisont(event({ start: '2026-11-10T20:00:00+01:00' }), nå, 14), true);
  assert.equal(innenforHorisont(event({ start: '2026-11-21T20:00:00+01:00' }), nå, 14), false);
  assert.equal(innenforHorisont(event({ start: '2026-11-21T20:00:00+01:00' }), nå), true);
});

test('skrivOppsummering: dag for dag, høyeste score først, holdt ute for seg', () => {
  const linjer = [];
  const original = console.log;
  console.log = (...a) => linjer.push(a.join(' '));
  try {
    skrivOppsummering([
      { ...event({ tittel: 'Lav', start: '2026-11-03T18:00:00+01:00' }), id: '1', kilde: 'tm', score: 20, mangler: [] },
      { ...event({ tittel: 'Høy', start: '2026-11-03T21:00:00+01:00' }), id: '2', kilde: 'tm', score: 90, mangler: ['bilde'] },
      { ...event({ tittel: 'Tidlig dag', start: '2026-11-02T21:00:00+01:00' }), id: '3', kilde: 'tm', score: 10, mangler: [] },
      { ...event({ tittel: 'Kurs', start: '2026-11-02T10:00:00+01:00' }), id: '4', kilde: 'tm', score: null, mangler: [], holdtUte: 'regel: «kurs»' },
    ], { horisontDager: 14, nyeIder: new Set(['2']), nå: new Date('2026-11-01T12:00:00Z') });
  } finally {
    console.log = original;
  }

  const tekst = linjer.join('\n');
  assert.match(tekst, /3 i agentens utvalg, 0 usikre, 1 ikke valgt/);
  assert.ok(tekst.indexOf('Tidlig dag') < tekst.indexOf('Høy'));
  assert.ok(tekst.indexOf('Høy') < tekst.indexOf('Lav'));
  assert.match(tekst, / 90 NY {2}21:00 {2}Høy .*\[mangler: bilde\]/);
  assert.match(tekst, /Ikke valgt[\s\S]*Kurs — regel: «kurs»/);
});

test('agentensValg: grenser 25/40, holdt ute, manuell inkludering og ingen score', () => {
  assert.equal(agentensValg({ score: 75 }), 'valgt');
  assert.equal(agentensValg({ score: 40 }), 'valgt');
  assert.equal(agentensValg({ score: 39 }), 'usikker');
  assert.equal(agentensValg({ score: 25 }), 'usikker');
  assert.equal(agentensValg({ score: 24 }), 'ikke-valgt');
  assert.equal(agentensValg({ score: 90, holdtUte: 'regel: «kurs»' }), 'ikke-valgt');
  assert.equal(agentensValg({ score: null }), 'valgt'); // uten modell skjules ingenting
  assert.equal(agentensValg({ score: 10, holdtUte: 'lært: …', inkludertManuelt: true }), 'valgt');
  // Før 5 ekte avslag: lav score blir usikker, bare regler gir ikke-valgt
  assert.equal(agentensValg({ score: 12, antallAvslag: 0 }), 'usikker');
  assert.equal(agentensValg({ score: 12, antallAvslag: 4 }), 'usikker');
  assert.equal(agentensValg({ score: 12, antallAvslag: 5 }), 'ikke-valgt');
  assert.equal(agentensValg({ score: 12, holdtUte: 'regel: «x»', antallAvslag: 0 }), 'ikke-valgt');
});

test('bakgrunn: tidligere Påby-events gir score uten ett eneste avslag, mot ubehandlede API-funn', () => {
  const eksempler = [];
  // Påbys historikk: små steder, billig/gratis.
  for (let i = 0; i < 15; i++) {
    eksempler.push({ egenskaper: trekkUtEgenskaper(event({ tittel: `Jazzkveld ${i}`, sted: 'BLÅ', pris: 0 })), utfall: 'positiv' });
  }
  // API-et: mye arena og dyrt, ingen har sett på det ennå.
  for (let i = 0; i < 40; i++) {
    eksempler.push({ egenskaper: trekkUtEgenskaper(event({ tittel: `Arenashow ${i}`, sted: 'Unity Arena', pris: 900 })), utfall: 'negativ', bakgrunn: true });
  }
  const modell = trenModell(eksempler);
  assert.deepEqual(modell.antall, { med: 15, avslått: 0, bakgrunn: 40 });

  const påbyAktig = scorEvent(trekkUtEgenskaper(event({ tittel: 'Ny jazzkveld', sted: 'BLÅ', pris: 0 })), modell);
  const arena = scorEvent(trekkUtEgenskaper(event({ tittel: 'Stort arenashow', sted: 'Unity Arena', pris: 900 })), modell);
  assert.ok(påbyAktig.score >= 40, `forventet utvalg, fikk ${påbyAktig.score}`);
  assert.ok(arena.score < 25, `forventet ikke valgt, fikk ${arena.score}`);

  // 40 bakgrunnsfunn fra Unity Arena er IKKE avslag — ingen lært hold-ute.
  const f = trekkUtEgenskaper(event({ tittel: 'Stort arenashow', sted: 'Unity Arena' }));
  assert.equal(finnHoldUteGrunn(event({ tittel: 'Stort arenashow', sted: 'Unity Arena' }), f, modell), null);
});

test('bakgrunn alene gir aldri score — det trengs ekte beslutninger', () => {
  const kunBakgrunn = trenModell(Array.from({ length: 50 }, () => ({ egenskaper: ['sted:x'], utfall: 'negativ', bakgrunn: true })));
  assert.equal(scorEvent(['sted:x'], kunBakgrunn).score, null);
});
