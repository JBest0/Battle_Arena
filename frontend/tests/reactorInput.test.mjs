import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSerialLine, isButtonPress } from '../src/game/serialProtocol.js';
import { createActionId } from '../src/game/actionId.js';
import { reactorLegend } from '../src/game/hudModel.js';
import { toHud } from '../src/game/arenaState.js';

test('parseSerialLine lee "dx,dy" sin botón (protocolo anterior) y "dx,dy,b" con botón', () => {
  assert.deepEqual(parseSerialLine('1,-1\r'), { dx: 1, dy: -1, pressed: false });
  assert.deepEqual(parseSerialLine('0,0,1'), { dx: 0, dy: 0, pressed: true });
  assert.deepEqual(parseSerialLine(' -1,0,0 '), { dx: -1, dy: 0, pressed: false });
});

test('parseSerialLine descarta líneas inválidas', () => {
  for (const line of ['', 'hola', '2,0', '1,1,2', '1,1,1,1', '1;1', '1,1,']) {
    assert.equal(parseSerialLine(line), null, line);
  }
});

test('isButtonPress cuenta solo el paso de suelto a presionado', () => {
  assert.equal(isButtonPress(false, true), true);
  assert.equal(isButtonPress(true, true), false); // sigue presionado: no repite
  assert.equal(isButtonPress(true, false), false); // soltar no es una acción
  assert.equal(isButtonPress(false, false), false);
});

test('una pulsación sostenida durante varias líneas genera una sola acción', () => {
  const lines = ['0,0,0', '0,0,1', '0,0,1', '0,0,1', '0,0,0', '0,0,1'];
  let pressed = false;
  let actions = 0;
  for (const line of lines) {
    const parsed = parseSerialLine(line);
    if (isButtonPress(pressed, parsed.pressed)) actions += 1;
    pressed = parsed.pressed;
  }

  assert.equal(actions, 2);
});

test('createActionId nunca repite un identificador, aunque coincidan hora y azar', () => {
  const ids = new Set();
  for (let i = 0; i < 500; i += 1) ids.add(createActionId(() => 0.5, () => 1000));

  assert.equal(ids.size, 500);
  assert.ok([...ids].every((id) => id.length <= 64));
});

test('reactorLegend describe de dónde sale la energía y el estado actual', () => {
  assert.equal(reactorLegend(null), null);
  assert.equal(reactorLegend('available').live, 'Disponible');
  assert.equal(reactorLegend('recharging').live, 'Recargando');
  assert.equal(reactorLegend('disabled').live, 'Desactivado');
  assert.match(reactorLegend('available').hint, /botón de acción/);
});

test('toHud conserva el estado del reactor (o null si el escenario no tiene)', () => {
  const base = { status: 'RUNNING', players: [], winnerIds: [] };

  assert.equal(toHud({ ...base, reactor: { state: 'recharging', cooldown: 0.4 } }).reactor, 'recharging');
  assert.equal(toHud(base).reactor, null);
});
