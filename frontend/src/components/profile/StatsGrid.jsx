const STAT_ITEMS = [
  { key: 'gamesPlayed', label: 'Partidas jugadas' },
  { key: 'gamesWon', label: 'Victorias' },
  { key: 'gamesLost', label: 'Derrotas' },
  { key: 'gamesDrawn', label: 'Empates' },
  { key: 'winRate', label: 'Porcentaje de victorias', suffix: '%' },
  { key: 'totalPoints', label: 'Puntos totales' },
  { key: 'averagePoints', label: 'Puntos por partida' },
  { key: 'bestScore', label: 'Mejor puntaje' },
  { key: 'rankingPoints', label: 'Puntos de ranking' },
];

export default function StatsGrid({ stats }) {
  return (
    <dl className="stats-grid">
      {STAT_ITEMS.map((item) => (
        <div className="stat-card" key={item.key}>
          <dt>{item.label}</dt>
          <dd>
            {stats[item.key]}
            {item.suffix || ''}
          </dd>
        </div>
      ))}
    </dl>
  );
}
