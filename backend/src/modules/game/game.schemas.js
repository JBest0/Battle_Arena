const { z } = require('zod');
const { END_MODES, GAME_LIMITS, normalizeConfig } = require('./game.config');
const { SCENARIO_ID } = require('../scenarios/scenario.schema');

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

const scenarioIdSchema = z
  .string({ invalid_type_error: 'Escenario inválido' })
  .max(50)
  .regex(SCENARIO_ID, 'Escenario inválido');

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
    // Id del catálogo o "random"; si falta se usa el escenario por defecto.
    scenarioId: scenarioIdSchema.optional(),
  })
  .transform((config) => normalizeConfig(config));

const matchIdParamsSchema = z.object({
  id: z
    .string({ invalid_type_error: 'Partida inválida' })
    .uuid('Partida inválida'),
});

const scenarioIdParamsSchema = z.object({ id: scenarioIdSchema });

module.exports = {
  gameConfigSchema,
  matchIdParamsSchema,
  scenarioIdParamsSchema,
};
