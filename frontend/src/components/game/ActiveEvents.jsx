// Efectos activos en el HUD: evento especial en curso y cuánto le queda.
export default function ActiveEvents({ events }) {
  if (!events || events.length === 0) return null;

  return (
    <section className="active-events" aria-label="Eventos activos">
      <h3 className="arena-hud-label">Evento activo</h3>
      <ul>
        {events.map((event) => {
          const left = Math.max(0, Math.ceil(event.remaining));
          const progress = Math.min(100, Math.max(0, (event.remaining / event.duration) * 100));

          return (
            <li
              key={event.id}
              className="active-event"
              style={{ '--event-accent': event.accent }}
            >
              <div className="active-event-head">
                <span className="active-event-name">{event.name}</span>
                <span className="active-event-time">{left} s</span>
              </div>
              <p className="active-event-text">{event.description}</p>
              <div className="active-event-bar" aria-hidden="true">
                <span style={{ width: `${progress}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
