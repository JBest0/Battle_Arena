import { useEffect, useRef, useState } from 'react';
import { playEventSound } from '../game/eventSound';

const ANNOUNCEMENT_MS = 4500;

/*
 * Anuncia cada evento especial nuevo: devuelve el evento mientras dura el anuncio
 * (unos segundos) y reproduce su sonido una vez. `events` es hud.events.
 */
export function useEventAnnouncement(events) {
  const [announcement, setAnnouncement] = useState(null);
  const latest = useRef(null);
  const current = events && events.length > 0 ? events[0] : null;

  latest.current = current;
  const eventId = current ? current.id : null;

  useEffect(() => {
    if (!eventId) return undefined;

    setAnnouncement(latest.current);
    playEventSound(latest.current.type);
    const timer = setTimeout(() => setAnnouncement(null), ANNOUNCEMENT_MS);

    return () => clearTimeout(timer);
  }, [eventId]);

  return announcement;
}
