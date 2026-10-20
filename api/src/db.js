import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({ ...config.db, connectionLimit: 10, charset: 'utf8mb4' });

const MIGRATIONS_DIR = path.join(import.meta.dirname, 'migrations');

// Aplica en orden los .sql de src/migrations que aún no se hayan ejecutado.
export async function migrate() {
  const conn = await mysql.createConnection({ ...config.db, multipleStatements: true, charset: 'utf8mb4' });
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    const [rows] = await conn.query('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((r) => r.name));
    const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      await conn.query(await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8'));
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      console.log(`Migración aplicada: ${file}`);
    }
  } finally {
    await conn.end();
  }
}
