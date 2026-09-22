/* ris-ros.js — skjemalogikk for /ris-ros/. Bevisst minimal: ett tekstfelt,
   ingen navn/e-post/kontaktinfo. Samme mønster som send-inn.js (server er
   autoritativ, klientvalidering er kun rask tilbakemelding), men uten
   bilde/kategori/tid-kompleksiteten — det er rett og slett ikke behov
   for det her. */

const API_BASE_URL =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://api.paaby.no';

const MAKS_MELDING = 2000;

const skjema        = document.getElementById('feedback-skjema');
const meldingFelt    = document.getElementById('melding');
const sendKnapp      = document.getElementById('send-knapp');
const bekreftelseEl  = document.getElementById('bekreftelse');

/* ========================
   TEGNTELLER
   ======================== */

const teller = document.getElementById('melding-teller');
meldingFelt.addEventListener('input', () => {
  teller.textContent = String(meldingFelt.value.length);
  settFeil('melding', '');
});

/* ========================
   FEILVISNING
   ======================== */

function settFeil(felt, melding) {
  const el = document.querySelector(`[data-feil-for="${felt}"]`);
  if (el) el.textContent = melding ?? '';
}

function fjernAlleFeil() {
  document.querySelectorAll('.send-inn-feil').forEach((el) => { el.textContent = ''; });
}

/* ========================
   INNSENDING
   ======================== */

skjema.addEventListener('submit', async (e) => {
  e.preventDefault();
  fjernAlleFeil();

  const melding = meldingFelt.value.trim();
  if (!melding) {
    settFeil('melding', 'Skriv en melding først.');
    return;
  }
  if (melding.length > MAKS_MELDING) {
    settFeil('melding', `Maks ${MAKS_MELDING} tegn.`);
    return;
  }

  sendKnapp.disabled = true;
  const opprinneligTekst = sendKnapp.textContent;
  sendKnapp.textContent = 'Sender inn …';

  try {
    const res = await fetch(`${API_BASE_URL}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nettside: document.getElementById('nettside').value,
        melding,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.ok) {
      skjema.hidden = true;
      bekreftelseEl.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (typeof data.feil === 'string') {
      settFeil('melding', data.feil);
    } else {
      settFeil('generelt', data.message || 'Noe gikk galt. Prøv igjen.');
    }
  } catch {
    settFeil('generelt', 'Kunne ikke sende inn — sjekk nettforbindelsen og prøv igjen.');
  } finally {
    sendKnapp.disabled = false;
    sendKnapp.textContent = opprinneligTekst;
  }
});
