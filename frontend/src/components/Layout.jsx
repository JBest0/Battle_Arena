import { Link, Outlet } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="app">
      <header className="app-header">
        <Link className="app-brand" to="/">
          Battle Arena
        </Link>
        <nav className="app-nav">
          {/* PlayerBadge irá aquí (US-06) */}
          <Link to="/register">Crear cuenta</Link>
          <Link to="/login">Iniciar sesión</Link>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
