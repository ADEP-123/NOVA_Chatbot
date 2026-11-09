import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { pool } from '../db.js';
import { requireAdmin } from '../auth/middleware.js';
import { currentPeriod, limitFor } from '../quota.js';
import { indexAll, indexSource, isIndexing } from '../rag/ingest.js';

const router = Router();
router.use(requireAdmin);

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
const ROLE_RE = /^[a-z][a-z0-9_]{1,29}$/;
const ALLOWED_EXT = /\.(pdf|html?|txt|md)$/i;

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^\w.-]+/g, '_').slice(-120)}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED_EXT.test(file.originalname)),
});

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

// La indexación corre en segundo plano; los errores por fuente quedan en la tabla sources.
const background = (promise) => promise.catch((err) => console.error('Error indexando:', err));

router.get('/stats', async (req, res) => {
  const period = currentPeriod();
  const [users] = await pool.query('SELECT role, COUNT(*) AS n FROM users GROUP BY role');
  const [usage] = await pool.query(
    'SELECT role, SUM(tokens) AS tokens, SUM(requests) AS requests, COUNT(*) AS subjects FROM token_usage WHERE period = ? GROUP BY role',
    [period],
  );
  const [corpus] = await pool.query('SELECT status, COUNT(*) AS n, SUM(chunk_count) AS chunks FROM sources GROUP BY status');
  const [[conv]] = await pool.query('SELECT COUNT(*) AS n FROM conversations');
  res.json({
    period,
    users,
    usage: usage.map((u) => ({ ...u, tokens: Number(u.tokens), requests: Number(u.requests), limit: limitFor(u.role) })),
    corpus: corpus.map((c) => ({ ...c, chunks: Number(c.chunks) })),
    conversations: conv.n,
    indexing: isIndexing(),
    models: { chat: config.llm.model, chatUrl: config.llm.baseUrl, embed: config.embed.model, provider: config.llm.provider },
  });
});

router.get('/users', async (req, res) => {
  const q = `%${String(req.query.q ?? '').trim()}%`;
  const [rows] = await pool.query(
    `SELECT u.id, u.email, u.name, u.role, u.active, u.email_verified_at IS NOT NULL AS verified, u.created_at AS createdAt,
            COALESCE(t.tokens, 0) AS tokens
     FROM users u LEFT JOIN token_usage t ON t.subject = CONCAT('user:', u.id) AND t.period = ?
     WHERE u.email LIKE ? OR u.name LIKE ?
     ORDER BY u.created_at DESC LIMIT 200`,
    [currentPeriod(), q, q],
  );
  res.json({ users: rows.map((u) => ({ ...u, active: !!u.active, verified: !!u.verified, limit: limitFor(u.role) })) });
});

router.patch('/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { role, active } = req.body;
  if (id === req.user.id) throw fail(400, 'No puedes cambiar tu propio rol ni desactivar tu cuenta');
  if (role !== undefined && (!ROLE_RE.test(role) || role === 'anon')) {
    throw fail(400, 'Rol no válido: usa minúsculas, números o guion bajo (p. ej. registered, admin, docente)');
  }
  if (active !== undefined && typeof active !== 'boolean') throw fail(400, 'active debe ser verdadero o falso');
  const [r] = await pool.query('UPDATE users SET role = COALESCE(?, role), active = COALESCE(?, active) WHERE id = ?', [
    role ?? null,
    active === undefined ? null : Number(active),
    id,
  ]);
  if (!r.affectedRows) throw fail(404, 'Usuario no encontrado');
  res.json({ ok: true });
});

router.get('/sources', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, code, kind, title, category, status_legal AS statusLegal, url, status, error, chunk_count AS chunks,
            embed_model AS embedModel, indexed_at AS indexedAt
     FROM sources ORDER BY kind = 'archivo' DESC, code IS NULL, code, id`,
  );
  res.json({ sources: rows, indexing: isIndexing(), embedModel: config.embed.model });
});

router.post('/sources/upload', upload.single('file'), async (req, res) => {
  if (!req.file) throw fail(400, 'Adjunta un archivo PDF, HTML, TXT o MD de hasta 25 MB');
  const title = String(req.body.title ?? '').trim() || req.file.originalname;
  const category = String(req.body.category ?? '').trim() || 'Marco Normativo General';
  const [r] = await pool.query(
    "INSERT INTO sources (kind, title, category, status_legal, file_path) VALUES ('archivo', ?, ?, 'vigente', ?)",
    [title.slice(0, 400), category.slice(0, 100), req.file.path],
  );
  background(indexSource(r.insertId));
  res.status(201).json({ id: r.insertId });
});

router.post('/sources/reindex', (req, res) => {
  if (isIndexing()) throw fail(409, 'Ya hay una indexación en curso');
  background(indexAll({ all: req.body.all === true }));
  res.status(202).json({ ok: true });
});

router.post('/sources/:id/reindex', async (req, res) => {
  const [[s]] = await pool.query('SELECT id FROM sources WHERE id = ?', [req.params.id]);
  if (!s) throw fail(404, 'Fuente no encontrada');
  background(indexSource(s.id));
  res.status(202).json({ ok: true });
});

router.delete('/sources/:id', async (req, res) => {
  const [[s]] = await pool.query('SELECT id, kind, file_path FROM sources WHERE id = ?', [req.params.id]);
  if (!s) throw fail(404, 'Fuente no encontrada');
  if (s.kind !== 'archivo') throw fail(400, 'Las normas de la matriz se editan en api/data/normas.json');
  await pool.query('DELETE FROM sources WHERE id = ?', [s.id]);
  await fs.rm(s.file_path, { force: true });
  res.json({ ok: true });
});

export default router;
