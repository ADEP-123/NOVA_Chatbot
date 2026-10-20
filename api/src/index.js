import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db.js';
import { ensureAdmin } from './routes/auth.js';

await migrate();
await ensureAdmin();
createApp().listen(config.port, () => console.log(`NOVA API escuchando en :${config.port}`));
