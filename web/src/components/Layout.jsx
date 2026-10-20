import ThemeToggle from './ThemeToggle.jsx';

export default function Layout({ children, actions }) {
  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">N</span>
          <span>
            <strong>NOVA</strong>
            <small>Normativa tributaria colombiana</small>
          </span>
        </a>
        <nav className="topbar-actions">
          {actions}
          <ThemeToggle />
        </nav>
      </header>
      <main className="content">{children}</main>
      <footer className="footer">Consultorio Empresarial UDES | Proyecto PROP-DET07-26</footer>
    </div>
  );
}
