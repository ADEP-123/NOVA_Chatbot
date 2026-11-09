import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupServer, client } from './helpers.js';
import { currentPeriod, limitFor } from '../src/quota.js';

const ctx = setupServer();

test('límites por rol desde el entorno', () => {
  process.env.QUOTA_DOCENTE = '777';
  assert.equal(limitFor('docente'), 777);
  delete process.env.QUOTA_DOCENTE;
  process.env.QUOTA_REGISTERED = '1234';
  assert.equal(limitFor('docente'), 1234, 'un rol sin variable usa el de registrados');
  assert.equal(limitFor('admin'), 0, 'admin es ilimitado por defecto');
  delete process.env.QUOTA_REGISTERED;
});

test('periodo diario o mensual en hora de Colombia', () => {
  const t = new Date('2026-11-01T03:00:00Z'); // 31 de octubre, 10 p. m. en Bogotá
  assert.equal(currentPeriod(t), '2026-10-31');
  process.env.QUOTA_PERIOD = 'month';
  assert.equal(currentPeriod(t), '2026-10');
  delete process.env.QUOTA_PERIOD;
});

test('el anónimo se bloquea al agotar su cuota y otra sesión no se ve afectada', async () => {
  process.env.QUOTA_ANON = '50';
  const api = client(ctx);
  const first = await api('POST', '/api/chat', { message: '¿Cuál es la tarifa del IVA?' });
  assert.equal(first.status, 200);
  const me = await api('GET', '/api/auth/me');
  assert.equal(me.body.quota.limit, 50);
  assert.ok(me.body.quota.used > 0);

  // El modelo de prueba usa más de 50 tokens por pregunta, así que la segunda ya se bloquea.
  const blocked = await api('POST', '/api/chat', { message: 'otra' });
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.error, /límite diario de 50 tokens.*Crea una cuenta/);

  const other = client(ctx);
  assert.equal((await other('POST', '/api/chat', { message: 'hola' })).status, 200);
  delete process.env.QUOTA_ANON;
});
