import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  getErrorMessage,
  getGameOptions,
  joinMatch,
  startMatch,
} from '../api/game';
import { useAuth } from '../auth/AuthContext';
import ArenaCanvas from '../components/game/ArenaCanvas';
import ArenaHud from '../components/game/ArenaHud';
import WaitingRoom from '../components/game/WaitingRoom';
import { describeConfig } from '../game/gameConfig';
import { useMatch } from '../hooks/useMatch';
import { useMockArena } from '../hooks/useMockArena';

function errorText(err) {
  return err.response ? getErrorMessage(err) : 'No se pudo conectar con el servidor';
}

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

function Message({ title = 'Arena', children, linkLabel, error }) {
  return (
    <section className="card game-config-card">
      <h2>{title}</h2>
      {error ? (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      ) : (
        <p>{children}</p>
      )}
      {linkLabel && (
        <Link className="button" to="/lobby">
          {linkLabel}
        </Link>
      )}
    </section>
  );
}

// Una partida pasa por tres estados: WAITING (sala de espera), IN_PROGRESS (arena) y
// FINISHED. Esta ruta sigue dentro de <VerifiedRoute> (CA-03.4).
export default function ArenaPage() {
  const [searchParams] = useSearchParams();
  const matchId = searchParams.get('match');
  const { user } = useAuth();
  const { match, error, loading, setMatch } = useMatch(matchId);
  const [options, setOptions] = useState(null);
  const [optionsError, setOptionsError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    let active = true;

    getGameOptions()
      .then((data) => {
        if (active) setOptions(data);
      })
      .catch((err) => {
        if (active) setOptionsError(errorText(err));
      });

    return () => {
      active = false;
    };
  }, []);

  async function runAction(action) {
    setBusy(true);
    setActionError('');

    try {
      const data = await action(matchId);
      setMatch(data.match);
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (!matchId) {
    return (
      <Message linkLabel="Ir a la sala de juego">
        Primero crea o elige una partida en la sala de juego.
      </Message>
    );
  }

  if (error || optionsError) {
    return <Message error={error || optionsError} linkLabel="Volver a la sala de juego" />;
  }

  if (loading || !match || !options) {
    return <Message>Cargando partida…</Message>;
  }

  if (match.status === 'WAITING') {
    return (
      <WaitingRoom
        match={match}
        currentUserId={user?.id}
        minPlayers={options.minPlayersToStart}
        busy={busy}
        error={actionError}
        onJoin={() => runAction(joinMatch)}
        onStart={() => runAction(startMatch)}
      />
    );
  }

  if (match.status === 'FINISHED') {
    return (
      <Message linkLabel="Volver a la sala de juego">
        Esta partida ya terminó. Puedes ver tus resultados en tu perfil.
      </Message>
    );
  }

  if (!match.players.some((player) => player.id === user?.id)) {
    return (
      <Message linkLabel="Volver a la sala de juego">
        Esta partida ya comenzó y no participas en ella.
      </Message>
    );
  }

  return (
    <ArenaScreen
      match={match}
      arena={options.arena}
      currentUserId={user?.id}
    />
  );
}
