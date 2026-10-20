import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createMatch, getGameOptions, getErrorMessage } from '../api/game';
import GameConfigForm from '../components/game/GameConfigForm';

// Sala de juego: el jugador configura la partida y entra a la arena.
// Unirse a una partida ajena y el "listo" de cada jugador los implementa tiempo real.
// Esta ruta sigue dentro de <VerifiedRoute> (CA-03.4); no sacarla de ahí.
export default function LobbyPage() {
  const navigate = useNavigate();
  const [options, setOptions] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    let active = true;

    getGameOptions()
      .then((data) => {
        if (active) setOptions(data);
      })
      .catch((err) => {
        if (active) {
          setLoadError(
            err.response ? getErrorMessage(err) : 'No se pudo conectar con el servidor'
          );
        }
      });

    return () => {
      active = false;
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
      setError(
        err.response ? getErrorMessage(err) : 'No se pudo conectar con el servidor'
      );
      setSubmitting(false);
    }
  }

  return (
    <section className="card game-config-card">
      <h2>Sala de juego</h2>
      <p>Configura la partida antes de entrar a la arena.</p>

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
  );
}
