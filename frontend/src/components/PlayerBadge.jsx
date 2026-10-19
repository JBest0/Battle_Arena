import AvatarImage from './AvatarImage';

export default function PlayerBadge({ user }) {
  return (
    <span className="player-badge">
      <AvatarImage
        src={user?.avatarUrl}
        username={user?.username}
        size={40}
      />
      <span className="player-badge-name">{user?.username}</span>
    </span>
  );
}
