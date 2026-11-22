import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  getErrorMessage,
  getGameOptions,
  getScenario,
  joinMatch,
  startMatch,
} from '../api/game';
import { useAuth } from '../auth/AuthContext';
import ArenaCanvas from '../components/game/ArenaCanvas';
import ArenaHud from '../components/game/ArenaHud';
import EventBanner from '../components/game/EventBanner';
import HudStrip from '../components/game/HudStrip';
import WaitingRoom from '../components/game/WaitingRoom';
import MatchResults from '../components/game/MatchResults';
import { describeConfig } from '../game/gameConfig';
import { useMatch } from '../hooks/useMatch';
import { useArenaSocket } from '../hooks/useArenaSocket';
import { useEventAnnouncement } from '../hooks/useEventAnnouncement';
import { isSoundEnabled, setSoundEnabled } from '../game/eventSound';
import { useKeyboardInput } from '../hooks/useKeyboardInput';
import { useSerialInput } from '../hooks/useSerialInput';

function errorText(err) {
  return err.response ? getErrorMessage(err) : 'No se pudo conectar con el servidor';
}

function ArenaScreen({ match, arena, scenario, currentUserId, developerMode }) {
  const { stateRef, hud, connection, error, sendInput, sendDevAction } = useArenaSocket(match.id);
  const status = hud?.status;
  const announcement = useEventAnnouncement(hud?.events);
  const [soundEnabled, setSound] = useState(isSoundEnabled);
  const [devMessage, setDevMessage] = useState('');

  function toggleSound() {
    setSoundEnabled(!soundEnabled);
    setSound(!soundEnabled);
  }

  async function runDevAction(action) {
    const response = await sendDevAction(action);
    setDevMessage(
      response.ok
        ? 'Acción de prueba aplicada.'
        : response.message || 'La acción de prueba fue rechazada.'
    );
  }

  const inputEnabled = connection === 'connected' && status !== 'FINISHED';
  useKeyboardInput(sendInput, inputEnabled);
  const serial = useSerialInput(sendInput, inputEnabled);

  return (
    <div className="arena-page">
      <div className="arena-toolbar">
        <div>
          <h2>Arena</h2>
          <p className="arena-config-summary">
            {scenario ? `${scenario.name} · ` : ''}
            {describeConfig(match.config)}
          </p>
        </div>
        <div className="arena-toolbar-actions">
          {serial.supported && (
            <button
              type="button"
              className="button button-small"
              onClick={serial.status === 'connected' ? serial.disconnect : serial.connect}
              disabled={serial.status === 'connecting'}
            >
              {serial.status === 'connected' ? 'Control conectado ✓' : 'Conectar control'}
            </button>
          )}
          <Link className="button button-small" to="/lobby">
            {status === 'FINISHED' ? 'Volver a la sala de juego' : 'Salir'}
          </Link>
        </div>
      </div>

      {connection === 'connecting' && (
        <p className="alert alert-warning" role="status">
          Conectando con la partida…
        </p>
      )}
      {connection === 'reconnecting' && (
        <p className="alert alert-warning" role="status">
          Se perdió la conexión. Reconectando…
        </p>
      )}
      {connection === 'error' && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      {serial.error && (
        <p className="alert alert-warning" role="status">
          {serial.error}
        </p>
      )}
      {!serial.supported && (
        <p className="alert alert-warning" role="status">
          Para usar el control USB abre el juego en Chrome o Edge.
        </p>
      )}
      {connection === 'connected' && status === 'RUNNING' && (
        <p className="arena-controls-hint">
          Muévete con el control USB, con W A S D o con las flechas.
        </p>
      )}

      {hud && status !== 'COUNTDOWN' && (
        <HudStrip config={match.config} hud={hud} currentUserId={currentUserId} />
      )}

      {developerMode && (
        <section className="dev-controls card" aria-label="Controles de desarrollo">
          <div>
            <h3>Modo desarrollo</h3>
            <p>Controles disponibles solo para jugador1.</p>
          </div>
          <div className="dev-actions">
            {[
              ['reactor-overload', 'Sobrecarga'],
              ['energy-rain', 'Lluvia'],
              ['blackout', 'Apagón'],
              ['alternate-route', 'Ruta alternativa'],
              ['guardian-invasion', 'Invasión'],
            ].map(([eventType, label]) => (
              <button
                key={eventType}
                type="button"
                className="button button-small"
                onClick={() => runDevAction({ type: 'force-event', eventType })}
              >
                {label}
              </button>
            ))}
            <button type="button" className="button button-small" onClick={() => runDevAction({ type: 'spawn-bonus' })}>
              Celdas bonus
            </button>
            <button type="button" className="button button-small" onClick={() => runDevAction({ type: 'add-score', playerId: currentUserId, amount: 10 })}>
              +10 puntos
            </button>
            <button type="button" className="button button-small" onClick={() => runDevAction({ type: 'overtime' })}>
              Prórroga
            </button>
            <button type="button" className="button button-small" onClick={() => runDevAction({ type: 'finish' })}>
              Finalizar
            </button>
          </div>
          {devMessage && <p className="dev-message" role="status">{devMessage}</p>}
        </section>
      )}

      {hud && status === 'FINISHED' ? (
        <MatchResults hud={hud} match={match} currentUserId={currentUserId} />
      ) : (
      <div className="arena-layout">
        <div
          className={`arena-stage${hud?.events?.length ? ' arena-stage-event' : ''}`}
          style={hud?.events?.length ? { '--event-accent': hud.events[0].accent } : undefined}
        >
          <ArenaCanvas
            stateRef={stateRef}
            arena={arena}
            scenario={scenario}
            currentUserId={currentUserId}
          />
          <EventBanner event={announcement} />
          {status === 'COUNTDOWN' && (
            <div className="arena-countdown" role="status" aria-live="polite">
              <span className="arena-countdown-label">Prepárate</span>
              <span className="arena-countdown-number">{hud.countdown}</span>
            </div>
          )}
        </div>
        {hud && (
          <ArenaHud
            config={match.config}
            hud={hud}
            currentUserId={currentUserId}
            scenario={scenario}
            soundEnabled={soundEnabled}
            onToggleSound={toggleSound}
          />
        )}
      </div>
      )}
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
  const [scenario, setScenario] = useState(null);
  const [scenarioError, setScenarioError] = useState('');
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

  const scenarioId = match?.scenarioId ?? null;

  useEffect(() => {
    setScenario(null);
    setScenarioError('');
    if (!scenarioId) return undefined;

    let active = true;

    getScenario(scenarioId)
      .then(({ scenario: data }) => {
        if (active) setScenario(data);
      })
      .catch((err) => {
        if (active) setScenarioError(errorText(err));
      });

    return () => {
      active = false;
    };
  }, [scenarioId]);

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

  if (error || optionsError || scenarioError) {
    return (
      <Message
        error={error || optionsError || scenarioError}
        linkLabel="Volver a la sala de juego"
      />
    );
  }

  if (loading || !match || !options || (scenarioId && !scenario)) {
    return <Message>Cargando partida…</Message>;
  }

  if (match.status === 'WAITING') {
    return (
      <WaitingRoom
        match={match}
        scenario={scenario}
        arena={options.arena}
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
    const elapsed = match.startedAt && match.endedAt
      ? Math.max(0, Math.round((new Date(match.endedAt) - new Date(match.startedAt)) / 1000))
      : 0;
    const resultHud = {
      status: 'FINISHED',
      elapsed,
      overtimeRemaining: null,
      winnerIds: match.winnerIds || [],
      players: match.players.map((player) => ({
        ...player,
        color: '#457b9d',
        slow: 0,
        risk: 1,
        frozen: 0,
      })),
    };

    return (
      <div className="arena-page">
        <MatchResults hud={resultHud} match={match} currentUserId={user?.id} />
        <p style={{ textAlign: 'center' }}>
          <Link className="button" to="/lobby">Volver a la sala de juego</Link>
        </p>
      </div>
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
      scenario={scenario}
      currentUserId={user?.id}
      developerMode={Boolean(user?.devMode)}
    />
  );
}