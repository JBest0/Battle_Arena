/*
 * Lógica del HUD sin React ni canvas (para poder probarla): ranking, estado propio y efectos
 * activos, avisos de obstáculos y leyenda de lo que trae el escenario. Trabaja con el `hud`
 * que arma toHud() (ver arenaState.js) y con la definición del escenario.
 */

// Ranking por puntaje; los empatados comparten posición (1, 1, 3...).
export function rankPlayers(players) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  let rank = 0;
  let previous = null;

  return sorted.map((player, index) => {
    if (player.score !== previous) {
      rank = index + 1;
      previous = player.score;
    }

    return { ...player, rank };
  });
}

// Multiplicador de puntos por celda de quien juega: el del evento activo (sobrecarga: x2) por
// el del sector de riesgo donde está.
export function pointsPerCell(me, events = []) {
  const fromEvents = events.reduce((product, event) => {
    const multiplier = event.params?.multiplier;

    return Number.isFinite(multiplier) && multiplier > 1 ? product * multiplier : product;
  }, 1);

  return fromEvents * (me.risk > 1 ? me.risk : 1);
}

const seconds = (value) => `${Math.max(1, Math.ceil(value))} s`;

/**
 * Efectos que tiene quien juega, para mostrarlos como etiquetas.
 * tone: 'bad' (perjudica), 'risk' (riesgo con premio) o 'event'.
 * @param {{ includeEvents?: boolean }} [options]  los eventos también se pueden mostrar aparte
 */
export function myEffects(me, events = [], { includeEvents = false } = {}) {
  const effects = [];

  if (me.frozen > 0) {
    effects.push({ id: 'frozen', label: 'Congelado', detail: seconds(me.frozen), tone: 'frozen' });
  }
  if (me.slow > 0) {
    effects.push({ id: 'slow', label: 'Ralentizado', detail: seconds(me.slow), tone: 'bad' });
  }
  if (me.risk > 1) {
    effects.push({
      id: 'risk',
      label: 'Sector de riesgo',
      detail: `puntos x${me.risk}`,
      tone: 'risk',
    });
  }
  if (includeEvents) {
    events.forEach((event) => {
      effects.push({
        id: event.id,
        label: event.name,
        detail: seconds(event.remaining),
        tone: 'event',
        accent: event.accent,
      });
    });
  }

  return effects;
}

// Datos del jugador que mira, con su posición y el total de jugadores.
export function myStatus(hud, userId) {
  const ranked = rankPlayers(hud.players);
  const me = ranked.find((player) => player.id === userId);
  if (!me) return null;

  return {
    me,
    rank: me.rank,
    total: ranked.length,
    score: me.score,
    pointsPerCell: pointsPerCell(me, hud.events),
    effects: myEffects(me, hud.events),
  };
}

// ¿Quedan 10 s o menos? (el reloj se pone en alerta)
export function isUrgent(hud, threshold = 10) {
  return (
    (hud.status === 'RUNNING' &&
      hud.timeRemaining !== null &&
      hud.timeRemaining !== undefined &&
      hud.timeRemaining <= threshold) ||
    (hud.status === 'OVERTIME' &&
      hud.overtimeRemaining !== null &&
      hud.overtimeRemaining !== undefined &&
      hud.overtimeRemaining <= threshold)
  );
}

const KIND_LABELS = {
  door: { one: 'puerta', many: 'puertas' },
  corridor: { one: 'corredor', many: 'corredores' },
  barrier: { one: 'barrera', many: 'barreras' },
  wall: { one: 'pared', many: 'paredes' },
};
const noun = (kind, count) => KIND_LABELS[kind][count === 1 ? 'one' : 'many'];

// Resumen de los obstáculos dinámicos de la partida: total y cuántos están cerrados.
export function summarizeObstacles(obstacles = []) {
  const summary = {};

  ['door', 'corridor', 'barrier', 'wall'].forEach((kind) => {
    const items = obstacles.filter((item) => item.kind === kind);
    summary[kind] = { total: items.length, closed: items.filter((item) => item.closed).length };
  });

  return summary;
}

// Avisos de lo que está por cambiar (el servidor marca `warning` poco antes).
export function obstacleAlerts(obstacles = []) {
  const warning = obstacles.filter((item) => item.warning);
  const doors = warning.filter((item) => item.kind === 'door' || item.kind === 'corridor');
  const barriers = warning.filter((item) => item.kind === 'barrier');
  const alerts = [];

  if (doors.length > 0) {
    alerts.push(
      doors.length === 1
        ? `Se va a cerrar ${doors[0].kind === 'door' ? 'una puerta' : 'un corredor'}`
        : `Se van a cerrar ${doors.length} pasos`
    );
  }
  if (barriers.length > 0) {
    alerts.push(
      barriers.length === 1 ? 'Una barrera está por moverse' : `${barriers.length} barreras están por moverse`
    );
  }

  return alerts;
}

/**
 * Leyenda: qué trae el escenario y cómo se llama cada cosa. `color` es la clave de la paleta
 * del escenario; `live` dice qué conteo en vivo mostrar (ver summarizeObstacles).
 */
export function scenarioLegend(scenario) {
  if (!scenario) return [];

  const { barriers = [], doors = [], corridors = [] } = scenario.obstacles || {};
  const traps = scenario.traps || [];
  const zones = scenario.riskZones || [];
  const entries = [];

  if (traps.length > 0) {
    const slowest = Math.min(...traps.map((trap) => trap.slowFactor));
    entries.push({
      id: 'trap',
      label: 'Trampa',
      hint: `Frena al ${Math.round(slowest * 100)} % de velocidad`,
      color: 'trap',
    });
  }
  if (zones.length > 0) {
    entries.push({
      id: 'riskZone',
      label: 'Sector de riesgo',
      hint: `Puntos x${Math.max(...zones.map((zone) => zone.multiplier))}, más expuesto`,
      color: 'riskZone',
    });
  }
  if (doors.length > 0) {
    entries.push({ id: 'door', label: 'Puerta automática', hint: 'Se abre y se cierra', color: 'door', live: 'door' });
  }
  if (corridors.length > 0) {
    entries.push({
      id: 'corridor',
      label: 'Corredor bloqueable',
      hint: 'Se cierra por un rato',
      color: 'door',
      live: 'corridor',
    });
  }
  if (barriers.length > 0) {
    entries.push({ id: 'barrier', label: 'Barrera móvil', hint: 'Cambia de posición', color: 'barrier', live: 'barrier' });
  }
  if (scenario.randomWalls) {
    entries.push({ id: 'wall', label: 'Paredes que cambian', hint: 'Aparecen y desaparecen', color: 'wall', live: 'wall' });
  }

  return entries;
}

// Entrada de la leyenda para los guardianes (no depende del escenario: salen en todos).
export function guardianLegend(count) {
  if (!count) return null;

  return {
    id: 'guardian',
    label: 'Guardián',
    hint: 'Te persigue y te congela unos segundos si te toca',
    live: `${count} en la arena`,
  };
}

// Texto del conteo en vivo de una entrada de la leyenda ("2 de 4 cerradas", "3 activas").
export function liveText(entry, summary) {
  if (!entry.live) return '';

  const { total, closed } = summary[entry.live];
  if (entry.live === 'barrier') return total === 0 ? '' : `${total} en movimiento`;
  if (entry.live === 'wall') return `${total} ${noun('wall', total)} ahora`;

  return `${closed} de ${total} cerrad${total === 1 ? 'a' : 'as'}`;
}
