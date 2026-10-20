import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import AuthCard, { Field } from '../components/AuthCard.jsx';

const post = (path, body) => api(path, { method: 'POST', body });

export function Login() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [unverifiedEmail, setUnverifiedEmail] = useState('');

  async function submit(form) {
    const email = form.get('email');
    try {
      await post('/auth/login', { email, password: form.get('password') });
    } catch (err) {
      if (err.data?.needsVerification) setUnverifiedEmail(email);
      throw err;
    }
    await refresh();
    navigate('/');
  }

  return (
    <AuthCard
      title="Iniciar sesión"
      subtitle="Con tu cuenta se guarda el historial de tus consultas."
      submitLabel="Entrar"
      onSubmit={submit}
      footer={
        <>
          <Link to="/recuperar">¿Olvidaste tu contraseña?</Link>
          <span>
            ¿No tienes cuenta? <Link to="/registro">Créala aquí</Link>
          </span>
        </>
      }
    >
      <Field label="Correo electrónico" name="email" type="email" autoComplete="email" required />
      <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required />
      {unverifiedEmail && <ResendVerification email={unverifiedEmail} />}
    </AuthCard>
  );
}

function ResendVerification({ email }) {
  const [msg, setMsg] = useState('');
  return (
    <p className="muted small">
      ¿No te llegó el correo?{' '}
      <button
        type="button"
        className="link-btn"
        onClick={async () => setMsg((await post('/auth/resend-verification', { email })).message)}
      >
        Reenviar enlace de confirmación
      </button>
      {msg && <span className="block">{msg}</span>}
    </p>
  );
}

export function Register() {
  const [done, setDone] = useState(false);

  async function submit(form) {
    const password = form.get('password');
    if (password !== form.get('password2')) throw new Error('Las contraseñas no coinciden');
    const res = await post('/auth/register', {
      name: form.get('name'),
      email: form.get('email'),
      password,
      consent: form.get('consent') === 'on',
    });
    setDone(true);
    return res.message;
  }

  return (
    <AuthCard
      title="Crear cuenta"
      subtitle="Te enviaremos un correo para confirmar tu dirección."
      submitLabel={done ? null : 'Crear cuenta'}
      onSubmit={submit}
      footer={
        <span>
          ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
        </span>
      }
    >
      <Field label="Nombre" name="name" autoComplete="name" required minLength={2} maxLength={120} />
      <Field label="Correo electrónico" name="email" type="email" autoComplete="email" required />
      <Field label="Contraseña (mínimo 8 caracteres)" name="password" type="password" autoComplete="new-password" required minLength={8} />
      <Field label="Repite la contraseña" name="password2" type="password" autoComplete="new-password" required minLength={8} />
      <label className="check">
        <input type="checkbox" name="consent" required />
        <span>
          Acepto la <Link to="/privacidad" target="_blank">política de tratamiento de datos personales</Link> (Ley 1581 de 2012).
        </span>
      </label>
    </AuthCard>
  );
}

export function Verify() {
  const [params] = useSearchParams();
  const [state, setState] = useState({ loading: true });
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return; // StrictMode monta dos veces; el token es de un solo uso
    sent.current = true;
    post('/auth/verify', { token: params.get('token') })
      .then((r) => setState({ message: r.message }))
      .catch((e) => setState({ error: e.message }));
  }, [params]);

  return (
    <AuthCard title="Confirmar correo" footer={<Link to="/login">Ir a iniciar sesión</Link>}>
      {state.loading && <p className="muted">Confirmando…</p>}
      {state.message && <p className="alert alert-ok">{state.message}</p>}
      {state.error && <p className="alert alert-error">{state.error}</p>}
    </AuthCard>
  );
}

export function Forgot() {
  return (
    <AuthCard
      title="Recuperar contraseña"
      subtitle="Escribe tu correo y te enviaremos un enlace para crear una nueva."
      submitLabel="Enviar enlace"
      onSubmit={async (form) => (await post('/auth/forgot', { email: form.get('email') })).message}
      footer={<Link to="/login">Volver a iniciar sesión</Link>}
    >
      <Field label="Correo electrónico" name="email" type="email" autoComplete="email" required />
    </AuthCard>
  );
}

export function Reset() {
  const [params] = useSearchParams();

  async function submit(form) {
    const password = form.get('password');
    if (password !== form.get('password2')) throw new Error('Las contraseñas no coinciden');
    return (await post('/auth/reset', { token: params.get('token'), password })).message;
  }

  return (
    <AuthCard title="Nueva contraseña" submitLabel="Guardar contraseña" onSubmit={submit} footer={<Link to="/login">Ir a iniciar sesión</Link>}>
      <Field label="Nueva contraseña (mínimo 8 caracteres)" name="password" type="password" autoComplete="new-password" required minLength={8} />
      <Field label="Repite la contraseña" name="password2" type="password" autoComplete="new-password" required minLength={8} />
    </AuthCard>
  );
}
