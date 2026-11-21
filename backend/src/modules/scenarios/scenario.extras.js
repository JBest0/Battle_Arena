// Valida la geometría de las secciones opcionales de un escenario (obstáculos, trampas,
// sectores de riesgo y paredes aleatorias) contra su mapa. La forma de los datos ya la
// comprobó el esquema (scenario.schema.js); aquí se revisa que tengan sentido en el mapa.

const SPECIAL = new Set(['1', '2', '3', '4', 'T', 'C']);

function cellsOfRect({ col, row, cols, rows }) {
  const cells = [];
  for (let r = row; r < row + rows; r += 1) {
    for (let c = col; c < col + cols; c += 1) cells.push({ col: c, row: r });
  }

  return cells;
}

/**
 * Devuelve la lista de problemas (vacía si todo está bien).
 * @param {object} definition  escenario ya validado por el esquema
 */
function validateExtras(definition) {
  const errors = [];
  const { map } = definition;
  const rows = map.length;
  const cols = map[0].length;
  const at = ({ col, row }) => map[row]?.[col];
  const where = (cell) => `col ${cell.col}, fila ${cell.row}`;

  const obstacles = definition.obstacles || {};
  const barriers = obstacles.barriers || [];
  const doors = obstacles.doors || [];
  const corridors = obstacles.corridors || [];
  const traps = definition.traps || [];
  const riskZones = definition.riskZones || [];
  const randomWalls = definition.randomWalls || null;

  // Ids únicos dentro de cada tipo (el cliente identifica cada obstáculo por su id).
  const seen = new Set();
  [
    ['barrera', barriers],
    ['puerta', doors],
    ['corredor', corridors],
    ['trampa', traps],
    ['sector de riesgo', riskZones],
  ].forEach(([label, list]) => {
    list.forEach((item) => {
      const key = `${label}:${item.id}`;
      if (seen.has(key)) errors.push(`El id "${item.id}" está repetido entre las ${label}s`);
      seen.add(key);
    });
  });
  const dynamicIds = [...barriers, ...doors, ...corridors].map((item) => item.id);
  dynamicIds.forEach((id, i) => {
    if (dynamicIds.indexOf(id) !== i) {
      errors.push(`El id "${id}" está repetido entre barreras, puertas y corredores`);
    }
  });

  const insideBounds = (cell) =>
    cell.col >= 1 && cell.row >= 1 && cell.col <= cols - 2 && cell.row <= rows - 2;

  // Zonas que deben ser piso libre (sin inicios, terminales ni celdas de energía).
  function requireFloor(label, cells) {
    const bad = cells.find((cell) => !insideBounds(cell) || at(cell) !== '.');
    if (bad) {
      const found = insideBounds(bad) ? ` (hay "${at(bad)}")` : ' (fuera del mapa)';
      errors.push(`${label} debe estar sobre piso libre: ${where(bad)}${found}`);
    }
  }

  const footprints = [];
  barriers.forEach((barrier) => {
    const cells = [];
    barrier.route.forEach(([col, row], i) => {
      const part = cellsOfRect({ col, row, cols: barrier.cols, rows: barrier.rows });
      requireFloor(`La barrera "${barrier.id}" (posición ${i + 1})`, part);
      cells.push(...part);
    });
    footprints.push({ label: `la barrera "${barrier.id}"`, cells });
  });
  [...doors, ...corridors].forEach((item) => {
    const cells = cellsOfRect(item);
    requireFloor(`"${item.id}"`, cells);
    footprints.push({ label: `"${item.id}"`, cells });
  });
  if (randomWalls) {
    randomWalls.zones.forEach((zone, i) => {
      const cells = cellsOfRect(zone);
      const bad = cells.find((cell) => !insideBounds(cell) || at(cell) === '#' || at(cell) === 'R');
      if (bad) errors.push(`La zona ${i + 1} de paredes aleatorias toca un muro o está fuera del mapa: ${where(bad)}`);
      // Los inicios, terminales y celdas dentro de una zona se respetan: ahí no cae ninguna pared.
      footprints.push({
        label: `la zona ${i + 1} de paredes aleatorias`,
        cells: cells.filter((cell) => !SPECIAL.has(at(cell))),
      });
    });
    const [pieceCols, pieceRows] = randomWalls.size;
    const fits = randomWalls.zones.some((zone) => zone.cols >= pieceCols && zone.rows >= pieceRows);
    if (!fits) errors.push('Ninguna zona de paredes aleatorias es lo bastante grande para el tamaño de pared');
  }

  // Dos obstáculos dinámicos no pueden compartir celdas.
  const owner = new Map();
  footprints.forEach(({ label, cells }) => {
    cells.forEach((cell) => {
      const key = `${cell.col},${cell.row}`;
      if (owner.has(key) && owner.get(key) !== label) {
        errors.push(`${label} se traslapa con ${owner.get(key)} en ${where(cell)}`);
      } else {
        owner.set(key, label);
      }
    });
  });

  // Trampas y sectores: sobre cualquier celda que no sea muro ni reactor; las trampas
  // tampoco sobre un inicio (nadie debe empezar la partida frenado).
  [...traps, ...riskZones].forEach((item) => {
    const isTrap = traps.includes(item);
    const label = `${isTrap ? 'La trampa' : 'El sector de riesgo'} "${item.id}"`;
    cellsOfRect(item).forEach((cell) => {
      const ch = at(cell);
      if (!insideBounds(cell) || ch === '#' || ch === 'R') {
        errors.push(`${label} toca un muro, el reactor o sale del mapa: ${where(cell)}`);
      } else if (isTrap && ['1', '2', '3', '4'].includes(ch)) {
        errors.push(`${label} no puede cubrir un punto de inicio: ${where(cell)}`);
      }
    });
  });

  // Sin repetir el mismo mensaje por cada celda del mismo obstáculo.
  return [...new Set(errors)];
}

module.exports = { validateExtras, cellsOfRect };
