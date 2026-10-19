import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client, { getErrorMessage } from '../api/client';

export default function HomePage() {
  const [health, setHealth] = useState({ loading: true, ok: false, message: '' });

  useEffect(() => {
    let active = true;

    client
      .get('/health')
      .then((response) => {
        if (!active) return;
        const { status, db } = response.data;
        setHealth({
          loading: false,
          ok: status === 'ok' && db === 'ok',
          message: `API: ${status} · Base de datos: ${db}`,
        });
      })
      .catch((err) => {
        if (!active) return;
        setHealth({
          loading: false,
          ok: false,
          message: getErrorMessage(err),
        });
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="card">
      <h2>Arena</h2>
      <p>Bienvenido a Battle Arena Challenge.</p>
      <p className={`status ${health.ok ? 'status-ok' : 'status-error'}`}>
        {health.loading
          ? 'Consultando el estado del backend...'
          : health.message}
      </p>
      <p>
        <Link className="button" to="/register">
          Crear cuenta
        </Link>
      </p>
    </section>
  );
}
