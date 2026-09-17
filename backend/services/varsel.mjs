// varsel.mjs — sender varsel-e-post via Resend sitt HTTP-API (ingen SDK).
// Gjenbrukbar: brukes av innsendingService.mjs i dag, og er tenkt gjenbrukt
// av en fremtidig anonym-feedback-funksjon.
//
// Prinsipp: en varsel-e-post skal ALDRI kunne få en brukerrettet forespørsel
// til å feile. Mangler nøkkel, eller feiler kallet mot Resend, logges det
// bare — kalleren venter ikke og bryr seg ikke om resultatet.

function escapeHtml(verdi) {
  return String(verdi ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sender en enkel varsel-e-post med en liste med felt-verdi-par.
 * Fire-and-forget — kalleren skal ikke `await` denne før den svarer brukeren.
 *
 * @param {Object} params
 * @param {string} params.emne     — e-postens emnefelt
 * @param {Array<{label: string, verdi: string}>} params.felter — vises i rekkefølge
 */
export async function sendVarselEpost({ emne, felter }) {
  const apiKey = process.env.RESEND_API_KEY;
  const til    = process.env.VARSEL_EPOST_TIL;
  const fra    = process.env.VARSEL_EPOST_FRA;

  if (!apiKey || !til || !fra) {
    console.warn('varsel.mjs: mangler RESEND_API_KEY/VARSEL_EPOST_TIL/VARSEL_EPOST_FRA — hopper over e-postvarsel.');
    return;
  }

  const html = felter
    .map(({ label, verdi }) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(verdi) || '—'}</p>`)
    .join('\n');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fra,
        to: [til],
        subject: emne,
        html,
      }),
    });

    if (!res.ok) {
      console.error('varsel.mjs: Resend svarte med feil:', res.status, await res.text());
    }
  } catch (err) {
    console.error('varsel.mjs: kunne ikke sende varsel-e-post:', err.message);
  }
}
