import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import client, { getErrorMessage } from '../api/client';
import { getErrorCode } from '../utils/apiErrors';
import ResendVerificationForm from '../components/ResendVerificationForm';

const RESENDABLE_CODES = ['TOKEN_EXPIRED', 'TOKEN_USED', 'TOKEN_INVALID'];

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const startedRef = useRef(false);
  const [status, setStatus] = useState('verifying');
  const [errorCode, setErrorCode] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!token) {
      setStatus('error');
      setErrorCode('TOKEN_INVALID');
      setErrorMessage('Falta el token de verificación');
      return;
    }

    let active = true;

    async function verify() {
      try {
        const response = await client.post('/auth/verify-email', { token });
        if (!active) return;

        setStatus(response.data.alreadyVerified ? 'already' : 'success');
      } catch (err) {
        if (!active) return;

        setStatus('error');
        setErrorCode(getErrorCode(err));
        setErrorMessage(getErrorMessage(err));
      }
    }

    verify();

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <section className="card form-card">
      <h2>Verificación de correo</h2>

      {status === 'verifying' && (
        <p className="status" role="status">
          Verificando tu correo…
        </p>
      )}

      {status === 'success' && (
        <>
          <p className="status status-ok" role="status">
            ¡Correo verificado!
          </p>
          <p>Ya puedes iniciar sesión y jugar.</p>
          <Link className="button" to="/login">
            Iniciar sesión
          </Link>
        </>
      )}

      {status === 'already' && (
        <>
          <p className="status status-ok" role="status">
            Tu correo ya estaba verificado
          </p>
          <Link className="button" to="/login">
            Iniciar sesión
          </Link>
        </>
      )}

      {status === 'error' && (
        <>
          <p className="alert alert-error" role="alert">
            {errorMessage}
          </p>

          {RESENDABLE_CODES.includes(errorCode) && (
            <>
              <p>Puedes pedir un nuevo enlace de verificación.</p>
              <ResendVerificationForm />
            </>
          )}

          <p className="form-footer">
            <Link to="/login">Volver a iniciar sesión</Link>
          </p>
        </>
      )}
    </section>
  );
}
