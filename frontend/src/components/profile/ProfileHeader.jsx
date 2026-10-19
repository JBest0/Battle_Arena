import AvatarImage from '../AvatarImage';
import ResendVerificationForm from '../ResendVerificationForm';
import { formatDate, formatDateTime } from '../../utils/dates';

export default function ProfileHeader({ user, isOwnProfile, ranking, notice }) {
  return (
    <header className="profile-header-block">
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
        <div className="profile-header-info">
          <h2>{user.username}</h2>
          {user.displayName && (
            <p className="profile-display-name">{user.displayName}</p>
          )}

          <dl className="profile-meta">
            <div>
              <dt>Miembro desde</dt>
              <dd>{formatDate(user.memberSince)}</dd>
            </div>
            <div>
              <dt>Último acceso</dt>
              <dd>{formatDateTime(user.lastLoginAt)}</dd>
            </div>
            <div>
              <dt>Ranking</dt>
              <dd>
                {ranking.position
                  ? `#${ranking.position} de ${ranking.totalPlayers}`
                  : 'Sin posición'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {isOwnProfile && (
        <div className="email-status">
          <div>
            <span className="email-label">Correo</span>
            <span className="email-value">{user.email}</span>
          </div>
          <span
            className={
              user.emailVerified ? 'status status-ok' : 'status status-pending'
            }
          >
            {user.emailVerified
              ? 'Correo verificado'
              : 'Pendiente de verificación'}
          </span>
          {!user.emailVerified && (
            <ResendVerificationForm initialEmail={user.email} />
          )}
        </div>
      )}
    </header>
  );
}
