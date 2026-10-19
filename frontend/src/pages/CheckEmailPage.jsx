import { Link, useLocation } from 'react-router-dom';
import ResendVerificationForm from '../components/ResendVerificationForm';

export default function CheckEmailPage() {
  const location = useLocation();
  const email = location.state?.email;
  const emailSent = location.state?.emailSent !== false;

  return (
    <section className="card form-card">
      <h2>Revisa tu correo</h2>

      <p>
        {email
          ? `Te enviamos un correo a ${email}. Debes verificarlo antes de poder jugar.`
          : 'Te enviamos un correo de verificación. Debes verificarlo antes de poder jugar.'}
      </p>

      {!emailSent && (
        <p className="alert alert-warning" role="alert">
          No pudimos enviar el correo; podrás reenviarlo más adelante.
        </p>
      )}

      <Link className="button" to="/login">
        Ir a iniciar sesión
      </Link>

      <section className="resend-section">
        <h3>¿No te llegó el correo?</h3>
        <p>Puedes solicitar un nuevo enlace de verificación.</p>
        <ResendVerificationForm initialEmail={email || ''} />
      </section>
    </section>
  );
}
