// Patrón Strategy: cada logro es una regla independiente. Agregar un logro
// nuevo es agregar un elemento a esta lista, sin tocar el evaluador.
const rules = [
  {
    code: 'FIRST_MATCH',
    isUnlocked: (stats) => stats.gamesPlayed >= 1,
  },
  {
    code: 'FIRST_WIN',
    isUnlocked: (stats) => stats.gamesWon >= 1,
  },
  {
    code: 'TEN_MATCHES',
    isUnlocked: (stats) => stats.gamesPlayed >= 10,
  },
  {
    code: 'HIGH_SCORE',
    isUnlocked: (stats) => stats.bestScore >= 100,
  },
  {
    code: 'THREE_WINS',
    isUnlocked: (stats) => stats.gamesWon >= 3,
  },
];

module.exports = { rules };
