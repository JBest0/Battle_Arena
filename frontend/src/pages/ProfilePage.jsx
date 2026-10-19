import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function ProfilePage() {
  const { user } = useAuth();
  const location = useLocation();
  const notice = location.state?.notice;

  return (
    <section className="card profile-card">
      {notice && (
        <p className="alert alert-warning" role="status">
          {notice.message}
        </p>
      )}

      <div className="profile-header">
        <img
          className="avatar avatar-large"
          src={user.avatarUrl}
          alt={`Avatar de ${user.username}`}
        />
        <div>
          <h2>{user.username}</h2>
          <p>{user.email}</p>
          <p
            className={
              user.emailVerified ? 'status status-ok' : 'status status-error'
            }
          >
            {user.emailVerified
              ? 'Correo verificado'
              : 'Pendiente de verificación'}
          </p>
        </div>
      </div>

      {/* US-04: completar con datos básicos, estadísticas, logros, ranking e historial */}
    </section>
  );
}
