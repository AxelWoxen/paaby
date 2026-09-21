// brukere.mjs — innloggingssjekk mot admin_users (backend/db/migrations/004_admin_auth.sql).
//
// Ingen offentlig registrering: rader i admin_users opprettes kun via
// scripts/opprett-bruker.mjs, kjørt manuelt av eieren.

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
