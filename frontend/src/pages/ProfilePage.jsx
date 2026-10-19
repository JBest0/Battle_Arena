import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AvatarImage from '../components/AvatarImage';
import AvatarPicker from '../components/AvatarPicker';

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
        <AvatarImage
          src={user.avatarUrl}
          username={user.username}
          size={128}
          className="avatar-large"
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

      <section className="profile-section">
        <h2>Tu avatar</h2>
        <AvatarPicker />
      </section>

      {/* US-04: completar con datos básicos, estadísticas, logros, ranking e historial */}
    </section>
  );
}
