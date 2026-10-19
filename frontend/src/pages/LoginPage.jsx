import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const INITIAL_FORM = { identifier: '', password: '' };
const GAME_ROUTES = ['/lobby', '/arena'];

function validate(values) {
  const errors = {};
  if (!values.identifier.trim()) {
    errors.identifier = 'Ingresa tu usuario o correo';
  }
  if (!values.password) {
    errors.password = 'Ingresa tu contraseña';
  }
  return errors;
}

export default function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated') {
    return <Navigate to="/profile" replace />;
  }

  const stateMessage = location.state?.message;
  const from = location.state?.from;

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: '' }));
    setGeneralError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setGeneralError('');

    const localErrors = validate(form);
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }

    setSubmitting(true);
    try {
      const result = await login(form.identifier.trim(), form.password);

      let destination = '/profile';
      if (from?.pathname) {
        const blocked =
          !result.user.emailVerified &&
          GAME_ROUTES.includes(from.pathname);
        destination = blocked
          ? '/profile'
          : `${from.pathname}${from.search || ''}`;
      }

      navigate(destination, {
        replace: true,
        state: result.notice ? { notice: result.notice } : undefined,
      });
    } catch (err) {
      if (err.response) {
        if (err.response.status === 400) {
          setErrors(err.response.data?.error?.fields || {});
        }
        setGeneralError(getErrorMessage(err));
      } else {
        setGeneralError('No se pudo conectar con el servidor');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card form-card">
      <h2>Iniciar sesión</h2>
      <p>Entra a la arena con tu usuario o correo.</p>

      {stateMessage && (
        <p className="alert alert-warning" role="status">
          {stateMessage}
        </p>
      )}

      {generalError && (
        <p className="alert alert-error" role="alert">
          {generalError}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="identifier">Usuario o correo</label>
          <input
            id="identifier"
            name="identifier"
            type="text"
            value={form.identifier}
            onChange={handleChange}
            aria-invalid={Boolean(errors.identifier)}
            aria-describedby={
              errors.identifier ? 'identifier-error' : undefined
            }
            autoComplete="username"
          />
          {errors.identifier && (
            <p className="field-error" id="identifier-error" role="alert">
              {errors.identifier}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'password-error' : undefined}
            autoComplete="current-password"
          />
          {errors.password && (
            <p className="field-error" id="password-error" role="alert">
              {errors.password}
            </p>
          )}
        </div>

        <button type="submit" className="button" disabled={submitting}>
          {submitting ? 'Ingresando…' : 'Iniciar sesión'}
        </button>
      </form>

      <p className="form-footer">
        ¿No tienes cuenta? <Link to="/register">Regístrate</Link>
      </p>
      <p className="form-footer">
        <Link to="/forgot-password">¿Olvidaste tu contraseña?</Link>
      </p>
    </section>
  );
}
