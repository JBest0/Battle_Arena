import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage, getMatch } from '../api/game';

const STATUS_RANK = { WAITING: 0, IN_PROGRESS: 1, FINISHED: 2 };

function errorText(err) {
  return err.response ? getErrorMessage(err) : 'No se pudo conectar con el servidor';
}

/*
 * Carga una partida y, mientras está en espera, la consulta cada `intervalMs` para ver
 * quién se une y cuándo el anfitrión la inicia. Deja de consultar al pasar a IN_PROGRESS.
 * Una respuesta atrasada nunca devuelve la partida a un estado anterior.
 */
export function useMatch(matchId, intervalMs = 2000) {
  const [state, setState] = useState({
    match: null,
    error: '',
    loading: Boolean(matchId),
  });
  const status = state.match?.status;

  const applyMatch = useCallback((incoming) => {
    setState((previous) => {
      const current = previous.match;
      if (current && STATUS_RANK[incoming.status] < STATUS_RANK[current.status]) {
        return previous;
      }
      return { match: incoming, error: '', loading: false };
    });
  }, []);

  useEffect(() => {
    if (!matchId) return undefined;

    let active = true;
    setState({ match: null, error: '', loading: true });

    getMatch(matchId)
      .then(({ match }) => {
        if (active) applyMatch(match);
      })
      .catch((err) => {
        if (active) setState({ match: null, error: errorText(err), loading: false });
      });

    return () => {
      active = false;
    };
  }, [matchId, applyMatch]);

  useEffect(() => {
    if (!matchId || status !== 'WAITING') return undefined;

    let active = true;
    const timer = setInterval(() => {
      getMatch(matchId)
        .then(({ match }) => {
          if (active) applyMatch(match);
        })
        .catch(() => {});
    }, intervalMs);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [matchId, status, intervalMs, applyMatch]);

  return { ...state, setMatch: applyMatch };
}
