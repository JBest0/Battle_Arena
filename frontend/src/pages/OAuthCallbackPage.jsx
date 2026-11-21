import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function OAuthCallbackPage() {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('token');
    window.history.replaceState(null, '', '/oauth/callback');

    if (!token) {
      setError('No recibimos un token válido de GitHub.');
      return;
    }

    let active = true;
    loginWithToken(token)
      .then(() => {
        if (active) navigate('/profile', { replace: true });
      })
      .catch(() => {
        if (active) {
          setError('No se pudo abrir tu sesión. Inicia sesión de nuevo.');
        }
      });

    return () => {
      active = false;
    };
  }, [loginWithToken, navigate]);

  return (
    <section className="card form-card">
      <h2>Iniciando sesión</h2>
      {error ? (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      ) : (
        <p>Estamos preparando tu cuenta…</p>
      )}
    </section>
  );
}
