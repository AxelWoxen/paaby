import {
  validerSessionBody,
  validerEventBody,
  validerSavedSyncBody,
  registrerSession,
  registrerEvent,
  synkroniserLagrede,
  UkjentSessionError,
} from '../services/analyticsService.mjs';

export async function postSession(req, res) {
  const resultat = validerSessionBody(req.body);
  if (resultat.feil) {
    return res.status(400).json({ ok: false, feil: resultat.feil });
  }

  try {
    await registrerSession(resultat);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Kunne ikke registrere analytics-session:', err);
    res.status(500).json({ ok: false, feil: 'Kunne ikke registrere session' });
  }
}

export async function postEvent(req, res) {
  const resultat = validerEventBody(req.body);
  if (resultat.feil) {
    return res.status(400).json({ ok: false, feil: resultat.feil });
  }

  try {
    await registrerEvent(resultat);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof UkjentSessionError) {
      return res.status(400).json({ ok: false, feil: 'Ukjent session' });
    }
    console.error('Kunne ikke registrere analytics-event:', err);
    res.status(500).json({ ok: false, feil: 'Kunne ikke registrere event' });
  }
}

export async function postSavedSync(req, res) {
  const resultat = validerSavedSyncBody(req.body);
  if (resultat.feil) {
    return res.status(400).json({ ok: false, feil: resultat.feil });
  }

  try {
    await synkroniserLagrede(resultat);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Kunne ikke synkronisere lagrede events:', err);
    res.status(500).json({ ok: false, feil: 'Kunne ikke synkronisere' });
  }
}
