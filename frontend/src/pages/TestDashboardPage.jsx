import { useState } from 'react';
import { Link } from 'react-router-dom';
import client, { getErrorMessage } from '../api/client';
import {
  createMatch,
  getGameOptions,
  getMatch,
  joinMatch,
  listOpenMatches,
  startMatch,
} from '../api/game';
import {
  getMatchHistory,
  getMyProfile,
  getProfile,
  getRanking,
  getRankingPage,
  updateMyProfile,
} from '../api/profile';
import { useAuth } from '../auth/AuthContext';

const INITIAL_MATCH = {
  endMode: 'TIME',
  durationSeconds: 300,
  targetPoints: 100,
  maxPlayers: 2,
};

function Result({ value }) {
  if (!value) return null;

  return (
    <pre className="test-result" aria-live="polite">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function ActionButton({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      className="button button-secondary"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export default function TestDashboardPage() {
  const { user, status, login, logout } = useAuth();
  const [identifier, setIdentifier] = useState('jugador1');
  const [password, setPassword] = useState('Test1234');
  const [testEmail, setTestEmail] = useState('jugador1@test.com');
  const [loginBusy, setLoginBusy] = useState(false);
  const [match, setMatch] = useState(INITIAL_MATCH);
  const [matchId, setMatchId] = useState('');
  const [rankingLimit, setRankingLimit] = useState(10);
  const [rankingPage, setRankingPage] = useState(1);
  const [rankingPageSize, setRankingPageSize] = useState(20);
  const [historyUserId, setHistoryUserId] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function clearFeedback() {
    setMessage('');
    setError('');
  }

  async function runAction(action) {
    clearFeedback();
    setBusy(true);

    try {
      const data = await action();
      setResult(data);
      setMessage('Operación completada correctamente.');
    } catch (err) {
      setResult(null);
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    clearFeedback();
    setLoginBusy(true);

    try {
      const response = await login(identifier, password);
      setResult({ user: response.user, notice: response.notice });
      setMessage(`Sesión iniciada como ${response.user.username}.`);
    } catch (err) {
      setResult(null);
      setError(getErrorMessage(err));
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleLogout() {
    clearFeedback();
    await logout();
    setResult(null);
    setMessage('Sesión cerrada.');
  }

  function updateMatch(event) {
    const { name, value } = event.target;
    setMatch((previous) => ({
      ...previous,
      [name]:
        name === 'endMode'
          ? value
          : value === ''
            ? ''
            : Number(value),
    }));
  }

  const authenticated = status === 'authenticated';

  return (
    <section className="test-dashboard">
      <div className="test-heading">
        <div>
          <h2>Panel de pruebas</h2>
          <p>
            Usa este menú para comprobar la API sin escribir comandos. Los
            resultados aparecen debajo de cada acción.
          </p>
        </div>
        <Link className="button button-small" to="/">
          Volver al inicio
        </Link>
      </div>

      {message && <p className="alert alert-success">{message}</p>}
      {error && <p className="alert alert-error">{error}</p>}

      <div className="test-grid">
        <section className="card test-card">
          <h3>1. Estado del sistema</h3>
          <p>Comprueba que la API y la base de datos respondan.</p>
          <ActionButton
            disabled={busy}
            onClick={() => runAction(() => client.get('/health').then((r) => r.data))}
          >
            Probar health check
          </ActionButton>
        </section>

        <section className="card test-card">
          <h3>2. Envío de correo</h3>
          <p>
            Solicita un enlace de recuperación y revisa la bandeja configurada
            en el servidor SMTP. Usa el correo real de una cuenta registrada.
          </p>
          <div className="field">
            <label htmlFor="test-email">Correo de prueba</label>
            <input
              id="test-email"
              type="email"
              value={testEmail}
              onChange={(event) => setTestEmail(event.target.value)}
            />
          </div>
          <ActionButton
            disabled={busy || !testEmail.trim()}
            onClick={() =>
              runAction(() =>
                client
                  .post('/auth/forgot-password', {
                    email: testEmail.trim().toLowerCase(),
                  })
                  .then((response) => response.data)
              )
            }
          >
            Enviar correo de prueba
          </ActionButton>
          <p className="test-help">
            En desarrollo puedes revisar el correo en{' '}
            <a href="http://localhost:8025" target="_blank" rel="noreferrer">
              Mailpit
            </a>
            . El backend puede limitar solicitudes repetidas durante 60
            segundos.
          </p>
        </section>

        <section className="card test-card">
          <h3>3. Iniciar sesión</h3>
          <form onSubmit={handleLogin}>
            <div className="field">
              <label htmlFor="test-identifier">Usuario o correo</label>
              <input
                id="test-identifier"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="test-password">Contraseña</label>
              <input
                id="test-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <button type="submit" className="button" disabled={loginBusy}>
              {loginBusy ? 'Iniciando…' : 'Iniciar sesión'}
            </button>
            {authenticated && (
              <button
                type="button"
                className="button button-secondary"
                onClick={handleLogout}
              >
                Cerrar sesión
              </button>
            )}
          </form>
          <p className="test-status">
            Estado: <strong>{authenticated ? `sesión activa (${user.username})` : status}</strong>
          </p>
        </section>

        <section className="card test-card">
          <h3>4. Usuario y ranking</h3>
          <p>Estas acciones requieren iniciar sesión.</p>
          <div className="test-actions">
            <ActionButton
              disabled={!authenticated || busy}
              onClick={() => runAction(() => client.get('/auth/me').then((r) => r.data))}
            >
              Consultar sesión
            </ActionButton>
            <ActionButton
              disabled={!authenticated || busy}
              onClick={() => runAction(getMyProfile)}
            >
              Consultar perfil
            </ActionButton>
            <ActionButton
              disabled={!authenticated || busy}
              onClick={() => runAction(() => getRanking(10))}
            >
              Consultar ranking
            </ActionButton>
          </div>
        </section>

        <section className="card test-card">
          <h3>5. Partidas</h3>
          <p>Consulta opciones, crea una partida y prueba sus acciones.</p>
          <div className="test-actions">
            <ActionButton
              disabled={!authenticated || busy}
              onClick={() => runAction(getGameOptions)}
            >
              Ver opciones
            </ActionButton>
            <ActionButton
              disabled={!authenticated || busy}
              onClick={() => runAction(listOpenMatches)}
            >
              Listar partidas
            </ActionButton>
          </div>

          <div className="test-match-form">
            <div className="field">
              <label htmlFor="test-end-mode">Modo de finalización</label>
              <select
                id="test-end-mode"
                name="endMode"
                value={match.endMode}
                onChange={updateMatch}
              >
                <option value="TIME">Tiempo</option>
                <option value="POINTS">Puntos</option>
              </select>
            </div>
            {match.endMode === 'TIME' ? (
              <div className="field">
                <label htmlFor="test-duration">Duración en segundos</label>
                <input
                  id="test-duration"
                  name="durationSeconds"
                  type="number"
                  min="1"
                  value={match.durationSeconds}
                  onChange={updateMatch}
                />
              </div>
            ) : (
              <div className="field">
                <label htmlFor="test-target">Puntos objetivo</label>
                <input
                  id="test-target"
                  name="targetPoints"
                  type="number"
                  min="1"
                  value={match.targetPoints}
                  onChange={updateMatch}
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="test-max-players">Máximo de jugadores</label>
              <input
                id="test-max-players"
                name="maxPlayers"
                type="number"
                min="2"
                value={match.maxPlayers}
                onChange={updateMatch}
              />
            </div>
          </div>

          <ActionButton
            disabled={!authenticated || busy}
            onClick={() => runAction(async () => {
              const data = await createMatch(match);
              if (data.match?.id) setMatchId(data.match.id);
              return data;
            })}
          >
            Crear partida
          </ActionButton>

          <div className="field test-match-id">
            <label htmlFor="test-match-id">ID de partida</label>
            <input
              id="test-match-id"
              placeholder="Se completa al crear una partida"
              value={matchId}
              onChange={(event) => setMatchId(event.target.value)}
            />
          </div>
          <div className="test-actions">
            <ActionButton
              disabled={!authenticated || busy || !matchId}
              onClick={() => runAction(() => getMatch(matchId))}
            >
              Consultar partida
            </ActionButton>
            <ActionButton
              disabled={!authenticated || busy || !matchId}
              onClick={() => runAction(() => joinMatch(matchId))}
            >
              Unirse
            </ActionButton>
            <ActionButton
              disabled={!authenticated || busy || !matchId}
              onClick={() => runAction(() => startMatch(matchId))}
            >
              Iniciar partida
            </ActionButton>
          </div>
        </section>

        <section className="card test-card">
          <h3>6. Ranking paginado</h3>
          <p>
            Prueba el modo heredado, la paginación y la combinación inválida
            de <code>limit</code> con <code>page</code>.
          </p>
          <div className="test-match-form test-three-fields">
            <div className="field">
              <label htmlFor="test-ranking-limit">Limit (1-50)</label>
              <input
                id="test-ranking-limit"
                type="number"
                min="1"
                max="50"
                value={rankingLimit}
                onChange={(event) => setRankingLimit(Number(event.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="test-ranking-page">Página (mín. 1)</label>
              <input
                id="test-ranking-page"
                type="number"
                min="1"
                value={rankingPage}
                onChange={(event) => setRankingPage(Number(event.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="test-ranking-page-size">Tamaño (1-100)</label>
              <input
                id="test-ranking-page-size"
                type="number"
                min="1"
                max="100"
                value={rankingPageSize}
                onChange={(event) => setRankingPageSize(Number(event.target.value))}
              />
            </div>
          </div>
          <div className="test-actions">
            <ActionButton
              disabled={!authenticated || busy}
              onClick={() => runAction(() => getRanking(rankingLimit))}
            >
              Consultar modo limit
            </ActionButton>
            <ActionButton
              disabled={!authenticated || busy}
              onClick={() =>
                runAction(() => getRankingPage(rankingPage, rankingPageSize))
              }
            >
              Consultar página
            </ActionButton>
            <ActionButton
              disabled={!authenticated || busy}
              onClick={() =>
                runAction(() =>
                  client
                    .get('/ranking', {
                      params: {
                        limit: rankingLimit,
                        page: rankingPage,
                        pageSize: rankingPageSize,
                      },
                    })
                    .then((response) => response.data)
                )
              }
            >
              Probar combinación inválida
            </ActionButton>
          </div>
        </section>

        <section className="card test-card">
          <h3>7. Historial y perfiles públicos</h3>
          <p>
            Consulta el historial paginado y el perfil de cualquier usuario.
            El propio ID se completa después de iniciar sesión.
          </p>
          <div className="test-match-form test-three-fields">
            <div className="field test-span-two">
              <label htmlFor="test-history-user">ID de usuario</label>
              <input
                id="test-history-user"
                value={historyUserId || user?.id || ''}
                placeholder="UUID del jugador"
                onChange={(event) => setHistoryUserId(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="test-history-page">Página</label>
              <input
                id="test-history-page"
                type="number"
                min="1"
                value={historyPage}
                onChange={(event) => setHistoryPage(Number(event.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="test-history-page-size">Tamaño (1-50)</label>
              <input
                id="test-history-page-size"
                type="number"
                min="1"
                max="50"
                value={historyPageSize}
                onChange={(event) => setHistoryPageSize(Number(event.target.value))}
              />
            </div>
          </div>
          <div className="test-actions">
            <ActionButton
              disabled={!authenticated || busy || !(historyUserId || user?.id)}
              onClick={() =>
                runAction(() =>
                  getMatchHistory(
                    historyUserId || user.id,
                    historyPage,
                    historyPageSize
                  )
                )
              }
            >
              Consultar historial
            </ActionButton>
            <ActionButton
              disabled={!authenticated || busy || !(historyUserId || user?.id)}
              onClick={() =>
                runAction(() => getProfile(historyUserId || user.id))
              }
            >
              Consultar perfil público
            </ActionButton>
          </div>
        </section>

        <section className="card test-card">
          <h3>8. Protección del perfil</h3>
          <p>
            Comprueba que las estadísticas no se puedan modificar y que las
            rutas de escritura del historial respondan 404.
          </p>
          <div className="test-actions">
            <ActionButton
              disabled={!authenticated || busy}
              onClick={() =>
                runAction(() =>
                  updateMyProfile({
                    rankingPoints: 999,
                  })
                )
              }
            >
              Intentar editar rankingPoints
            </ActionButton>
            <ActionButton
              disabled={!authenticated || busy || !(historyUserId || user?.id)}
              onClick={() =>
                runAction(() =>
                  client
                    .post(
                      `/users/${historyUserId || user.id}/matches`,
                      {}
                    )
                    .then((response) => response.data)
                )
              }
            >
              Probar escritura de historial
            </ActionButton>
          </div>
        </section>
      </div>

      <section className="card test-output">
        <h3>Resultado</h3>
        {result ? (
          <Result value={result} />
        ) : (
          <p className="test-empty">Todavía no se ha ejecutado ninguna acción.</p>
        )}
      </section>
    </section>
  );
}
