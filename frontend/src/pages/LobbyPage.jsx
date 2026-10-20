import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createMatch,
  getErrorMessage,
  getGameOptions,
  joinMatch,
  listOpenMatches,
} from '../api/game';
import GameConfigForm from '../components/game/GameConfigForm';
import OpenMatchesList from '../components/game/OpenMatchesList';

const OPEN_MATCHES_INTERVAL_MS = 3000;

function errorText(err) {
  return err.response ? getErrorMessage(err) : 'No se pudo conectar con el servidor';
}

// Sala de juego: crear una partida con su configuración o unirse a una abierta.
// Ambos caminos terminan en la sala de espera (/arena?match=<id>).
// Esta ruta sigue dentro de <VerifiedRoute> (CA-03.4); no sacarla de ahí.
export default function LobbyPage() {
  const navigate = useNavigate();
  const [options, setOptions] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [openMatches, setOpenMatches] = useState([]);
  const [joiningId, setJoiningId] = useState(null);
  const [joinError, setJoinError] = useState('');

  useEffect(() => {
    let active = true;

    getGameOptions()
      .then((data) => {
        if (active) setOptions(data);
      })
      .catch((err) => {
        if (active) setLoadError(errorText(err));
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    function refresh() {
      listOpenMatches()
        .then(({ matches }) => {
          if (active) setOpenMatches(matches);
        })
        .catch(() => {});
    }

    refresh();
    const timer = setInterval(refresh, OPEN_MATCHES_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  async function handleSubmit(config) {
    setSubmitting(true);
    setError('');
    setFieldErrors({});

    try {
      const { match } = await createMatch(config);
      navigate(`/arena?match=${match.id}`);
    } catch (err) {
      if (err.response?.status === 400) {
        setFieldErrors(err.response.data?.error?.fields || {});
      }
      setError(errorText(err));
      setSubmitting(false);
    }
  }

  async function handleJoin(matchId) {
    setJoiningId(matchId);
    setJoinError('');

    try {
      await joinMatch(matchId);
      navigate(`/arena?match=${matchId}`);
    } catch (err) {
      setJoinError(errorText(err));
      setJoiningId(null);
    }
  }

  return (
    <>
      <section className="card game-config-card">
        <h2>Sala de juego</h2>
        <p>Únete a una partida abierta o crea la tuya.</p>

        <h3 className="lobby-subtitle">Partidas abiertas</h3>
        {joinError && (
          <p className="alert alert-error" role="alert">
            {joinError}
          </p>
        )}
        <OpenMatchesList
          matches={openMatches}
          busyId={joiningId}
          onJoin={handleJoin}
        />
      </section>

      <section className="card game-config-card lobby-create">
        <h3 className="lobby-subtitle">Crear partida</h3>

        {loadError && (
          <p className="alert alert-error" role="alert">
            {loadError}
          </p>
        )}

        {error && (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        )}

        {!options && !loadError && <p>Cargando configuración…</p>}

        {options && (
          <GameConfigForm
            options={options}
            submitting={submitting}
            serverErrors={fieldErrors}
            onSubmit={handleSubmit}
          />
        )}
      </section>
    </>
  );
}
