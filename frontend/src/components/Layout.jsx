import { Link, Outlet } from 'react-router-dom';
import UnverifiedBanner from './UnverifiedBanner';

export default function Layout() {
  // US-03: pasar el usuario del AuthContext
  const user = null;

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
        <UnverifiedBanner user={user} />
        <Outlet />
      </main>
    </div>
  );
}
