/* login.js — viser feilmeldingen fra ?feil=-parameteren (satt av POST /login
   ved feil innlogging/rate-limit). Egen fil, ikke inline: helmet sin
   Content-Security-Policy (script-src 'self' …, ingen 'unsafe-inline')
   blokkerer inline <script>-blokker overalt i appen, login.html inkludert. */

const params = new URLSearchParams(location.search);
const feil = params.get('feil');
if (feil) {
  const el = document.getElementById('feilmelding');
  el.hidden = false;
  el.textContent = feil === 'for-mange'
    ? 'For mange innloggingsforsøk. Prøv igjen om litt.'
    : 'Feil e-post eller passord.';
}
