import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getGameOptions, getMatch, getErrorMessage } from '../api/game';
import { useAuth } from '../auth/AuthContext';
import ArenaCanvas from '../components/game/ArenaCanvas';
import ArenaHud from '../components/game/ArenaHud';
import { describeConfig } from '../game/gameConfig';
import { useMockArena } from '../hooks/useMockArena';

function ArenaScreen({ match, arena, currentUserId }) {
  // Cuando exista tiempo real, reemplazar useMockArena por el hook con sockets:
  // debe devolver { stateRef, hud } con la forma descrita en game/arenaState.js.
  const { stateRef, hud, restart } = useMockArena(match, arena);

  return (
    <div className="arena-page">
      <div className="arena-toolbar">
        <div>
          <h2>Arena</h2>
          <p className="arena-config-summary">{describeConfig(match.config)}</p>
        </div>
        <div className="arena-toolbar-actions">
          <button type="button" className="button button-small" onClick={restart}>
            Reiniciar demo
          </button>
          <Link className="button button-small" to="/lobby">
            Nueva partida
          </Link>
        </div>
      </div>

      <p className="alert alert-warning" role="status">
        Vista previa local: el tiempo real y el control ESP32 aún no están conectados, así
        que los movimientos son simulados y no se guardan estadísticas.
      </p>

      <div className="arena-layout">
        <div className="arena-stage">
          <ArenaCanvas stateRef={stateRef} arena={arena} />
        </div>
        {hud && (
          <ArenaHud
            config={match.config}
            hud={hud}
            currentUserId={currentUserId}
          />
        )}
      </div>
    </div>
  );
}

// Visualización de la arena. Esta ruta sigue dentro de <VerifiedRoute> (CA-03.4).
export default function ArenaPage() {
  const [searchParams] = useSearchParams();
  const matchId = searchParams.get('match');
  const { user } = useAuth();
  const [data, setData] = useState({ status: 'loading' });

  useEffect(() => {
    if (!matchId) return undefined;

    let active = true;
    setData({ status: 'loading' });

    Promise.all([getMatch(matchId), getGameOptions()])
      .then(([matchData, options]) => {
        if (active) {
          setData({
            status: 'ready',
            match: matchData.match,
            arena: options.arena,
          });
        }
      })
      .catch((err) => {
        if (active) {
          setData({
            status: 'error',
            message: err.response
              ? getErrorMessage(err)
              : 'No se pudo conectar con el servidor',
          });
        }
      });

    return () => {
      active = false;
    };
  }, [matchId]);

  if (!matchId) {
    return (
      <section className="card game-config-card">
        <h2>Arena</h2>
        <p>Primero crea una partida en la sala de juego.</p>
        <Link className="button" to="/lobby">
          Ir a la sala de juego
        </Link>
      </section>
    );
  }

  if (data.status === 'loading') {
    return (
      <section className="card game-config-card">
        <h2>Arena</h2>
        <p>Cargando partida…</p>
      </section>
    );
  }

  if (data.status === 'error') {
    return (
      <section className="card game-config-card">
        <h2>Arena</h2>
        <p className="alert alert-error" role="alert">
          {data.message}
        </p>
        <Link className="button" to="/lobby">
          Volver a la sala de juego
        </Link>
      </section>
    );
  }

  return (
    <ArenaScreen
      match={data.match}
      arena={data.arena}
      currentUserId={user?.id}
    />
  );
}
