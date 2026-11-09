import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

const CATEGORIES = [
  'Marco Normativo General',
  'Facturación Electrónica',
  'Nómina Electrónica',
  'Información Exógena',
  'Impuesto de Renta',
  'IVA',
  'Retención en la Fuente',
  'Régimen Simple (RST)',
  'Obligaciones Formales',
  'Protección de Datos / IA',
];
const STATUS_TEXT = { indexed: 'Indexada', partial: 'Solo ficha', error: 'Error', pending: 'Pendiente', indexing: 'Indexando…' };
const fmt = (n) => Number(n || 0).toLocaleString('es-CO');

function useLoad(fn, deps) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => fn().then(setData, (e) => setError(e.message)), deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [load]);
  return [data, load, error];
}

function Summary() {
  const [s, , error] = useLoad(() => api('/admin/stats'), []);
  if (error) return <p className="alert alert-error">{error}</p>;
  if (!s) return <p className="muted">Cargando…</p>;
  return (
    <div className="stat-grid">
      <div className="card stat">
        <h3>Usuarios</h3>
        {s.users.map((u) => (
          <p key={u.role}>
            <span>{u.role}</span>
            <strong>{fmt(u.n)}</strong>
          </p>
        ))}
        <p>
          <span>Conversaciones guardadas</span>
          <strong>{fmt(s.conversations)}</strong>
        </p>
      </div>
      <div className="card stat">
        <h3>Consumo del periodo {s.period}</h3>
        {!s.usage.length && <p className="muted">Sin consumo aún.</p>}
        {s.usage.map((u) => (
          <p key={u.role}>
            <span>
              {u.role} · {fmt(u.subjects)} {u.role === 'anon' ? 'sesiones' : 'usuarios'} · {fmt(u.requests)} preguntas
            </span>
            <strong>{fmt(u.tokens)} tokens</strong>
          </p>
        ))}
      </div>
      <div className="card stat">
        <h3>Corpus {s.indexing && <span className="badge">indexando</span>}</h3>
        {s.corpus.map((c) => (
          <p key={c.status}>
            <span>{STATUS_TEXT[c.status] ?? c.status}</span>
            <strong>
              {fmt(c.n)} fuentes · {fmt(c.chunks)} fragmentos
            </strong>
          </p>
        ))}
      </div>
      <div className="card stat">
        <h3>Modelos</h3>
        <p>
          <span>Chat ({s.models.provider})</span>
          <strong>{s.models.chat}</strong>
        </p>
        <p>
          <span>Embeddings</span>
          <strong>{s.models.embed}</strong>
        </p>
        <p className="muted small">{s.models.chatUrl}</p>
      </div>
    </div>
  );
}

