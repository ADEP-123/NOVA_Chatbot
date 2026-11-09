import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { setupServer, client } from './helpers.js';
import { pool } from '../src/db.js';
import { hashPassword } from '../src/auth/passwords.js';
import { search } from '../src/rag/search.js';

const ctx = setupServer();

async function login(email, role = 'registered') {
  await pool.query(
    "INSERT INTO users (email, name, password_hash, role, email_verified_at, data_consent_at) VALUES (?, 'U', ?, ?, NOW(), NOW())",
    [email, await hashPassword('clave-segura'), role],
  );
  const api = client(ctx);
  await api('POST', '/api/auth/login', { email, password: 'clave-segura' });
  return api;
}

test('solo el admin entra al panel', async () => {
  const user = await login('user@x.co');
  assert.equal((await user('GET', '/api/admin/stats')).status, 403);
  assert.equal((await client(ctx)('GET', '/api/admin/users')).status, 403);
});

test('admin: estadísticas, usuarios, cambio de rol y desactivación', async () => {
  const admin = await login('admin@x.co', 'admin');
  const stats = await admin('GET', '/api/admin/stats');
  assert.equal(stats.status, 200);
  assert.ok(stats.body.models.chat);

  const list = await admin('GET', '/api/admin/users?q=user@');
  assert.equal(list.body.users.length, 1);
  const target = list.body.users[0];

  assert.equal((await admin('PATCH', `/api/admin/users/${target.id}`, { role: 'Docente!' })).status, 400);
  assert.equal((await admin('PATCH', `/api/admin/users/${target.id}`, { role: 'anon' })).status, 400);
  assert.equal((await admin('PATCH', `/api/admin/users/${target.id}`, { role: 'docente', active: false })).status, 200);
  const [[u]] = await pool.query('SELECT role, active FROM users WHERE id = ?', [target.id]);
  assert.deepEqual({ ...u }, { role: 'docente', active: 0 });

  const [[me]] = await pool.query("SELECT id FROM users WHERE email = 'admin@x.co'");
  assert.equal((await admin('PATCH', `/api/admin/users/${me.id}`, { role: 'registered' })).status, 400);
});

test('admin: sube un documento, se indexa, se encuentra y se borra', async () => {
  const admin = client(ctx);
  await admin('POST', '/api/auth/login', { email: 'admin@x.co', password: 'clave-segura' });

  const bad = new FormData();
  bad.append('file', new Blob(['x']), 'virus.exe');
  assert.equal((await admin('POST', '/api/admin/sources/upload', bad)).status, 400);

  const form = new FormData();
  form.append('title', 'Concepto DIAN de prueba');
  form.append('category', 'IVA');
  form.append('file', new Blob(['Concepto sobre la tarifa diferencial del IVA para bicicletas eléctricas: aplica el cinco por ciento.']), 'concepto.txt');
  const up = await admin('POST', '/api/admin/sources/upload', form);
  assert.equal(up.status, 201);

  let source;
  for (let i = 0; i < 50 && source?.status !== 'indexed'; i++) {
    await sleep(50);
    source = (await admin('GET', '/api/admin/sources')).body.sources.find((s) => s.id === up.body.id);
  }
  assert.equal(source.status, 'indexed');
  assert.equal((await search('IVA bicicletas eléctricas'))[0].title, 'Concepto DIAN de prueba');

  assert.equal((await admin('DELETE', `/api/admin/sources/${up.body.id}`)).status, 200);
  assert.equal((await search('IVA bicicletas eléctricas')).length, 0);
});
