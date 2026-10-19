export function toPlayerView({ id, username, avatarUrl }) {
  return {
    id,
    username,
    avatarUrl: avatarUrl || null,
  };
}
