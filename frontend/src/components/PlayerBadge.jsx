import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function PlayerBadge({ user }) {
  const [imageFailed, setImageFailed] = useState(false);
  const initial = user?.username ? user.username.charAt(0).toUpperCase() : '?';

  return (
    <span className="player-badge">
      {user?.avatarUrl && !imageFailed ? (
        <img
          className="avatar"
          src={user.avatarUrl}
          alt={`Avatar de ${user.username}`}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="avatar avatar-fallback" aria-hidden="true">
          {initial}
        </span>
      )}
      <span className="player-badge-name">{user?.username}</span>
    </span>
  );
}
