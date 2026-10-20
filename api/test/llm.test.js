import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createProvider } from '../src/llm.js';

// Servidor que imita una API compatible con OpenAI, con el stream partido en pedazos arbitrarios.
const received = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    received.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
    if (req.url === '/v1/embeddings') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] }));
    }
    if (req.url === '/v1/fail') return res.writeHead(500).end('boom');
    const events = [
      { choices: [{ delta: { content: 'Hola ' } }] },
      { choices: [{ delta: { content: 'ñandú' } }] },
      { choices: [], usage: { prompt_tokens: 11, completion_tokens: 2 } },
    ];
    const raw = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n';
    const bytes = Buffer.from(raw);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (let i = 0; i < bytes.length; i += 7) {
      res.write(bytes.subarray(i, i + 7)); // corta incluso caracteres multibyte
      await new Promise((r) => setImmediate(r));
    }
    res.end();
  });
});
await new Promise((r) => server.listen(0, r));
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
after(() => server.close());

test('chat: une el stream, avisa cada token y usa el conteo del proveedor', async () => {
  const p = createProvider({ provider: 'openai', baseUrl, apiKey: 'k', model: 'm', temperature: 0, maxTokens: 50 });
  const tokens = [];
  const out = await p.chat([{ role: 'user', content: 'hola' }], { onToken: (t) => tokens.push(t) });
  assert.equal(out.text, 'Hola ñandú');
  assert.deepEqual(tokens, ['Hola ', 'ñandú']);
  assert.deepEqual(out.usage, { prompt: 11, completion: 2 });
  const req = received.at(-1);
  assert.equal(req.auth, 'Bearer k');
  assert.equal(req.body.stream, true);
  assert.equal(req.body.model, 'm');
});

test('embed: respeta el orden por index', async () => {
  const p = createProvider({ provider: 'openai', baseUrl, model: 'e' });
  assert.deepEqual(await p.embed(['a', 'b']), [[1, 0], [0, 1]]);
});

test('errores del proveedor llegan con mensaje claro', async () => {
  const p = createProvider({ provider: 'openai', baseUrl: baseUrl.replace('/v1', '/v1/fail#'), model: 'm' });
  await assert.rejects(p.chat([{ role: 'user', content: 'x' }]), /respondió 500/);
  const down = createProvider({ provider: 'openai', baseUrl: 'http://127.0.0.1:1', model: 'm' });
  await assert.rejects(down.chat([{ role: 'user', content: 'x' }]), /No se pudo conectar/);
});

test('fake: embeddings parecidos para textos parecidos', async () => {
  const p = createProvider({ provider: 'fake' });
  const [a, b, c] = await p.embed(['tarifa del IVA general', 'tarifa general de IVA', 'nómina electrónica plazo']);
  const dot = (x, y) => x.reduce((s, v, i) => s + v * y[i], 0);
  assert.ok(dot(a, b) > dot(a, c));
});
