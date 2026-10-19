import { useEffect, useState } from 'react';
import client, { getErrorMessage } from '../api/client';
import useCooldown from '../hooks/useCooldown';
import { getErrorCode } from '../utils/apiErrors';
import { validateEmail } from '../validation/auth';

const SUCCESS_MESSAGE =
  'Si la cuenta existe y no está verificada, te enviamos un nuevo correo.';
const COOLDOWN_SECONDS = 60;

export default function ResendVerificationForm({ initialEmail = '' }) {
  const [email, setEmail] = useState(initialEmail);
  const [emailError, setEmailError] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { cooldown, start: startCooldown } = useCooldown(COOLDOWN_SECONDS);

  useEffect(() => {
    setEmail(initialEmail);
  }, [initialEmail]);

  function handleChange(event) {
    setEmail(event.target.value);
    setEmailError('');
    setGeneralError('');
    setSuccess('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setGeneralError('');
    setSuccess('');

    const localError = validateEmail(email);
    if (localError) {
      setEmailError(localError);
      return;
    }

    setSubmitting(true);
    try {
      const response = await client.post('/auth/resend-verification', {
        email: email.trim(),
      });
      setSuccess(response.data.message || SUCCESS_MESSAGE);
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
    <form className="resend-form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="resend-email">Correo electrónico</label>
        <input
          id="resend-email"
          name="email"
          type="email"
          value={email}
          onChange={handleChange}
          aria-invalid={Boolean(emailError)}
          aria-describedby={emailError ? 'resend-email-error' : undefined}
          autoComplete="email"
        />
        {emailError && (
          <p className="field-error" id="resend-email-error" role="alert">
            {emailError}
          </p>
        )}
      </div>

      {generalError && (
        <p className="alert alert-error" role="alert">
          {generalError}
        </p>
      )}

      {success && (
        <p className="alert alert-success" role="status">
          {success}
        </p>
      )}

      <button type="submit" className="button" disabled={submitting || cooldown > 0}>
        {cooldown > 0
          ? `Espera ${cooldown} s para reenviar`
          : submitting
            ? 'Enviando…'
            : 'Reenviar correo de verificación'}
      </button>
    </form>
  );
}
