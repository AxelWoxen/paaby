/* kart.js — to kart:
   1. Lite kart i detaljvisningen som viser hvor eventet er (visKart).
   2. Fullskjerm «utforsk på kart» med én pin per sted (visOversiktskart).
   Bruker Leaflet + OpenStreetMap (ingen API-nøkkel). Leaflet lastes først
   når et kart faktisk vises, så forsiden betaler ingenting for det. */

import { formaterTidKort } from '../application/formatering.js';

const LEAFLET_VERSJON = '1.9.4';
const LEAFLET_CSS = {
  href:      `https://unpkg.com/leaflet@${LEAFLET_VERSJON}/dist/leaflet.css`,
  integrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
};
const LEAFLET_JS = {
  src:       `https://unpkg.com/leaflet@${LEAFLET_VERSJON}/dist/leaflet.js`,
  integrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
};

const ZOOM = 16;
const OSLO_SENTRUM = [59.9139, 10.7522];

let leafletLasting   = null; /* Promise — deles av alle kall så Leaflet lastes én gang */
let kartInstans      = null; /* kartet i åpen modal, fjernes før neste bygges */
let oversiktInstans  = null; /* fullskjermkartet, gjenbrukes mellom åpninger */
let oversiktMarkører = null; /* L.layerGroup med stedspinnene */


/* Laster Leaflet-CSS og -JS fra CDN. Løser seg med window.L, eller null
   hvis lastingen feiler (offline, blokkert CDN) — da vises bare ikke kartet. */
function lastLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletLasting) return leafletLasting;

  const link = document.createElement('link');
  link.rel         = 'stylesheet';
  link.href        = LEAFLET_CSS.href;
  link.integrity   = LEAFLET_CSS.integrity;
  link.crossOrigin = '';
  document.head.appendChild(link);

  leafletLasting = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src         = LEAFLET_JS.src;
    script.integrity   = LEAFLET_JS.integrity;
    script.crossOrigin = '';
    script.onload  = () => resolve(window.L ?? null);
    script.onerror = () => {
      console.warn('[kart] klarte ikke å laste Leaflet');
      leafletLasting = null; /* prøv igjen neste gang en modal åpnes */
      resolve(null);
    };
    document.head.appendChild(script);
  });

  return leafletLasting;
}


/**
 * Bygger kart-containeren som legges inn i modalen.
 * Returnerer null hvis eventet mangler koordinater.
 * Selve kartet tegnes av visKart() etter at containeren er i DOM-en
 * (Leaflet trenger å kunne måle størrelsen).
 */
export function byggKartContainer(event) {
  if (event.lat == null || event.lng == null) return null;

  const div = document.createElement('div');
  div.className = 'modal-kart';
  div.setAttribute('role', 'img');
  div.setAttribute('aria-label', `Kart som viser ${event.sted || 'stedet'}`);
  return div;
}

/**
 * Tegner kartet i containeren fra byggKartContainer().
 * Farge på markøren hentes fra --kort-farge (kategorifargen i modalen).
 */
export async function visKart(container, event) {
  skjulKart();
  if (!container) return;

  const L = await lastLeaflet();

  /* Modalen kan ha blitt lukket eller byttet event mens Leaflet lastet */
  if (!L || !container.isConnected) {
    container.remove();
    return;
  }

  const punkt = [event.lat, event.lng];
  const farge = getComputedStyle(container).getPropertyValue('--kort-farge').trim() || '#8CB1F4';

  kartInstans = L.map(container, {
    center:          punkt,
    zoom:            ZOOM,
    scrollWheelZoom: false,          /* ikke kapre scrolling i modalen */
    dragging:        !L.Browser.mobile, /* én finger skal scrolle modalen, ikke kartet */
    tap:             false,
    attributionControl: true,
  });

  leggTilKartfliser(L, kartInstans);

  L.circleMarker(punkt, {
    radius:      10,
    color:       '#1E0C14',
    weight:      2,
    fillColor:   farge,
    fillOpacity: 1,
  }).addTo(kartInstans);
}

/* Fjerner kartet i modalen (kalles når modalen lukkes eller bygges på nytt). */
export function skjulKart() {
  if (kartInstans) {
    kartInstans.remove();
    kartInstans = null;
  }
}

function leggTilKartfliser(L, kart) {
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom:     19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(kart);
}


/* ========================
   OVERSIKTSKART
   ======================== */

/**
 * Samler eventer per sted. Nøkkelen er stedId når den finnes, ellers
 * koordinatene — to venues på nøyaktig samme punkt blir da én pin.
 * Eventer uten koordinater utelates (de finnes fortsatt i lista).
 */
