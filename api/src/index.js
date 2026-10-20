import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db.js';
import { ensureAdmin } from './routes/auth.js';
import { syncSeeds } from './rag/ingest.js';

await migrate();
await ensureAdmin();
await syncSeeds();
createApp().listen(config.port, () => console.log(`NOVA API escuchando en :${config.port}`));
