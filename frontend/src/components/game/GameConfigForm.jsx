import { useState } from 'react';
import {
  END_MODE_LABELS,
  describeConfig,
  toConfigPayload,
  validateGameConfig,
} from '../../game/gameConfig';

const MODE_DESCRIPTIONS = {
  TIME: 'Gana quien tenga más puntos cuando se acabe el reloj.',
  POINTS: 'Gana el primero en llegar a los puntos objetivo.',
};

function NumberField({ id, label, hint, value, error, onChange, limits }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        type="number"
        inputMode="numeric"
        min={limits.min}
        max={limits.max}
        step="1"
        value={value}
        onChange={onChange}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
      />
      <p className="game-config-hint" id={`${id}-hint`}>
        {hint}
      </p>
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/*
 * Formulario de configuración del juego. Recibe `options` de GET /api/game/options
 * (límites y valores por defecto) para no duplicar reglas en el frontend.
 * `serverErrors` son los `fields` de un VALIDATION_ERROR del backend.
 */
export default function GameConfigForm({
  options,
  submitting = false,
  serverErrors = {},
  onSubmit,
}) {
  const { limits, defaults, endModes } = options;
  const [values, setValues] = useState({
    endMode: defaults.endMode,
    durationSeconds: String(defaults.durationSeconds),
    targetPoints: String(defaults.targetPoints),
    maxPlayers: String(defaults.maxPlayers),
  });
  const [localErrors, setLocalErrors] = useState({});

  const errors = { ...serverErrors, ...localErrors };

  function setValue(name, value) {
    setValues((previous) => ({ ...previous, [name]: value }));
    setLocalErrors((previous) => ({ ...previous, [name]: '' }));
  }

  function handleNumberChange(event) {
    setValue(event.target.name, event.target.value);
  }

  function handleSubmit(event) {
    event.preventDefault();

    const found = validateGameConfig(values, limits);
    if (Object.keys(found).length > 0) {
      setLocalErrors(found);
      return;
    }

    onSubmit(toConfigPayload(values));
  }

  const isValid = Object.keys(validateGameConfig(values, limits)).length === 0;
  const preview = isValid ? describeConfig(toConfigPayload(values)) : null;

  return (
    <form onSubmit={handleSubmit} noValidate>
      <fieldset className="mode-options">
        <legend>Modo de fin</legend>
        {endModes.map((mode) => (
          <label
            key={mode}
            className={`mode-option${
              values.endMode === mode ? ' mode-option-selected' : ''
            }`}
          >
            <span className="mode-option-title">
              <input
                type="radio"
                name="endMode"
                value={mode}
                checked={values.endMode === mode}
                onChange={() => setValue('endMode', mode)}
              />
              {END_MODE_LABELS[mode]}
            </span>
            <span className="mode-option-desc">{MODE_DESCRIPTIONS[mode]}</span>
          </label>
        ))}
        {errors.endMode && (
          <p className="field-error" role="alert">
            {errors.endMode}
          </p>
        )}
      </fieldset>

      {values.endMode === 'TIME' ? (
        <NumberField
          id="durationSeconds"
          label="Duración (segundos)"
          hint={`Entre ${limits.durationSeconds.min} y ${limits.durationSeconds.max} segundos`}
          value={values.durationSeconds}
          error={errors.durationSeconds}
          onChange={handleNumberChange}
          limits={limits.durationSeconds}
        />
      ) : (
        <NumberField
          id="targetPoints"
          label="Puntos objetivo"
          hint={`Entre ${limits.targetPoints.min} y ${limits.targetPoints.max} puntos`}
          value={values.targetPoints}
          error={errors.targetPoints}
          onChange={handleNumberChange}
          limits={limits.targetPoints}
        />
      )}

      <NumberField
        id="maxPlayers"
        label="Máximo de jugadores"
        hint={`Entre ${limits.maxPlayers.min} y ${limits.maxPlayers.max} jugadores`}
        value={values.maxPlayers}
        error={errors.maxPlayers}
        onChange={handleNumberChange}
        limits={limits.maxPlayers}
      />

      {preview && <p className="game-config-preview">{preview}</p>}

      <button type="submit" className="button" disabled={submitting}>
        {submitting ? 'Creando partida…' : 'Crear partida y entrar a la arena'}
      </button>
    </form>
  );
}
