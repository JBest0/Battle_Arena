import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import PlayerBadge from './PlayerBadge';

// Toda ventana del juego debe usar Layout o GameWindowLayout (CA-06.5)
export default function GameWindowLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className="game-window">
      <header className="game-window-bar">
        <Link className="app-brand" to="/">
          Battle Arena
        </Link>
        <Link className="player-link" to="/profile">
          <PlayerBadge user={user} />
        </Link>
        <nav className="game-window-nav">
          <Link to="/profile">Mi perfil</Link>
          <button
            type="button"
            className="button button-small"
            onClick={handleLogout}
          >
            Cerrar sesión
          </button>
        </nav>
      </header>
      <main className="game-window-main">
        <Outlet />
      </main>
    </div>
  );
}
