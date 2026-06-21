/* kart.js — valgfri kartmodul.
   Helt uavhengig av resten av appen. For å skru av kartet:
   1. Kommenter ut import-linja i main.js
   2. Kommenter ut Leaflet CDN-lenkene i index.html
   3. Ferdig — ingenting annet påvirkes.

   Bruker Leaflet.js (lastes via CDN) og OpenStreetMap (ingen API-nøkkel). */

/* Leaflet-instansen lagres her så vi kan invalidere størrelsen
   når containeren vises etter å ha vært skjult */
let kartInstans = null;


/**
 * Initialiserer kartet og plasserer en pin for hvert event.
 * Kalles én gang av main.js etter at eventer er lastet.
 *
 * @param {Array} eventer - Alle eventer med lat/lng
 */
export function initKart(eventer) {
  /* Leaflet legger seg på window.L når det lastes fra CDN.
     Hvis L ikke finnes har noen glemt CDN-lenken i index.html. */
  if (typeof L === 'undefined') {
    console.warn('Påby kart: Leaflet er ikke lastet — sjekk CDN-lenken i index.html.');
    return;
  }

  /* Sentrer kartet på Oslo sentrum */
  kartInstans = L.map('kart-container').setView([59.913, 10.740], 13);

  /* OpenStreetMap som kartlag — gratis, ingen API-nøkkel */
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(kartInstans);

  /* Legg til en korall-pin for hvert event */
  eventer.forEach((event) => {
    const pin = L.circleMarker([event.lat, event.lng], {
      radius: 9,
      fillColor: '#FF4D5E',  /* --korall */
      color: '#FF4D5E',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9,
    });

    /* Popup med tittel og sted når man klikker pinen */
    pin.bindPopup(`
      <strong>${event.tittel}</strong><br>
      ${event.sted}
    `);

    pin.addTo(kartInstans);
  });
}

/**
 * Viser kartvisningen.
 * Leaflet trenger å vite størrelsen på containeren for å tegne riktig —
 * invalidateSize() fikser dette etter at containeren har blitt synlig.
 */
export function visKart() {
  document.getElementById('kart-visning').classList.remove('skjult');
  if (kartInstans) {
    /* Liten forsinkelse fordi CSS-animasjonen ikke er ferdig med én gang */
    setTimeout(() => kartInstans.invalidateSize(), 100);
  }
}

/**
 * Skjuler kartvisningen og viser feeden igjen.
 */
export function skjulKart() {
  document.getElementById('kart-visning').classList.add('skjult');
}
