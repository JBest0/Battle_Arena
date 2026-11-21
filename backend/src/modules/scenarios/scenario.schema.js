const { z } = require('zod');

const SCENARIO_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAP_CHARS = /^[#.R1-4TC]+$/;

const color = z
  .string({ invalid_type_error: 'Color inválido' })
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido (use el formato #RRGGBB)');

// Colores obligatorios; se pueden agregar más (por ejemplo, para trampas o puertas).
const paletteSchema = z
  .object({
    floor: color,
    grid: color,
    wall: color,
    wallTop: color,
    reactor: color,
    terminal: color,
    cell: color,
  })
  .catchall(color);

const musicSchema = z.object({
  track: z.string().trim().min(1).max(60),
  // Ruta del audio; null mientras no haya archivo con licencia documentada.
  src: z.string().trim().min(1).max(200).nullable(),
  volume: z.number().min(0).max(1),
});

// Id de un obstáculo, trampa o sector (minúsculas, números y guiones).
const ITEM_ID = z
  .string()
  .max(40)
  .regex(SCENARIO_ID, 'El id solo puede tener minúsculas, números y guiones');

/**
 * Formato de un escenario (un archivo .json en la carpeta de escenarios):
 *
 * {
 *   "id": "estacion-espacial",          identificador único (minúsculas y guiones)
 *   "name": "Estación espacial",
 *   "description": "…",
 *   "order": 2,                         posición en el catálogo (el menor es el por defecto)
 *   "palette": { floor, grid, wall, wallTop, reactor, terminal, cell },   colores #RRGGBB
 *   "music": { "track": "…", "src": null, "volume": 0.4 },
 *   "map": [ 20 textos de 32 caracteres ]
 * }
 *
 * Leyenda del mapa (cada carácter es una celda de 25 × 25):
 *   #  muro            .  piso             R  reactor (un solo bloque rectangular)
 *   1-4 punto de inicio de cada jugador (los cuatro, una vez cada uno)
 *   T  terminal energética                C  posición donde aparece una celda de energía
 *
 * Secciones opcionales (todas en celdas: col/row es la esquina superior izquierda):
 *
 *   "obstacles": {
 *     "barriers":  [{ id, cols, rows, route: [[col,row],…], pattern: "pingpong"|"loop", periodSeconds }],
 *     "doors":     [{ id, col, row, cols, rows, closedSeconds, openSeconds, offsetSeconds }],
 *     "corridors": [{ id, col, row, cols, rows, closedSeconds, minOpenSeconds, maxOpenSeconds }]
 *   },
 *   "traps":       [{ id, col, row, cols, rows, slowFactor, durationSeconds }],
 *   "riskZones":   [{ id, col, row, cols, rows, multiplier, exposure }],
 *   "randomWalls": { maxActive, size: [cols, rows], zones: [{ col, row, cols, rows }] }
 *
 * Barreras, puertas, corredores y zonas de paredes aleatorias solo pueden estar sobre piso
 * (.) y no sobre inicios, terminales ni celdas de energía. Las trampas y los sectores de
 * riesgo pueden cubrir terminales y celdas, pero no muros.
 */
function createScenarioSchema({ cols, rows }) {
  const cell = (min) => z.number().int().min(min);
  const rect = {
    col: cell(1).max(cols - 2),
    row: cell(1).max(rows - 2),
    cols: cell(1).max(cols - 2),
    rows: cell(1).max(rows - 2),
  };
  const spot = z.tuple([cell(1).max(cols - 2), cell(1).max(rows - 2)]);

  const barrier = z.object({
    id: ITEM_ID,
    cols: cell(1).max(4),
    rows: cell(1).max(4),
    route: z.array(spot).min(2).max(12),
    pattern: z.enum(['pingpong', 'loop']).default('pingpong'),
    periodSeconds: z.number().min(0.5).max(30).default(2.5),
  });
  const door = z.object({
    id: ITEM_ID,
    ...rect,
    closedSeconds: z.number().min(1).max(60).default(4),
    openSeconds: z.number().min(1).max(60).default(6),
    offsetSeconds: z.number().min(0).max(120).default(0),
  });
  const corridor = z
    .object({
      id: ITEM_ID,
      ...rect,
      closedSeconds: z.number().min(1).max(60).default(6),
      minOpenSeconds: z.number().min(1).max(120).default(8),
      maxOpenSeconds: z.number().min(1).max(120).default(18),
    })
    .refine((value) => value.minOpenSeconds <= value.maxOpenSeconds, {
      message: 'minOpenSeconds no puede ser mayor que maxOpenSeconds',
      path: ['minOpenSeconds'],
    });
  const trap = z.object({
    id: ITEM_ID,
    ...rect,
    slowFactor: z.number().min(0.1).max(0.9).default(0.45),
    durationSeconds: z.number().min(0.5).max(10).default(2.5),
  });
  const riskZone = z.object({
    id: ITEM_ID,
    ...rect,
    // Entero para que el puntaje siga siendo entero.
    multiplier: z.number().int().min(2).max(5).default(2),
    // Qué tan expuesto queda el jugador (alcance de captura de los guardianes).
    exposure: z.number().min(1).max(3).default(2),
  });
  const randomWalls = z.object({
    maxActive: cell(1).max(8),
    size: z.tuple([cell(1).max(4), cell(1).max(4)]).default([2, 1]),
    zones: z.array(z.object(rect)).min(1).max(8),
  });

  return z.object({
    id: z
      .string()
      .max(50)
      .regex(SCENARIO_ID, 'El id solo puede tener minúsculas, números y guiones'),
    name: z.string().trim().min(1, 'El nombre es obligatorio').max(60),
    description: z.string().trim().min(1, 'La descripción es obligatoria').max(300),
    order: z.number().int().min(0).max(1000),
    palette: paletteSchema,
    music: musicSchema,
    obstacles: z
      .object({
        barriers: z.array(barrier).max(12).default([]),
        doors: z.array(door).max(12).default([]),
        corridors: z.array(corridor).max(12).default([]),
      })
      .default({}),
    traps: z.array(trap).max(24).default([]),
    riskZones: z.array(riskZone).max(12).default([]),
    randomWalls: randomWalls.nullable().default(null),
    map: z
      .array(
        z
          .string()
          .length(cols, `Cada fila del mapa debe tener ${cols} caracteres`)
          .regex(MAP_CHARS, 'El mapa solo admite # . R 1 2 3 4 T C')
      )
      .length(rows, `El mapa debe tener ${rows} filas`),
  });
}

module.exports = { createScenarioSchema, SCENARIO_ID };
