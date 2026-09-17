import pool from '../db/pool.mjs';

export async function getBilde(req, res) {
  try {
    const result = await pool.query(
      `SELECT mime_type, data FROM candidate_images WHERE id = $1`,
      [req.params.id],
    );

    if (result.rowCount === 0) {
      return res.status(404).end();
    }

    const { mime_type, data } = result.rows[0];

    // Helmet setter Cross-Origin-Resource-Policy: same-origin som standard —
    // det blokkerer bildet når <img> på paaby.no laster det fra api.paaby.no.
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Content-Type', mime_type);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(data);
  } catch (err) {
    console.error('Kunne ikke hente bilde:', err);
    res.status(500).end();
  }
}