function Users() {
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const [data, load, error] = useLoad(() => api(`/admin/users?q=${encodeURIComponent(q)}`), [q]);
  const [msg, setMsg] = useState('');

  async function update(id, body) {
    setMsg('');
    try {
      await api(`/admin/users/${id}`, { method: 'PATCH', body });
      load();
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <>
      <div className="admin-toolbar">
        <label className="field grow">
          <span className="sr-only">Buscar usuario</span>
          <input type="search" placeholder="Buscar por nombre o correo" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {(error || msg) && <p className="alert alert-error">{error || msg}</p>}
      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Activo</th>
              <th>Correo confirmado</th>
              <th>Tokens del periodo</th>
            </tr>
          </thead>
          <tbody>
            {data?.users.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                  <span className="block muted small">{u.email}</span>
                </td>
                <td>
                  <input
                    className="role-input"
                    list="roles"
                    defaultValue={u.role}
                    disabled={u.id === me.id}
                    aria-label={`Rol de ${u.name}`}
                    onBlur={(e) => e.target.value !== u.role && update(u.id, { role: e.target.value.trim() })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={u.active}
                    disabled={u.id === me.id}
                    aria-label={`Cuenta de ${u.name} activa`}
                    onChange={(e) => update(u.id, { active: e.target.checked })}
                  />
                </td>
                <td>{u.verified ? 'Sí' : 'No'}</td>
                <td>
                  {fmt(u.tokens)} / {u.limit ? fmt(u.limit) : '∞'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="roles">
          <option value="registered" />
          <option value="admin" />
        </datalist>
      </div>
      <p className="muted small">
        Para crear un tipo de usuario nuevo, escribe su nombre en el rol (p. ej. <code>docente</code>) y define <code>QUOTA_DOCENTE</code> en el .env.
      </p>
    </>
  );
}

function Corpus() {
  const [data, load, error] = useLoad(() => api('/admin/sources'), []);
  const [msg, setMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const busy = data?.indexing || data?.sources.some((s) => s.status === 'indexing');

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [busy, load]);

  async function run(fn) {
    setMsg('');
    try {
      await fn();
      setTimeout(load, 300);
    } catch (e) {
      setMsg(e.message);
    }
  }

  async function onUpload(e) {
    e.preventDefault();
    setUploading(true);
    const form = e.currentTarget;
    await run(async () => {
      const res = await fetch('/api/admin/sources/upload', { method: 'POST', body: new FormData(form) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'No se pudo subir el archivo');
      form.reset();
    });
    setUploading(false);
  }

  return (
    <>
      {(error || msg) && <p className="alert alert-error">{error || msg}</p>}
      <form className="card upload-form" onSubmit={onUpload}>
        <h3>Agregar documento</h3>
        <p className="muted small">PDF con texto seleccionable, HTML o TXT, hasta 25 MB. Úsalo para normas nuevas o las que quedaron en "Solo ficha".</p>
        <div className="upload-grid">
          <label className="field">
            <span>Título (norma y número)</span>
            <input name="title" required maxLength={400} placeholder="Resolución 000XXX de 2026 (tema)" />
          </label>
          <label className="field">
            <span>Categoría</span>
            <select name="category">
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Archivo</span>
            <input name="file" type="file" accept=".pdf,.html,.htm,.txt,.md" required />
          </label>
        </div>
        <button className="btn btn-primary" disabled={uploading}>
          {uploading ? 'Subiendo…' : 'Subir e indexar'}
        </button>
      </form>

      <div className="admin-toolbar">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => api('/admin/sources/reindex', { method: 'POST', body: {} }))}>
          Indexar pendientes
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() =>
            window.confirm('Reindexar todo puede tardar bastante. ¿Continuar?') &&
            run(() => api('/admin/sources/reindex', { method: 'POST', body: { all: true } }))
          }
        >
          Reindexar todo
        </button>
        {busy && <span className="muted small">Indexando… se actualiza solo.</span>}
      </div>

      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>Fuente</th>
              <th>Categoría</th>
              <th>Estado</th>
              <th>Fragmentos</th>
              <th>
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data?.sources.map((s) => (
              <tr key={s.id}>
                <td>
                  <span className="muted small">{s.code ?? 'archivo'}</span>
                  <span className="block">{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}</span>
                  {s.statusLegal && !s.statusLegal.startsWith('vigente') && <span className="badge">{s.statusLegal}</span>}
                </td>
                <td className="small">{s.category}</td>
                <td>
                  <span className={`status status-${s.status}`}>{STATUS_TEXT[s.status] ?? s.status}</span>
                  {s.embedModel && s.embedModel !== data.embedModel && <span className="block small muted">otro modelo: reindexar</span>}
                  {s.error && (
                    <details className="small">
                      <summary>detalle</summary>
                      <pre className="error-detail">{s.error}</pre>
                    </details>
                  )}
                </td>
                <td>{fmt(s.chunks)}</td>
                <td className="actions">
                  <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => run(() => api(`/admin/sources/${s.id}/reindex`, { method: 'POST' }))}>
                    Reindexar
                  </button>
                  {s.kind === 'archivo' && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => window.confirm(`¿Eliminar "${s.title}"?`) && run(() => api(`/admin/sources/${s.id}`, { method: 'DELETE' }))}
                    >
                      Eliminar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const TABS = { resumen: ['Resumen', Summary], usuarios: ['Usuarios', Users], corpus: ['Corpus normativo', Corpus] };

export default function Admin() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState('resumen');
  if (loading) return null;
  if (user?.role !== 'admin') return <p className="welcome">Esta sección es solo para administradores.</p>;
  const Current = TABS[tab][1];
  return (
    <div className="admin page-wide">
      <h1>Panel de administración</h1>
      <div className="tabs" role="tablist">
        {Object.entries(TABS).map(([key, [label]]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      <Current />
    </div>
  );
}
