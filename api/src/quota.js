import { pool } from './db.js';

const DEFAULTS = { anon: 20000, registered: 200000, admin: 0 };

// Límite de tokens por periodo para un rol: QUOTA_<ROL> en el .env (0 = ilimitado).
// Un rol nuevo sin variable propia usa el límite de los registrados.
export function limitFor(role) {
  const raw = process.env[`QUOTA_${role.toUpperCase()}`] ?? (role in DEFAULTS ? DEFAULTS[role] : process.env.QUOTA_REGISTERED ?? DEFAULTS.registered);
  return Number(raw) || 0;
}

export function currentPeriod(now = new Date()) {
  const day = now.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }); // AAAA-MM-DD
  return process.env.QUOTA_PERIOD === 'month' ? day.slice(0, 7) : day;
}

// shortcut: un anónimo que borra sus cookies obtiene cuota nueva; lo frena el límite por IP del chat.
const subjectOf = (req) => (req.user ? `user:${req.user.id}` : `anon:${req.sessionID}`);

export async function getQuota(req) {
  const period = currentPeriod();
  const [[row]] = await pool.query('SELECT tokens FROM token_usage WHERE subject = ? AND period = ?', [subjectOf(req), period]);
  const limit = limitFor(req.role);
  const used = row?.tokens ?? 0;
  return { period: process.env.QUOTA_PERIOD === 'month' ? 'month' : 'day', limit, used, remaining: limit ? Math.max(limit - used, 0) : null };
}

export async function addUsage(req, tokens) {
  await pool.query(
    `INSERT INTO token_usage (subject, period, role, tokens, requests) VALUES (?, ?, ?, ?, 1) AS new
     ON DUPLICATE KEY UPDATE tokens = token_usage.tokens + new.tokens, requests = token_usage.requests + 1, role = new.role`,
    [subjectOf(req), currentPeriod(), req.role, Math.max(0, Math.round(tokens))],
  );
}
