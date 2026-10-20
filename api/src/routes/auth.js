import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { pool } from '../db.js';
import { sendMail } from '../mailer.js';
import { hashPassword, verifyPassword, sha256, randomToken } from '../auth/passwords.js';

const router = Router();

// Frena fuerza bruta y abuso del envío de correos.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT || 30),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos.' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_HOURS = { verify: 48, reset: 1 };

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

function cleanEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 255) throw fail(400, 'Correo electrónico no válido');
  return email;
}

function checkPassword(value) {
  const password = String(value ?? '');
  if (password.length < 8 || password.length > 200) throw fail(400, 'La contraseña debe tener entre 8 y 200 caracteres');
  return password;
}

async function issueToken(userId, purpose) {
  const token = randomToken();
  await pool.query('DELETE FROM user_tokens WHERE user_id = ? AND purpose = ?', [userId, purpose]);
  await pool.query(
    'INSERT INTO user_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))',
    [sha256(token), userId, purpose, TOKEN_HOURS[purpose]],
  );
  return token;
}

// Devuelve el user_id y borra el token (un solo uso), o lanza error si no sirve.
async function consumeToken(token, purpose) {
  const hash = sha256(String(token ?? ''));
  const [rows] = await pool.query(
    'SELECT user_id FROM user_tokens WHERE token_hash = ? AND purpose = ? AND expires_at > NOW()',
    [hash, purpose],
  );
  if (!rows[0]) throw fail(400, 'El enlace no es válido o ya expiró');
  await pool.query('DELETE FROM user_tokens WHERE token_hash = ?', [hash]);
  return rows[0].user_id;
}

async function sendVerification(user) {
  const token = await issueToken(user.id, 'verify');
  await sendMail({
    to: user.email,
    subject: 'Confirma tu correo en NOVA',
    text: `Hola ${user.name},\n\nConfirma tu correo abriendo este enlace (válido por ${TOKEN_HOURS.verify} horas):\n${config.appUrl}/verificar?token=${token}\n\nSi no creaste una cuenta en NOVA, ignora este mensaje.`,
  });
}

function publicUser(u) {
  return u && { id: u.id, email: u.email, name: u.name, role: u.role };
}

router.get('/me', (req, res) => {
  res.json({ user: publicUser(req.user), role: req.role });
});

router.post('/register', limiter, async (req, res) => {
  const email = cleanEmail(req.body.email);
  const password = checkPassword(req.body.password);
  const name = String(req.body.name ?? '').trim();
  if (name.length < 2 || name.length > 120) throw fail(400, 'Escribe tu nombre (2 a 120 caracteres)');
  if (req.body.consent !== true) throw fail(400, 'Debes aceptar la política de tratamiento de datos personales');

  const [exists] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (exists[0]) throw fail(409, 'Ya existe una cuenta con ese correo');

  const [result] = await pool.query(
    'INSERT INTO users (email, name, password_hash, data_consent_at) VALUES (?, ?, ?, NOW())',
    [email, name, await hashPassword(password)],
  );
  await sendVerification({ id: result.insertId, email, name });
  res.status(201).json({ message: 'Cuenta creada. Revisa tu correo para confirmarla.' });
});

router.post('/verify', limiter, async (req, res) => {
  const userId = await consumeToken(req.body.token, 'verify');
  await pool.query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?', [userId]);
  res.json({ message: 'Correo confirmado. Ya puedes iniciar sesión.' });
});

router.post('/resend-verification', limiter, async (req, res) => {
  const email = cleanEmail(req.body.email);
  const [rows] = await pool.query('SELECT id, email, name FROM users WHERE email = ? AND email_verified_at IS NULL', [email]);
  if (rows[0]) await sendVerification(rows[0]);
  // Misma respuesta exista o no la cuenta, para no revelar qué correos están registrados.
  res.json({ message: 'Si la cuenta existe y no está confirmada, te enviamos un nuevo enlace.' });
});

router.post('/login', limiter, async (req, res) => {
  const email = cleanEmail(req.body.email);
  const password = String(req.body.password ?? '');
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) throw fail(401, 'Correo o contraseña incorrectos');
  if (!user.active) throw fail(403, 'Tu cuenta está desactivada. Contacta al administrador.');
  if (!user.email_verified_at) {
    return res.status(403).json({ error: 'Debes confirmar tu correo antes de iniciar sesión', needsVerification: true });
  }
  // Nueva sesión al iniciar sesión (evita fijación de sesión).
  await new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('nova.sid');
    res.json({ ok: true });
  });
});

router.post('/forgot', limiter, async (req, res) => {
  const email = cleanEmail(req.body.email);
  const [rows] = await pool.query('SELECT id, email, name FROM users WHERE email = ? AND active = 1', [email]);
  const user = rows[0];
  if (user) {
    const token = await issueToken(user.id, 'reset');
    await sendMail({
      to: user.email,
      subject: 'Restablece tu contraseña de NOVA',
      text: `Hola ${user.name},\n\nPara crear una nueva contraseña abre este enlace (válido por ${TOKEN_HOURS.reset} hora):\n${config.appUrl}/restablecer?token=${token}\n\nSi no lo pediste, ignora este mensaje; tu contraseña no cambia.`,
    });
  }
  res.json({ message: 'Si el correo está registrado, te enviamos un enlace para restablecer la contraseña.' });
});

router.post('/reset', limiter, async (req, res) => {
  const password = checkPassword(req.body.password);
  const userId = await consumeToken(req.body.token, 'reset');
  // Abrir el enlace del correo también demuestra que el correo es suyo.
  await pool.query(
    'UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?',
    [await hashPassword(password), userId],
  );
  res.json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
});

export default router;

// Crea el administrador inicial definido en .env si aún no existe.
export async function ensureAdmin() {
  const { email, password } = config.admin;
  if (!email || !password) return;
  const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
  if (rows[0]) return;
  await pool.query(
    "INSERT INTO users (email, name, password_hash, role, email_verified_at, data_consent_at) VALUES (?, 'Administrador', ?, 'admin', NOW(), NOW())",
    [email.toLowerCase(), await hashPassword(password)],
  );
  console.log(`Administrador inicial creado: ${email}`);
}
