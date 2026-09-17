import {
  validerInnsending,
  gjenkjennBildetype,
  lagreInnsending,
} from '../services/innsendingService.mjs';
import { sendVarselEpost } from '../services/varsel.mjs';

// Bygger absolutt bilde-URL fra det innkommende requestet — riktig i både
// dev (http://localhost:3000) og prod (https://api.paaby.no) uten en egen
// env-variabel, siden `app.set('trust proxy', 1)` i server.mjs allerede gjør
// at req.protocol reflekterer den ekte protokollen bak Herokus proxy.
function byggBildeUrl(req) {
  return (candidateImageId) => `${req.protocol}://${req.get('host')}/api/bilder/${candidateImageId}`;
}

export async function postInnsending(req, res) {
  const body = req.body ?? {};

  // Honeypot: bot-felt som ekte brukere aldri ser eller fyller ut.
  // Late som alt gikk bra, uten å lagre noe.
  if (!isTom(body.nettside)) {
    return res.status(200).json({ ok: true });
  }

  const resultat = validerInnsending(body);
  if (resultat.feil) {
    return res.status(400).json({ ok: false, feil: resultat.feil });
  }

  let bilde = null;
  if (req.file) {
    const mimeType = gjenkjennBildetype(req.file.buffer);
    if (!mimeType) {
      return res.status(400).json({
        ok: false,
        feil: { bilde: 'Filen ser ikke ut til å være et gyldig bilde (JPEG/PNG/WebP).' },
      });
    }
    bilde = { mimeType, buffer: req.file.buffer };
  }

  try {
    const { id } = await lagreInnsending(resultat.verdier, bilde, byggBildeUrl(req));

    // Fire-and-forget — e-postfeil skal aldri gjøre at innsendingen mislykkes
    // for brukeren.
    sendVarselEpost({
      emne: `Ny innsending: ${resultat.verdier.tittel}`,
      felter: [
        { label: 'Tittel',    verdi: resultat.verdier.tittel },
        { label: 'Kategori',  verdi: resultat.verdier.kategori },
        { label: 'Dato/tid',  verdi: resultat.verdier.startISO },
        { label: 'Sted',      verdi: resultat.verdier.sted },
        { label: 'Adresse',   verdi: resultat.verdier.adresse },
        { label: 'Innsender', verdi: resultat.verdier.submitter.navn },
        { label: 'Organisasjon', verdi: resultat.verdier.submitter.organisasjon },
        { label: 'Kontakt',   verdi: resultat.verdier.submitter.kontakt },
        { label: 'Kommentar', verdi: resultat.verdier.submitter.kommentar },
      ],
    }).catch(() => { /* sendVarselEpost logger selv — aldri kast videre */ });

    res.status(200).json({ ok: true, id });
  } catch (err) {
    console.error('Kunne ikke lagre innsending:', err);
    res.status(500).json({ ok: false, feil: { generelt: 'Noe gikk galt. Prøv igjen.' } });
  }
}

function isTom(verdi) {
  return typeof verdi !== 'string' || verdi.trim() === '';
}
