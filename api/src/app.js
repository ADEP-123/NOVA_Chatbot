import express from 'express';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import { config } from './config.js';
import { pool } from './db.js';
import { loadUser } from './auth/middleware.js';
import authRoutes from './routes/auth.js';

const MySQLStore = MySQLStoreFactory(session);

export function createApp() {
  if (!config.session.secret) throw new Error('Falta SESSION_SECRET en el .env');

  const app = express();
  app.set('trust proxy', 1); // detrás de nginx
  app.use(express.json({ limit: '100kb' }));
  app.use((req, res, next) => {
    req.body ??= {}; // Express 5 deja body undefined si la petición no trae JSON
    next();
  });

  const maxAge = config.session.maxAgeHours * 3600 * 1000;
  app.use(
    session({
      name: 'nova.sid',
      secret: config.session.secret,
      store: new MySQLStore({ expiration: maxAge, endConnectionOnClose: false }, pool),
      resave: false,
      // Los anónimos solo reciben sesión cuando se guarda algo en ella (p. ej. al chatear).
      saveUninitialized: false,
      rolling: true,
      cookie: { httpOnly: true, sameSite: 'lax', secure: config.session.secureCookie, maxAge },
    }),
  );
  app.use(loadUser);

  app.get('/api/health', async (req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  });
  app.use('/api/auth', authRoutes);

  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Error interno del servidor' : err.message });
  });

  return app;
}
