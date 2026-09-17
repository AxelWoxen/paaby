import express from 'express';
import multer from 'multer';
import { postInnsending } from '../controllers/innsendingController.mjs';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

function håndterOpplastingsfeil(err, _req, res, next) {
  if (!err) return next();
  if (err instanceof multer.MulterError) {
    const melding = err.code === 'LIMIT_FILE_SIZE'
      ? 'Bildet er for stort (maks 5 MB).'
      : 'Kunne ikke lese det opplastede bildet.';
    return res.status(400).json({ ok: false, feil: { bilde: melding } });
  }
  console.error('Uventet opplastingsfeil:', err);
  res.status(500).json({ ok: false, feil: { generelt: 'Noe gikk galt. Prøv igjen.' } });
}

router.post('/', upload.single('bilde'), håndterOpplastingsfeil, postInnsending);

export default router;
