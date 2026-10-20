const { z } = require('zod');
const { END_MODES, GAME_LIMITS, normalizeConfig } = require('./game.config');

function integerField(label, { min, max }) {
  return z
    .number({
      invalid_type_error: `${label} debe ser un número`,
    })
    .int(`${label} debe ser un número entero`)
    .min(min, `${label} debe ser al menos ${min}`)
    .max(max, `${label} debe ser como máximo ${max}`)
    .optional();
}

const gameConfigSchema = z
  .object({
    endMode: z.enum(END_MODES, {
      errorMap: () => ({ message: 'El modo de fin debe ser TIME o POINTS' }),
    }),
    durationSeconds: integerField(
      'La duración (segundos)',
      GAME_LIMITS.durationSeconds
    ),
    targetPoints: integerField(
      'Los puntos objetivo',
      GAME_LIMITS.targetPoints
    ),
    maxPlayers: integerField(
      'El máximo de jugadores',
      GAME_LIMITS.maxPlayers
    ),
  })
  .transform((config) => normalizeConfig(config));

const matchIdParamsSchema = z.object({
  id: z
    .string({ invalid_type_error: 'Partida inválida' })
    .uuid('Partida inválida'),
});

module.exports = { gameConfigSchema, matchIdParamsSchema };
