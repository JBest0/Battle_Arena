import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client, { getErrorMessage } from '../api/client';
import {
  PASSWORD_HELP,
  validateRegister,
} from '../validation/auth';

const INITIAL_FORM = {
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
};

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: '' }));
    setGeneralError('');
  }

  function handleBlur(event) {
    const { name } = event.target;
    const localErrors = validateRegister(form);
    setErrors((previous) => ({ ...previous, [name]: localErrors[name] || '' }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setGeneralError('');

    const localErrors = validateRegister(form);
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }

    setSubmitting(true);
    try {
      const response = await client.post('/auth/register', {
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
      });

      navigate('/check-email', {
        state: {
          email: response.data.user.email,
          emailSent: response.data.emailSent,
        },
      });
    } catch (err) {
      if (err.response) {
        const fieldErrors = err.response.data?.error?.fields || {};
        setErrors(fieldErrors);
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
      <h2>Crear cuenta</h2>
      <p>Completa los datos para entrar a la arena.</p>

      {generalError && (
        <p className="alert alert-error" role="alert">
          {generalError}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="username">Nombre de usuario</label>
          <input
            id="username"
            name="username"
            type="text"
            value={form.username}
            onChange={handleChange}
            onBlur={handleBlur}
            aria-invalid={Boolean(errors.username)}
            aria-describedby={errors.username ? 'username-error' : undefined}
            autoComplete="username"
          />
          {errors.username && (
            <p className="field-error" id="username-error" role="alert">
              {errors.username}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="email">Correo electrónico</label>
          <input
            id="email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            onBlur={handleBlur}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
            autoComplete="email"
          />
          {errors.email && (
            <p className="field-error" id="email-error" role="alert">
              {errors.email}
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
            onBlur={handleBlur}
            aria-invalid={Boolean(errors.password)}
            aria-describedby="password-help password-error"
            autoComplete="new-password"
          />
          <ul className="field-help" id="password-help">
            {PASSWORD_HELP.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          {errors.password && (
            <p className="field-error" id="password-error" role="alert">
              {errors.password}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="confirmPassword">Confirmar contraseña</label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={handleChange}
            onBlur={handleBlur}
            aria-invalid={Boolean(errors.confirmPassword)}
            aria-describedby={
              errors.confirmPassword ? 'confirm-password-error' : undefined
            }
            autoComplete="new-password"
          />
          {errors.confirmPassword && (
            <p
              className="field-error"
              id="confirm-password-error"
              role="alert"
            >
              {errors.confirmPassword}
            </p>
          )}
        </div>

        <button type="submit" className="button" disabled={submitting}>
          {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>

      <p className="form-footer">
        ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
      </p>
    </section>
  );
}
