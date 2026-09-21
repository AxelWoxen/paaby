// opprett-bruker.mjs — eneste måten en admin-bruker kan opprettes på.
// Ingen HTTP-endepunkt for registrering finnes — dette kjøres manuelt av
// eieren, mot lokal database eller (med prod-DATABASE_URL) produksjon.
//
// Bruk:
//   node collector/review/scripts/opprett-bruker.mjs <epost> <passord> [rolle]
//
// Mot produksjon:
//   DATABASE_URL="$(heroku config:get DATABASE_URL -a paaby-api)" \
//     node collector/review/scripts/opprett-bruker.mjs <epost> <passord>

import bcrypt from 'bcryptjs';
import pool from '../../../backend/db/pool.mjs';

const [, , epost, passord, rolle = 'admin'] = process.argv;

if (!epost || !passord) {
  console.error('Bruk: node opprett-bruker.mjs <epost> <passord> [admin|editor|viewer]');
  process.exit(1);
}

if (passord.length < 12) {
  console.error('Passordet bør være minst 12 tegn.');
  process.exit(1);
}

const hash = await bcrypt.hash(passord, 12);

try {
  const result = await pool.query(
    `
      INSERT INTO admin_users (email, password_hash, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
      RETURNING id, email, role
    `,
    [epost.trim().toLowerCase(), hash, rolle],
  );
  console.log('Bruker klar:', result.rows[0]);
} finally {
  await pool.end();
}
