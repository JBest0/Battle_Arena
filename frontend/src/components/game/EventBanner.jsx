// Anuncio de un evento especial sobre la arena (aparece unos segundos al empezar).
export default function EventBanner({ event }) {
  if (!event) return null;

  return (
    <div
      key={event.id}
      className="event-banner"
      style={{ '--event-accent': event.accent }}
      role="alert"
    >
      <span className="event-banner-kicker">Evento especial</span>
      <strong className="event-banner-title">{event.name}</strong>
      <span className="event-banner-text">{event.description}</span>
    </div>
  );
}
