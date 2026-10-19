import { useState } from 'react';
import ResendVerificationForm from './ResendVerificationForm';

export default function UnverifiedBanner({ user }) {
  const [showForm, setShowForm] = useState(false);

  if (!user || user.emailVerified) {
    return null;
  }

  return (
    <div className="unverified-banner" role="status">
      <p>
        Tu correo está pendiente de verificación. No podrás iniciar partidas
        hasta verificarlo.
      </p>
      {showForm ? (
        <ResendVerificationForm initialEmail={user.email} />
      ) : (
        <button
          type="button"
          className="button"
          onClick={() => setShowForm(true)}
        >
          Reenviar correo
        </button>
      )}
    </div>
  );
}
