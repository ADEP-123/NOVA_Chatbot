import { useState } from 'react';

// Tarjeta de formulario con manejo de envío, error y mensaje de éxito.
export default function AuthCard({ title, subtitle, submitLabel, onSubmit, children, footer }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handle(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const msg = await onSubmit(new FormData(e.currentTarget));
      if (msg) setMessage(msg);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={handle}>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
        {error && (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="alert alert-ok" role="status">
            {message}
          </p>
        )}
        {submitLabel && (
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Enviando…' : submitLabel}
          </button>
        )}
        {footer && <div className="auth-footer">{footer}</div>}
      </form>
    </div>
  );
}

export function Field({ label, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}
