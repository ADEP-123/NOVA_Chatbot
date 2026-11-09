import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { estimateTokens, llm } from '../llm.js';
import { addUsage, getQuota } from '../quota.js';
import { requireUser } from '../auth/middleware.js';
import { buildMessages } from '../chat/prompt.js';
import { search } from '../rag/search.js';

const router = Router();

const MAX_QUESTION = 2000;
const HISTORY_TURNS = 6; // mensajes previos que se le pasan al modelo

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

// Historial que manda el navegador de un usuario anónimo: no se confía en él, se limpia.
function cleanHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
    .slice(-HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
}

async function ownConversation(userId, id) {
  const [[conv]] = await pool.query('SELECT id, title FROM conversations WHERE id = ? AND user_id = ?', [id, userId]);
  if (!conv) throw fail(404, 'Conversación no encontrada');
  return conv;
}

// Protege el modelo de ráfagas de peticiones desde una misma IP.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.CHAT_RATE_LIMIT || 20),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Estás enviando preguntas muy rápido. Espera un momento.' },
});

const PERIOD_TEXT = { day: 'diario', month: 'mensual' };

// Enviar una pregunta. Responde con Server-Sent Events: meta, token..., done | error.
router.post('/', chatLimiter, async (req, res) => {
  const question = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  if (!question || question.length > MAX_QUESTION) throw fail(400, `Escribe una pregunta de hasta ${MAX_QUESTION} caracteres`);

  const quota = await getQuota(req);
  if (quota.limit && quota.used >= quota.limit) {
    const extra = req.user ? '' : ' Crea una cuenta para tener un límite mayor.';
    throw fail(429, `Alcanzaste tu límite ${PERIOD_TEXT[quota.period]} de ${quota.limit.toLocaleString('es-CO')} tokens.${extra}`);
  }

  let conversationId = null;
  let history;
  if (req.user) {
    if (req.body.conversationId) {
      conversationId = (await ownConversation(req.user.id, req.body.conversationId)).id;
      const [rows] = await pool.query(
        'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?',
        [conversationId, HISTORY_TURNS],
      );
      history = rows.reverse();
    } else {
      const [r] = await pool.query('INSERT INTO conversations (user_id, title) VALUES (?, ?)', [req.user.id, question.slice(0, 80)]);
      conversationId = r.insertId;
      history = [];
    }
  } else {
    req.session.anon = true; // crea la sesión anónima (sirve para medir su uso)
    history = cleanHistory(req.body.history);
  }

  // Para preguntas de seguimiento ("¿y para personas jurídicas?") se busca también con la pregunta anterior.
  const previous = history.findLast((m) => m.role === 'user')?.content ?? '';
  let results;
  try {
    results = await search(previous ? `${previous.slice(0, 500)}\n${question}` : question);
  } catch (err) {
    console.error('Error en la búsqueda del corpus:', err.message);
    if (conversationId && !history.length) await pool.query('DELETE FROM conversations WHERE id = ?', [conversationId]);
    throw fail(503, 'El servicio de IA no está disponible en este momento. Intenta de nuevo en unos minutos.');
  }
  const sources = [...new Map(results.map((r) => [r.sourceId, { title: r.title, url: r.url, statusLegal: r.statusLegal }])).values()];

  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const abort = new AbortController();
  res.on('close', () => !res.writableEnded && abort.abort());

  send('meta', { conversationId, sources });
  const messages = buildMessages({ question, history, results });
  let answer = '';
  let usage = null;
  try {
    const out = await llm.chat(messages, {
      signal: abort.signal,
      onToken: (t) => {
        answer += t;
        send('token', { t });
      },
    });
    usage = out.usage;
  } catch (err) {
    if (!abort.signal.aborted) {
      console.error('Error del modelo:', err.message);
      send('error', { error: 'El modelo de IA no está disponible en este momento. Intenta de nuevo en unos minutos.' });
    }
  }

  // Si se cortó (el usuario detuvo o falló el modelo) no hay conteo del proveedor: se estima.
  usage ??= { prompt: answer ? estimateTokens(messages.map((m) => m.content).join('\n')) : 0, completion: estimateTokens(answer) };
  if (usage.prompt + usage.completion > 0) await addUsage(req, usage.prompt + usage.completion);

  // Se guarda incluso una respuesta cortada por el usuario, para no perder lo que ya vio.
  let messageId = null;
  if (conversationId && answer) {
    await pool.query('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)', [conversationId, 'user', question]);
    const [r] = await pool.query(
      'INSERT INTO messages (conversation_id, role, content, sources, prompt_tokens, completion_tokens) VALUES (?, ?, ?, ?, ?, ?)',
      [conversationId, 'assistant', answer, JSON.stringify(sources), usage.prompt, usage.completion],
    );
    messageId = r.insertId;
    await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = ?', [conversationId]);
  } else if (conversationId && !history.length) {
    await pool.query('DELETE FROM conversations WHERE id = ?', [conversationId]); // no quedan conversaciones vacías
  }
  if (!res.writableEnded) {
    if (answer) send('done', { messageId, usage, quota: await getQuota(req) });
    res.end();
  }
});

router.get('/conversations', requireUser, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, title, updated_at AS updatedAt FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100',
    [req.user.id],
  );
  res.json({ conversations: rows });
});

router.get('/conversations/:id', requireUser, async (req, res) => {
  const conv = await ownConversation(req.user.id, req.params.id);
  const [messages] = await pool.query(
    'SELECT id, role, content, sources, created_at AS createdAt FROM messages WHERE conversation_id = ? ORDER BY id',
    [conv.id],
  );
  res.json({ conversation: conv, messages });
});

router.delete('/conversations/:id', requireUser, async (req, res) => {
  const conv = await ownConversation(req.user.id, req.params.id);
  await pool.query('DELETE FROM conversations WHERE id = ?', [conv.id]);
  res.json({ ok: true });
});

export default router;
