import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupServer, client } from './helpers.js';
import { outbox } from '../src/mailer.js';
import { hashPassword, verifyPassword } from '../src/auth/passwords.js';
import { pool } from '../src/db.js';

const ctx = setupServer();
const tokenFromLastMail = () => outbox.at(-1).text.match(/token=([\w-]+)/)[1];

test('hash de contraseña verifica solo la correcta', async () => {
  const h = await hashPassword('secreta123');
  assert.equal(await verifyPassword('secreta123', h), true);
  assert.equal(await verifyPassword('otra', h), false);
  assert.equal(await verifyPassword('x', 'basura'), false);
});

test('registro → verificación → login → me → logout', async () => {
  const api = client(ctx);
  const user = { name: 'Ana', email: 'Ana@Correo.co', password: 'clave-segura', consent: true };

  assert.equal((await api('POST', '/api/auth/register', { ...user, consent: false })).status, 400);
  assert.equal((await api('POST', '/api/auth/register', user)).status, 201);
  assert.equal((await api('POST', '/api/auth/register', user)).status, 409);

  const blocked = await api('POST', '/api/auth/login', user);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.needsVerification, true);

  const token = tokenFromLastMail();
  assert.equal((await api('POST', '/api/auth/verify', { token })).status, 200);
  assert.equal((await api('POST', '/api/auth/verify', { token })).status, 400, 'el token es de un solo uso');

  assert.equal((await api('POST', '/api/auth/login', { ...user, password: 'mala-clave' })).status, 401);
  const login = await api('POST', '/api/auth/login', user);
  assert.equal(login.status, 200);
  assert.equal(login.body.user.email, 'ana@correo.co');

  const me = await api('GET', '/api/auth/me');
  assert.equal(me.body.role, 'registered');

  await api('POST', '/api/auth/logout');
  assert.equal((await api('GET', '/api/auth/me')).body.role, 'anon');
});

test('recuperar contraseña', async () => {
  const api = client(ctx);
  const res = await api('POST', '/api/auth/forgot', { email: 'nadie@correo.co' });
  assert.equal(res.status, 200, 'misma respuesta aunque no exista');

  await api('POST', '/api/auth/forgot', { email: 'ana@correo.co' });
  const token = tokenFromLastMail();
  assert.equal((await api('POST', '/api/auth/reset', { token, password: 'corta' })).status, 400);
  assert.equal((await api('POST', '/api/auth/reset', { token, password: 'nueva-clave-1' })).status, 200);
  assert.equal((await api('POST', '/api/auth/login', { email: 'ana@correo.co', password: 'nueva-clave-1' })).status, 200);
});

test('una cuenta desactivada pierde la sesión de inmediato', async () => {
  const api = client(ctx);
  await api('POST', '/api/auth/login', { email: 'ana@correo.co', password: 'nueva-clave-1' });
  await pool.query("UPDATE users SET active = 0 WHERE email = 'ana@correo.co'");
  assert.equal((await api('GET', '/api/auth/me')).body.role, 'anon');
  assert.equal((await api('POST', '/api/auth/login', { email: 'ana@correo.co', password: 'nueva-clave-1' })).status, 403);
});
