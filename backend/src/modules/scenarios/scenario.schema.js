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
 */
function createScenarioSchema({ cols, rows }) {
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
