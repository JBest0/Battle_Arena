const { SpecialEvent } = require('../specialEvent');

// Invasión de guardianes (US-22 / CA-22.2): durante el evento aparecen guardianes extra, con
// las mismas características que los permanentes (persiguen, congelan, misma velocidad).
// Al terminar el evento desaparecen todos. Si la partida no tiene guardianes, no se elige.
class GuardianInvasionEvent extends SpecialEvent {
  static canStart(engine) {
    return Boolean(engine.guardians);
  }

  start(engine) {
    this.count = engine.guardians.spawnExtra(engine, engine.guardians.settings.invasionCount).length;
  }

  // eslint-disable-next-line class-methods-use-this
  end(engine) {
    engine.guardians.removeExtra();
  }

  params() {
    return { count: this.count ?? 0 };
  }
}

GuardianInvasionEvent.type = 'guardian-invasion';
GuardianInvasionEvent.label = 'Invasión de guardianes';
GuardianInvasionEvent.description = 'Aparecen guardianes extra que persiguen a los jugadores.';
GuardianInvasionEvent.accent = '#ff4d6d';

module.exports = { GuardianInvasionEvent };
