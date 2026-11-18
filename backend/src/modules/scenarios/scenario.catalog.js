const fs = require('fs');
const path = require('path');
const { AppError } = require('../../shared/AppError');
const { SCENARIO_RANDOM } = require('../game/game.config');
const { createScenarioSchema } = require('./scenario.schema');
const { validateMap, compileScenario } = require('./scenario.map');

// Catálogo de escenarios cargados desde archivos. Es solo de lectura: para agregar uno
// se copia un .json a la carpeta de escenarios y se reinicia el servidor.
class ScenarioCatalog {
  /** @param {{definition: object, compiled: object}[]} entries */
  constructor(entries = []) {
    this.entries = [...entries].sort(
      (a, b) =>
        a.definition.order - b.definition.order ||
        a.definition.name.localeCompare(b.definition.name)
    );
  }

  get size() {
    return this.entries.length;
  }

  list() {
    return this.entries.map((entry) => entry.definition);
  }

  get(id) {
    return this.entries.find((entry) => entry.definition.id === id)?.definition;
  }

  getCompiled(id) {
    return this.entries.find((entry) => entry.definition.id === id)?.compiled;
  }

  defaultId() {
    return this.entries[0]?.definition.id ?? null;
  }

  randomId(random = Math.random) {
    if (this.entries.length === 0) return null;

    return this.entries[Math.floor(random() * this.entries.length)].definition.id;
  }

  /**
   * Convierte lo que pide el jugador en el id concreto que se guarda en la partida:
   * sin dato -> el escenario por defecto; "random" -> uno al azar; otro -> debe existir.
   */
  resolveId(requested, random = Math.random) {
    if (this.entries.length === 0) return null;
    if (requested === undefined || requested === null) return this.defaultId();
    if (requested === SCENARIO_RANDOM) return this.randomId(random);

    if (!this.get(requested)) {
      throw new AppError(400, 'SCENARIO_NOT_FOUND', 'El escenario no existe');
    }

    return requested;
  }
}

function describeIssues(err) {
  if (err.issues) {
    return err.issues
      .map((issue) => `${issue.path.join('.') || 'archivo'}: ${issue.message}`)
      .join('; ');
  }

  return err.message;
}

/**
 * Lee todos los .json de `dir`. Un archivo inválido se rechaza y se registra el error
 * sin afectar a los demás (también se rechaza un id repetido).
 */
function loadScenarioCatalog({ dir, arena, logger = console }) {
  const schema = createScenarioSchema({
    cols: Math.round(arena.width / arena.cellSize),
    rows: Math.round(arena.height / arena.cellSize),
  });
  const entries = [];
  let files = [];

  try {
    files = fs.readdirSync(dir).filter((file) => file.endsWith('.json')).sort();
  } catch (err) {
    logger.error(`No se pudo leer la carpeta de escenarios (${dir}): ${err.message}`);
  }

  files.forEach((file) => {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      const definition = schema.parse(raw);
      const problems = validateMap(definition.map);

      if (problems.length > 0) {
        throw new Error(problems.join('; '));
      }
      if (entries.some((entry) => entry.definition.id === definition.id)) {
        throw new Error(`El id "${definition.id}" ya existe en otro escenario`);
      }

      entries.push({ definition, compiled: compileScenario(definition, arena) });
    } catch (err) {
      logger.error(`Escenario inválido (${file}): ${describeIssues(err)}`);
    }
  });

  return new ScenarioCatalog(entries);
}

module.exports = { ScenarioCatalog, loadScenarioCatalog };
