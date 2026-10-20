import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { pool } from '../db.js';
import { embedder } from '../llm.js';
import { chunkText, download, extractText } from './text.js';

const DATA_DIR = path.join(import.meta.dirname, '../../data');
const EMBED_BATCH = 16;

const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase();

// Carga normas.json y preguntas.json en la tabla sources. Si una fuente cambió, queda pendiente de reindexar.
export async function syncSeeds() {
  const normas = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'normas.json'), 'utf8'));
  const preguntas = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'preguntas.json'), 'utf8'));

  const rows = normas.map((n) => [n.codigo, 'norma', n.identificacion, n.categoria, n.estado, n.url, n, n.ingest_urls]);
  const byCategory = Map.groupBy(preguntas, (q) => q.categoria);
  for (const [category, items] of byCategory) {
    rows.push([`QA-${slug(category)}`, 'preguntas', `Preguntas de referencia: ${category}`, category, null, null, items, []]);
  }

  for (const [code, kind, title, category, statusLegal, url, meta, ingestUrls] of rows) {
    await pool.query(
      `INSERT INTO sources (code, kind, title, category, status_legal, url, meta, ingest_urls)
       VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON)) AS new
       ON DUPLICATE KEY UPDATE
         status = IF(sources.meta = new.meta AND sources.ingest_urls = new.ingest_urls, sources.status, 'pending'),
         title = new.title, category = new.category, status_legal = new.status_legal, url = new.url,
         meta = new.meta, ingest_urls = new.ingest_urls`,
      [code, kind, title.slice(0, 400), category, statusLegal, url, JSON.stringify(meta), JSON.stringify(ingestUrls)],
    );
  }
  return rows.length;
}

function fichaNorma(n) {
  return [
    `Ficha normativa: ${n.identificacion}`,
    `Tipo: ${n.tipo} | Fecha de expedición: ${n.fecha} | Categoría: ${n.categoria} | Estado: ${n.estado}`,
    `Descripción y alcance: ${n.descripcion}`,
    `Sujetos obligados: ${n.sujetos}`,
    `Relevancia: ${n.relevancia}`,
    n.nota && `Nota: ${n.nota}`,
    n.url && `Fuente oficial: ${n.url}`,
  ]
    .filter(Boolean)
    .join('\n');
}

// Devuelve los textos de una fuente (cada uno se parte después) y los errores no fatales.
async function collectTexts(source) {
  const warnings = [];
  if (source.kind === 'preguntas') {
    return {
      texts: source.meta.map((q) => `[${source.title}]\nPregunta: ${q.pregunta}\nRespuesta: ${q.respuesta}\nFuente: ${q.fuente}`),
      prechunked: true,
      warnings,
    };
  }
  if (source.kind === 'archivo') {
    const buffer = await fs.readFile(source.file_path);
    return { texts: [await extractText(buffer, { name: source.file_path })], warnings };
  }
  // norma: la ficha de la matriz siempre se indexa; el texto completo, si se logra descargar.
  const texts = [fichaNorma(source.meta)];
  for (const url of source.ingest_urls ?? []) {
    try {
      const text = await download(url);
      texts.push(text);
      break; // basta con la primera URL que funcione
    } catch (err) {
      warnings.push(`${url}: ${err.message}${err.cause ? ` (${err.cause.code || err.cause.message})` : ''}`);
    }
  }
  if (source.ingest_urls?.length && texts.length === 1) warnings.unshift('No se pudo descargar el texto completo; solo se indexó la ficha de la matriz.');
  return { texts, warnings };
}

async function embedAll(chunks, onProgress) {
  const vectors = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    for (const v of await embedder.embed(chunks.slice(i, i + EMBED_BATCH))) {
      const norm = Math.hypot(...v) || 1;
      vectors.push(Buffer.from(Float32Array.from(v, (x) => x / norm).buffer));
    }
    onProgress?.(Math.min(i + EMBED_BATCH, chunks.length), chunks.length);
  }
  return vectors;
}

export async function indexSource(id, { log = () => {} } = {}) {
  const [[source]] = await pool.query('SELECT * FROM sources WHERE id = ?', [id]);
  if (!source) throw new Error(`Fuente ${id} no existe`);
  await pool.query("UPDATE sources SET status = 'indexing', error = NULL WHERE id = ?", [id]);
  try {
    const { texts, prechunked, warnings } = await collectTexts(source);
    const chunks = prechunked ? texts : texts.flatMap((t) => chunkText(t, source.title));
    if (!chunks.length) throw new Error('La fuente no tiene texto');
    log(`  ${chunks.length} fragmentos`);
    const vectors = await embedAll(chunks, (done, total) => total > 100 && done % 160 === 0 && log(`  embeddings ${done}/${total}`));

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM chunks WHERE source_id = ?', [id]);
      for (let i = 0; i < chunks.length; i += 200) {
        const rows = chunks.slice(i, i + 200).map((c, j) => [id, i + j, c, vectors[i + j]]);
        await conn.query('INSERT INTO chunks (source_id, ord, content, embedding) VALUES ?', [rows]);
      }
      await conn.query(
        'UPDATE sources SET status = ?, error = ?, chunk_count = ?, embed_model = ?, indexed_at = NOW() WHERE id = ?',
        [warnings.length ? 'partial' : 'indexed', warnings.join('\n') || null, chunks.length, config.embed.model, id],
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    if (warnings.length) log(`  aviso: ${warnings.join(' | ')}`);
  } catch (err) {
    await pool.query("UPDATE sources SET status = 'error', error = ? WHERE id = ?", [err.message.slice(0, 2000), id]);
    log(`  ERROR: ${err.message}`);
  }
}

// Indexa las fuentes pendientes, o todas con { all: true }. Solo una indexación a la vez por proceso.
let running = null;
export function indexAll({ all = false, log = console.log } = {}) {
  running ??= (async () => {
    try {
      const where = all ? '1' : "status IN ('pending', 'indexing', 'error') OR embed_model IS NULL OR embed_model <> ?";
      const [rows] = await pool.query(`SELECT id, title FROM sources WHERE ${where} ORDER BY id`, [config.embed.model]);
      for (const [i, s] of rows.entries()) {
        log(`[${i + 1}/${rows.length}] ${s.title}`);
        await indexSource(s.id, { log });
      }
      return rows.length;
    } finally {
      running = null;
    }
  })();
  return running;
}

export const isIndexing = () => running !== null;
