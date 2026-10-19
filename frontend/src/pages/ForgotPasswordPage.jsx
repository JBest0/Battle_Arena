import { useState } from 'react';
import { Link } from 'react-router-dom';
import client, { getErrorMessage } from '../api/client';
import useCooldown from '../hooks/useCooldown';
import { getErrorCode } from '../utils/apiErrors';
import { validateEmail } from '../validation/auth';

const COOLDOWN_SECONDS = 60;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { cooldown, start: startCooldown } = useCooldown(COOLDOWN_SECONDS);

  function handleChange(event) {
    setEmail(event.target.value);
    setEmailError('');
    setGeneralError('');
    setMessage('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setGeneralError('');
    setMessage('');

    const localError = validateEmail(email);
    if (localError) {
      setEmailError(localError);
      return;
    }

    setSubmitting(true);
    try {
      const response = await client.post('/auth/forgot-password', {
        email: email.trim().toLowerCase(),
      });
      setMessage(response.data.message);
    } catch (err) {
      setGeneralError(getErrorMessage(err));
      if (getErrorCode(err) === 'TOO_MANY_REQUESTS') {
        startCooldown();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card form-card">
      <h2>Recuperar contraseña</h2>
      <p>
        Escribe el correo de tu cuenta y te enviaremos un enlace para crear una
        contraseña nueva.
      </p>

      {generalError && (
        <p className="alert alert-error" role="alert">
          {generalError}
        </p>
      )}

      {message ? (
        <p className="alert alert-success" role="status">
          {message}
        </p>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="forgot-email">Correo electrónico</label>
            <input
              id="forgot-email"
              name="email"
              type="email"
              value={email}
              onChange={handleChange}
              aria-invalid={Boolean(emailError)}
              aria-describedby={
                emailError ? 'forgot-email-error' : undefined
              }
              autoComplete="email"
            />
            {emailError && (
              <p className="field-error" id="forgot-email-error" role="alert">
                {emailError}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="button"
            disabled={submitting || cooldown > 0}
          >
            {cooldown > 0
              ? `Espera ${cooldown} s para reintentar`
              : submitting
                ? 'Enviando…'
                : 'Enviar enlace'}
          </button>
        </form>
      )}

      <p className="form-footer">
        <Link to="/login">Volver a iniciar sesión</Link>
      </p>
    </section>
  );
}
