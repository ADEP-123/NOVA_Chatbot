import { after, before } from 'node:test';
import { pool, migrate } from '../src/db.js';
import { createApp } from '../src/app.js';

if (!process.env.DB_NAME?.endsWith('_test')) throw new Error('Las pruebas solo corren contra una base *_test');

// Base limpia + servidor en un puerto libre para cada archivo de pruebas.
export function setupServer() {
  const ctx = {};
  before(async () => {
    const [tables] = await pool.query('SHOW TABLES');
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of tables) await pool.query(`DROP TABLE \`${Object.values(t)[0]}\``);
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
    await migrate();
    ctx.server = createApp().listen(0);
    await new Promise((r) => ctx.server.once('listening', r));
    ctx.base = `http://127.0.0.1:${ctx.server.address().port}`;
  });
  after(async () => {
    ctx.server.closeAllConnections();
    await new Promise((r) => ctx.server.close(r));
    await pool.end();
  });
  return ctx;
}

// Cliente HTTP con su propia cookie de sesión (simula un navegador).
export function client(ctx) {
  let cookie = '';
  return async function call(method, path, body) {
    const res = await fetch(ctx.base + path, {
      method,
      headers: { 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
  };
}
