import express from 'express';
import { pool } from './db.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // detrás de nginx
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', async (req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Error interno del servidor' : err.message });
  });

  return app;
}
