// Etiquetas de efectos (ralentizado, sector de riesgo, evento) con su detalle y duración.
export default function StatusChips({ effects, emptyText = '' }) {
  if (!effects || effects.length === 0) {
    return emptyText ? <p className="status-empty">{emptyText}</p> : null;
  }

  return (
    <ul className="status-chips" aria-label="Efectos activos">
      {effects.map((effect) => (
        <li
          key={effect.id}
          className={`status-chip status-chip-${effect.tone}`}
          style={effect.accent ? { '--chip-accent': effect.accent } : undefined}
        >
          <span className="status-chip-label">{effect.label}</span>
          <span className="status-chip-detail">{effect.detail}</span>
        </li>
      ))}
    </ul>
  );
}
