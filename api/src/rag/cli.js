// Uso:
//   npm run ingest            indexa lo pendiente (nuevo, modificado, con error o con otro modelo de embeddings)
//   npm run ingest -- --all   reindexa todo
import { migrate, pool } from '../db.js';
import { indexAll, syncSeeds } from './ingest.js';

await migrate();
console.log(`Fuentes sincronizadas desde api/data: ${await syncSeeds()}`);
const n = await indexAll({ all: process.argv.includes('--all') });
const [rows] = await pool.query('SELECT status, COUNT(*) AS n, SUM(chunk_count) AS chunks FROM sources GROUP BY status');
console.log(`Procesadas: ${n}. Estado del corpus:`);
console.table(rows);
await pool.end();
