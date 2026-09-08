import pool from '../db/pool.mjs';

export async function checkDatabase() {
  const result = await pool.query('SELECT NOW() AS database_time');

  return result.rows[0];
}