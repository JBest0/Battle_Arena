import { formatDate } from '../../utils/dates';

export default function AchievementsGrid({ achievements }) {
  if (!achievements || achievements.length === 0) {
    return <p className="empty-state">Todavía no hay logros definidos.</p>;
  }

  const unlockedCount = achievements.filter(
    (achievement) => achievement.unlocked
  ).length;

  return (
    <div>
      <p className="achievements-summary">
        {unlockedCount} de {achievements.length} logros desbloqueados
      </p>

      <ul className="achievements-grid">
        {achievements.map((achievement) => (
          <li
            key={achievement.code}
            className={
              achievement.unlocked
                ? 'achievement achievement-unlocked'
                : 'achievement achievement-locked'
            }
          >
            <span className="achievement-icon" aria-hidden="true">
              {achievement.unlocked ? achievement.icon || '★' : '⚿'}
            </span>
            <div>
              <h3>{achievement.name}</h3>
              <p>{achievement.description}</p>
              <p className="achievement-status">
                {achievement.unlocked
                  ? `Desbloqueado el ${formatDate(achievement.unlockedAt)}`
                  : 'Bloqueado'}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
