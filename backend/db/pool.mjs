import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Les alltid .env fra prosjektroten, uansett hvilken mappe kommandoen kjøres fra.
dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
});

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL mangler');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

export default pool;