export function grupperEtterSted(eventer) {
  const steder = new Map();

  for (const e of eventer) {
    if (e.lat == null || e.lng == null) continue;
    const nøkkel = e.stedId ?? `${e.lat},${e.lng}`;
    if (!steder.has(nøkkel)) {
      steder.set(nøkkel, { sted: e.sted, lat: e.lat, lng: e.lng, eventer: [] });
    }
    steder.get(nøkkel).eventer.push(e);
  }

  return [...steder.values()];
}

/* Kategorifargene fra variabler.css (--musikk / --musikk-tekst osv.),
   med reservefarger for ukjente kategorier */
function kategoriFarger(kategori) {
  const rot = getComputedStyle(document.documentElement);
  return {
    bakgrunn: rot.getPropertyValue(`--${kategori}`).trim()       || '#8CB1F4',
    tekst:    rot.getPropertyValue(`--${kategori}-tekst`).trim() || '#1E0C14',
  };
}

/* Pinnen er en sirkel i kategorifargen til stedets første event.
   Har stedet flere eventer, står antallet i sirkelen. Kun tall i HTML-en. */
function lagStedIkon(L, sted) {
  const antall = sted.eventer.length;
  const farger = kategoriFarger(sted.eventer[0].kategori);
  return L.divIcon({
    className:  'kart-pin',
    html:       `<span class="kart-pin-sirkel" style="background:${farger.bakgrunn};color:${farger.tekst}">${antall > 1 ? antall : ''}</span>`,
    iconSize:   [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

/* Popup-innhold bygges som DOM (ingen innerHTML med brukerdata) */
function byggStedPopup(sted, påVelgEvent) {
  const div = document.createElement('div');
  div.className = 'kart-popup';

  const navn = document.createElement('p');
  navn.className   = 'kart-popup-sted';
  navn.textContent = sted.sted || 'Ukjent sted';
  div.appendChild(navn);

  const liste = document.createElement('ul');
  liste.className = 'kart-popup-liste';

  for (const e of sted.eventer) {
    const li    = document.createElement('li');
    const knapp = document.createElement('button');
    knapp.type      = 'button';
    knapp.className = `kart-popup-event kategori-${e.kategori}`;

    const tittel = document.createElement('span');
    tittel.className   = 'kart-popup-tittel';
    tittel.textContent = e.tittel;

    const tid = document.createElement('span');
    tid.className   = 'kart-popup-tid';
    tid.textContent = formaterTidKort(e.start);

    knapp.append(tittel, tid);
    knapp.addEventListener('click', () => påVelgEvent(e));
    li.appendChild(knapp);
    liste.appendChild(li);
  }

  div.appendChild(liste);
  return div;
}

/**
 * Tegner (eller oppdaterer) fullskjermkartet med én pin per sted.
 * Kartet gjenbrukes mellom åpninger; kun pinnene byttes ut.
 *
 * @param {HTMLElement} container - kartflaten i #kart-visning
 * @param {Array}       eventer   - eventene lista viser nå
 * @param {Function}    påVelgEvent - kalles med eventet brukeren klikker i en popup
 * @returns {Promise<number|null>} antall steder på kartet, eller null hvis Leaflet ikke lastet
 */
export async function visOversiktskart(container, eventer, påVelgEvent) {
  const L = await lastLeaflet();
  if (!L) return null;

  if (!oversiktInstans) {
    oversiktInstans = L.map(container, { center: OSLO_SENTRUM, zoom: 13 });
    leggTilKartfliser(L, oversiktInstans);
    oversiktMarkører = L.layerGroup().addTo(oversiktInstans);
  }

  /* Containeren kan ha vært skjult — Leaflet må måle størrelsen på nytt */
  oversiktInstans.invalidateSize();
  oversiktMarkører.clearLayers();

  const steder = grupperEtterSted(eventer);

  for (const sted of steder) {
    L.marker([sted.lat, sted.lng], {
      icon:  lagStedIkon(L, sted),
      title: sted.sted || '',
      alt:   `${sted.sted || 'Sted'}: ${sted.eventer.length} arrangement`,
    })
      .bindPopup(() => byggStedPopup(sted, påVelgEvent), { maxWidth: 280, minWidth: 200 })
      .addTo(oversiktMarkører);
  }

  if (steder.length > 0) {
    const grenser = L.latLngBounds(steder.map((s) => [s.lat, s.lng]));
    oversiktInstans.fitBounds(grenser, { padding: [40, 40], maxZoom: 15 });
  } else {
    oversiktInstans.setView(OSLO_SENTRUM, 13);
  }

  return steder.length;
}
