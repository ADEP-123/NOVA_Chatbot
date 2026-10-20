import { config } from '../config.js';
import { pool } from '../db.js';
import { embedder } from '../llm.js';

// shortcut: todos los vectores en memoria y búsqueda lineal; va bien hasta ~100.000 fragmentos.
// Si el corpus crece más, pasar a una base vectorial (Qdrant, pgvector).
let cache = { stamp: null, items: [] };

async function loadIndex() {
  const model = config.embed.model;
  const [[s]] = await pool.query(
    "SELECT COUNT(*) AS n, MAX(indexed_at) AS t, SUM(chunk_count) AS c FROM sources WHERE embed_model = ? AND status IN ('indexed', 'partial')",
    [model],
  );
  const stamp = `${model}|${s.n}|${s.t?.toISOString?.() ?? s.t}|${s.c}`;
  if (cache.stamp === stamp) return cache.items;

  const [rows] = await pool.query(
    `SELECT c.content, c.embedding, s.id AS sourceId, s.title, s.category, s.url, s.status_legal AS statusLegal, s.kind
     FROM chunks c JOIN sources s ON s.id = c.source_id
     WHERE s.embed_model = ? AND s.status IN ('indexed', 'partial')`,
    [model],
  );
  const items = rows.map(({ embedding, ...r }) => ({ ...r, vec: new Float32Array(new Uint8Array(embedding).buffer) }));
  cache = { stamp, items };
  return items;
}

const ARTICLE_IN_QUERY = /\bart(?:[íi]culo|\.)?\s*(\d+(?:-\d+)?)/gi;

export async function search(query, { k = 6, perSource = 3 } = {}) {
  const items = await loadIndex();
  if (!items.length) return [];

  const [raw] = await embedder.embed([query]);
  const norm = Math.hypot(...raw) || 1;
  const q = raw.map((x) => x / norm);
  // Si la pregunta nombra un artículo ("artículo 592"), se priorizan los fragmentos de ese artículo.
  const articles = [...query.matchAll(ARTICLE_IN_QUERY)].map((m) => new RegExp(`Art[íi]culo ${m[1]}(?![\\d-])`, 'i'));

  const scored = items.map((item) => {
    let score = 0;
    const v = item.vec;
    for (let i = 0; i < q.length; i++) score += q[i] * v[i];
    if (articles.length) {
      const header = item.content.slice(0, item.content.indexOf('\n'));
      if (articles.some((re) => re.test(header))) score += 0.15;
    }
    return { item, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const results = [];
  const perSourceCount = new Map();
  for (const { item, score } of scored) {
    const n = perSourceCount.get(item.sourceId) ?? 0;
    if (n >= perSource) continue;
    perSourceCount.set(item.sourceId, n + 1);
    const { vec, ...rest } = item;
    results.push({ ...rest, score });
    if (results.length >= k) break;
  }
  return results;
}
