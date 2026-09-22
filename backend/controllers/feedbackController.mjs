import { validerFeedback, lagreFeedback } from '../services/feedbackService.mjs';
import { sendVarselEpost } from '../services/varsel.mjs';

function isTom(verdi) {
  return typeof verdi !== 'string' || verdi.trim() === '';
}

export async function postFeedback(req, res) {
  const body = req.body ?? {};

  // Honeypot — samme mønster som /send-inn/. Late som alt gikk bra,
  // uten å lagre noe.
  if (!isTom(body.nettside)) {
    return res.status(200).json({ ok: true });
  }

  const resultat = validerFeedback(body);
  if (resultat.feil) {
    return res.status(400).json({ ok: false, feil: resultat.feil });
  }

  try {
    await lagreFeedback(resultat.melding);

    // Fire-and-forget — e-postfeil skal aldri gjøre at innsendingen
    // mislykkes for brukeren (meldingen er allerede trygt lagret over).
    sendVarselEpost({
      emne: 'Ny anonym tilbakemelding på Påby',
      felter: [{ label: 'Melding', verdi: resultat.melding }],
    }).catch(() => { /* sendVarselEpost logger selv — aldri kast videre */ });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Kunne ikke lagre tilbakemelding:', err);
    res.status(500).json({ ok: false, feil: 'Noe gikk galt. Prøv igjen.' });
  }
}
