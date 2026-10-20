import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db.js';

await migrate();
createApp().listen(config.port, () => console.log(`NOVA API escuchando en :${config.port}`));
