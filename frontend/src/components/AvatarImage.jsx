import { useEffect, useState } from 'react';

export default function AvatarImage({
  src,
  username,
  size = 40,
  className = '',
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const initial = username ? username.charAt(0).toUpperCase() : '?';
  const classes = ['avatar', className].filter(Boolean).join(' ');
  const style = { width: size, height: size };

  if (!src || failed) {
    return (
      <span
        className={`${classes} avatar-fallback`}
        style={style}
        role="img"
        aria-label={`Avatar de ${username || 'jugador'}`}
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      className={classes}
      style={style}
      src={src}
      alt={`Avatar de ${username}`}
      onError={() => setFailed(true)}
    />
  );
}
