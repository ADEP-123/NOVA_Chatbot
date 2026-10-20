import { Link } from 'react-router';
import { useAuth } from '../auth.jsx';
import ThemeToggle from './ThemeToggle.jsx';

function UserMenu() {
  const { user, loading, logout } = useAuth();
  if (loading) return null;
  if (!user) {
    return (
      <>
        <Link className="btn btn-ghost" to="/login">
          Iniciar sesión
        </Link>
        <Link className="btn btn-primary hide-sm" to="/registro">
          Crear cuenta
        </Link>
      </>
    );
  }
  return (
    <>
      {user.role === 'admin' && (
        <Link className="btn btn-ghost" to="/admin">
          Admin
        </Link>
      )}
      <span className="user-name hide-sm" title={user.email}>
        {user.name}
      </span>
      <button type="button" className="btn btn-ghost" onClick={logout}>
        Salir
      </button>
    </>
  );
}

export default function Layout({ children }) {
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            N
          </span>
          <span>
            <strong>NOVA</strong>
            <small>Normativa tributaria colombiana</small>
          </span>
        </Link>
        <nav className="topbar-actions" aria-label="Cuenta">
          <UserMenu />
          <ThemeToggle />
        </nav>
      </header>
      <main className="content">{children}</main>
      <footer className="footer">Consultorio Empresarial UDES | Proyecto PROP-DET07-26</footer>
    </div>
  );
}
