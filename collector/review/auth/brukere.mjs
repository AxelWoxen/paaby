// brukere.mjs — innloggingssjekk + brukeradministrasjon mot admin_users
// (backend/db/migrations/004_admin_auth.sql).
//
// Ingen offentlig registrering: nye rader opprettes kun av en allerede
// innlogget admin, via /api/brukere i server.js (se krevAdmin der).

import bcrypt from 'bcryptjs';
import pool from '../../../backend/db/pool.mjs';

// Fast, gyldig bcrypt-hash uten tilhørende bruker — brukes når e-posten ikke
// finnes, slik at bcrypt.compare() alltid kjøres og feil svar tar omtrent
// like lang tid uansett om e-posten eksisterer eller ikke.
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8gRvKqvS81nMs0Y9tOJhcFvOOG0oJq';

export async function finnBrukerVedEpost(epost) {
  const result = await pool.query(
    `SELECT id, email, password_hash, role FROM admin_users WHERE email = $1`,
    [epost],
  );
  return result.rows[0] ?? null;
}

/**
 * Verifiserer e-post + passord.
 * @returns {Promise<{id: string, email: string, role: string} | null>}
 */
export async function loggInn(epost, passord) {
  const bruker = await finnBrukerVedEpost((epost ?? '').trim().toLowerCase());
  const hash = bruker?.password_hash ?? DUMMY_HASH;
  const gyldig = await bcrypt.compare(passord ?? '', hash);

  if (!gyldig || !bruker) return null;

  await pool.query(
    `UPDATE admin_users SET last_login_at = NOW() WHERE id = $1`,
    [bruker.id],
  );

  return { id: bruker.id, email: bruker.email, role: bruker.role };
}

export async function hentBrukere() {
  const result = await pool.query(
    `SELECT id, email, role, created_at, last_login_at FROM admin_users ORDER BY created_at`,
  );
  return result.rows;
}

/**
 * Oppretter en ny admin-bruker. Kaster med `.kode = 'finnes_allerede'` hvis
 * e-posten er i bruk.
 */
export async function opprettBruker(epost, passord, rolle) {
  const hash = await bcrypt.hash(passord, 12);

  try {
    const result = await pool.query(
      `INSERT INTO admin_users (email, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, role, created_at`,
      [epost.trim().toLowerCase(), hash, rolle],
    );
    return result.rows[0];
  } catch (err) {
    if (err.code === '23505') { // unique_violation på email
      const feil = new Error('E-postadressen er allerede i bruk');
      feil.kode = 'finnes_allerede';
      throw feil;
    }
    throw err;
  }
}

export async function slettBruker(id) {
  const result = await pool.query(`DELETE FROM admin_users WHERE id = $1`, [id]);
  return result.rowCount > 0;
}
