import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import PlayerBadge from './PlayerBadge';
import UnverifiedBanner from './UnverifiedBanner';

export default function Layout() {
  const { user, status, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className="app">
      <header className="app-header">
        <Link className="app-brand" to="/">
          Battle Arena
        </Link>
        <nav className="app-nav">
          {status === 'loading' && <span className="nav-muted">Cargando…</span>}

          {user && (
            <>
              {/* US-06: PlayerBadge debe aparecer en todas las pantallas; no moverlo fuera de Layout */}
              <Link className="player-link" to="/profile">
                <PlayerBadge user={user} />
              </Link>
              <Link to="/profile">Mi perfil</Link>
              <Link to="/ranking">Ranking</Link>
              <Link to="/lobby">Jugar</Link>
              <button
                type="button"
                className="button button-small"
                onClick={handleLogout}
              >
                Cerrar sesión
              </button>
            </>
          )}

          {status === 'anonymous' && (
            <>
              <Link to="/login">Iniciar sesión</Link>
              <Link to="/register">Crear cuenta</Link>
            </>
          )}
        </nav>
      </header>
      <main className="app-main">
        <UnverifiedBanner user={user} />
        <Outlet />
      </main>
    </div>
  );
}
