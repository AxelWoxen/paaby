import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL mangler');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // Heroku PostgreSQL bruker SSL i produksjon.
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false
});

export default pool;