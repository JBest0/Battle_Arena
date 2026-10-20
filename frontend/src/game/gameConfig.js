import { formatDuration } from '../utils/dates';

export const END_MODE_LABELS = {
  TIME: 'Por tiempo',
  POINTS: 'Por puntos',
};

const FIELD_LABELS = {
  durationSeconds: 'La duración',
  targetPoints: 'Los puntos objetivo',
  maxPlayers: 'El máximo de jugadores',
};

function checkNumber(values, name, limits, errors) {
  const raw = values[name];
  const { min, max } = limits[name];
  const label = FIELD_LABELS[name];

  if (raw === '' || raw === null || raw === undefined) {
    errors[name] = `${label} es obligatorio`;
    return;
  }

  const number = Number(raw);
  if (!Number.isInteger(number)) {
    errors[name] = `${label} debe ser un número entero`;
  } else if (number < min || number > max) {
    errors[name] = `${label} debe estar entre ${min} y ${max}`;
  }
}

// Mismas reglas que el backend (límites tomados de GET /api/game/options).
export function validateGameConfig(values, limits) {
  const errors = {};

  checkNumber(values, 'maxPlayers', limits, errors);
  if (values.endMode === 'TIME') {
    checkNumber(values, 'durationSeconds', limits, errors);
  } else {
    checkNumber(values, 'targetPoints', limits, errors);
  }

  return errors;
}

// Solo envía el campo que aplica al modo elegido.
export function toConfigPayload(values) {
  const payload = {
    endMode: values.endMode,
    maxPlayers: Number(values.maxPlayers),
  };

  if (values.endMode === 'TIME') {
    payload.durationSeconds = Number(values.durationSeconds);
  } else {
    payload.targetPoints = Number(values.targetPoints);
  }

  return payload;
}

// "Por tiempo · 03:00 · hasta 2 jugadores"
export function describeConfig(config) {
  const goal =
    config.endMode === 'TIME'
      ? formatDuration(config.durationSeconds)
      : `${config.targetPoints} puntos`;

  return `${END_MODE_LABELS[config.endMode]} · ${goal} · hasta ${
    config.maxPlayers
  } jugadores`;
}
