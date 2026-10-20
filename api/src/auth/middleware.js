import { pool } from '../db.js';

// Carga el usuario de la sesión en cada petición para que un cambio de rol o
// una desactivación desde el panel admin tenga efecto inmediato.
export async function loadUser(req, res, next) {
  req.user = null;
  const id = req.session?.userId;
  if (id) {
    const [rows] = await pool.query('SELECT id, email, name, role, active FROM users WHERE id = ?', [id]);
    if (rows[0]?.active) req.user = rows[0];
    else delete req.session.userId;
  }
  req.role = req.user?.role ?? 'anon';
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Debes iniciar sesión' });
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Solo para administradores' });
  next();
}
