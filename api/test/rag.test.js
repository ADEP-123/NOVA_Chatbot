import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setupServer } from './helpers.js';
import { pool } from '../src/db.js';
import { chunkText, extractText } from '../src/rag/text.js';
import { indexAll, syncSeeds } from '../src/rag/ingest.js';
import { search } from '../src/rag/search.js';

setupServer();

// Página "oficial" de prueba en latin1, como algunas del normograma.
const page = Buffer.from(
  `<html><head><meta charset="iso-8859-1"></head><body><nav>Menú</nav>
   <p>ARTÍCULO 592. QUIENES NO ESTÁN OBLIGADOS A DECLARAR.</p><p>No están obligados a presentar declaración de renta los asalariados cuyos ingresos brutos sean inferiores a 1.400 UVT.</p>
   <p>ARTÍCULO 593. ASALARIADOS NO OBLIGADOS.</p><p>Texto sobre asalariados y retención.</p></body></html>`,
  'latin1',
);
const web = http.createServer((req, res) => {
  if (req.url === '/ok.htm') return res.writeHead(200, { 'content-type': 'text/html' }).end(page);
  res.writeHead(404).end();
});
await new Promise((r) => web.listen(0, r));
const base = `http://127.0.0.1:${web.address().port}`;
after(() => web.close());

test('chunkText respeta artículos y tamaño', () => {
  const text = ['ARTÍCULO 1. Objeto.', 'a '.repeat(500), 'ARTÍCULO 2-1. Otro.', 'b '.repeat(900)].join('\n');
  const chunks = chunkText(text, 'ET', 600);
  assert.ok(chunks.every((c) => c.length < 700));
  assert.match(chunks[0], /^\[ET — Artículo 1\]/);
  assert.ok(chunks.some((c) => c.startsWith('[ET — Artículo 2-1]')));
});

test('extractText decodifica HTML latin1 y omite la navegación', async () => {
  const text = await extractText(page, { contentType: 'text/html' });
  assert.match(text, /ARTÍCULO 592\. QUIENES NO ESTÁN/);
  assert.doesNotMatch(text, /Menú/);
});

test('syncSeeds carga la matriz y las preguntas; un cambio deja la fuente pendiente', async () => {
  assert.equal(await syncSeeds(), 55);
  await pool.query("UPDATE sources SET status = 'indexed'");
  await syncSeeds();
  const [[same]] = await pool.query("SELECT COUNT(*) AS n FROM sources WHERE status = 'pending'");
  assert.equal(same.n, 0, 'sin cambios no se marca nada');
  await pool.query("UPDATE sources SET meta = JSON_SET(meta, '$.descripcion', 'vieja') WHERE code = 'N01'");
  await syncSeeds();
  const [[changed]] = await pool.query("SELECT status FROM sources WHERE code = 'N01'");
  assert.equal(changed.status, 'pending');
  await pool.query('DELETE FROM sources');
});

test('indexa una norma (ficha + texto descargado) y la búsqueda la encuentra', async () => {
  const meta = {
    identificacion: 'Artículo 592 ET', tipo: 'ET', fecha: 'Permanente', categoria: 'Impuesto de Renta', estado: 'vigente',
    descripcion: 'No obligados a declarar renta', sujetos: 'Personas naturales', relevancia: 'Alta', url: `${base}/ok.htm`,
  };
  await pool.query(
    "INSERT INTO sources (code, kind, title, category, meta, ingest_urls) VALUES ('T1', 'norma', 'Artículo 592 ET', 'Impuesto de Renta', ?, ?)",
    [JSON.stringify(meta), JSON.stringify([`${base}/nada.htm`, `${base}/ok.htm`])],
  );
  const qa = [{ pregunta: '¿Cuál es la tarifa general del IVA?', respuesta: 'La tarifa general es del **19%**.', fuente: 'ET, Artículo 468.' }];
  await pool.query(
    "INSERT INTO sources (code, kind, title, category, meta, ingest_urls) VALUES ('T2', 'preguntas', 'Preguntas IVA', 'IVA', ?, '[]')",
    [JSON.stringify(qa)],
  );

  assert.equal(await indexAll({ log: () => {} }), 2);
  const [rows] = await pool.query('SELECT code, status, chunk_count, error FROM sources ORDER BY code');
  assert.equal(rows[0].status, 'partial', 'la primera URL falló pero la segunda sirvió');
  assert.match(rows[0].error, /nada\.htm: HTTP 404/);
  assert.ok(rows[0].chunk_count >= 2);
  assert.equal(rows[1].status, 'indexed');

  const iva = await search('tarifa general del IVA');
  assert.equal(iva[0].title, 'Preguntas IVA');

  const renta = await search('¿qué dice el artículo 593 sobre asalariados?');
  assert.match(renta[0].content, /ARTÍCULO 593/);
});
