import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import client, { getErrorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { getErrorCode } from '../utils/apiErrors';
import {
  PASSWORD_HELP,
  validatePasswordReset,
} from '../validation/auth';

const INVALID_TOKEN_CODES = ['TOKEN_INVALID', 'TOKEN_USED', 'TOKEN_EXPIRED'];

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { logoutLocal } = useAuth();
  const token = searchParams.get('token') || '';

  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [linkError, setLinkError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: '' }));
    setGeneralError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setGeneralError('');

    const localErrors = validatePasswordReset(form);
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }

    setSubmitting(true);
    try {
      const response = await client.post('/auth/reset-password', {
        token,
        password: form.password,
        confirmPassword: form.confirmPassword,
      });

      logoutLocal();
      navigate('/login', {
        replace: true,
        state: {
          message:
            response.data.message ||
            'Contraseña actualizada. Inicia sesión con tu nueva contraseña.',
        },
      });
    } catch (err) {
      const code = getErrorCode(err);

      if (INVALID_TOKEN_CODES.includes(code)) {
        setLinkError(getErrorMessage(err));
      } else if (code === 'PASSWORD_REUSED') {
        setErrors((previous) => ({
          ...previous,
          password: getErrorMessage(err),
        }));
      } else {
        if (err.response?.status === 400 && err.response.data?.error?.fields) {
          setErrors(err.response.data.error.fields);
        }
        setGeneralError(getErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!token || linkError) {
    return (
      <section className="card form-card">
        <h2>Restablecer contraseña</h2>
        <p className="alert alert-error" role="alert">
          {linkError ||
            'El enlace no es válido o está incompleto. Solicita uno nuevo.'}
        </p>
        <p className="form-footer">
          <Link to="/forgot-password">Solicitar un nuevo enlace</Link>
        </p>
        <p className="form-footer">
          <Link to="/login">Volver a iniciar sesión</Link>
        </p>
      </section>
    );
  }

  return (
    <section className="card form-card">
      <h2>Restablecer contraseña</h2>
      <p>Elige una contraseña nueva para tu cuenta.</p>

      {generalError && (
        <p className="alert alert-error" role="alert">
          {generalError}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="new-password">Contraseña nueva</label>
          <input
            id="new-password"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={
              errors.password ? 'new-password-error' : 'new-password-help'
            }
            autoComplete="new-password"
          />
          {errors.password ? (
            <p className="field-error" id="new-password-error" role="alert">
              {errors.password}
            </p>
          ) : (
            <ul className="field-help" id="new-password-help">
              {PASSWORD_HELP.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="field">
          <label htmlFor="confirm-password">Confirma la contraseña</label>
          <input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={handleChange}
            aria-invalid={Boolean(errors.confirmPassword)}
            aria-describedby={
              errors.confirmPassword ? 'confirm-password-error' : undefined
            }
            autoComplete="new-password"
          />
          {errors.confirmPassword && (
            <p className="field-error" id="confirm-password-error" role="alert">
              {errors.confirmPassword}
            </p>
          )}
        </div>

        <button type="submit" className="button" disabled={submitting}>
          {submitting ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>

      <p className="form-footer">
        <Link to="/login">Volver a iniciar sesión</Link>
      </p>
    </section>
  );
}
