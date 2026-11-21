import test from 'node:test';
import assert from 'node:assert/strict';
import { EffectsLayer, trackEffects } from '../src/game/effects.js';

const seeded = () => {
  let a = 7;

  return () => {
    a = (a * 1664525 + 1013904223) % 4294967296;

    return a / 4294967296;
  };
};
const palette = { riskZone: '#ff4d6d', cell: '#ffd166', trap: '#ff9f1c' };

test('burst crea partículas y respeta el tope', () => {
  const effects = new EffectsLayer({ random: seeded(), maxParticles: 20 });
  effects.burst(10, 10, '#fff', 12);
  assert.equal(effects.particles.length, 12);

  effects.burst(10, 10, '#fff', 50);
  assert.equal(effects.particles.length, 20);
});

test('las partículas y los textos desaparecen con el tiempo', () => {
  const effects = new EffectsLayer({ random: seeded() });
  effects.burst(0, 0, '#fff', 10);
  effects.float(5, 5, '+1', '#fff', 0.5);
  assert.equal(effects.size, 11);

  effects.update(0.3);
  assert.ok(effects.size > 0);
  effects.update(1);
  assert.equal(effects.size, 0);
});

test('el texto flotante sube mientras vive', () => {
  const effects = new EffectsLayer();
  effects.float(5, 50, '+3', '#fff', 1);
  effects.update(0.5);

  assert.ok(effects.floats[0].y < 50);
});

test('hay un tope de textos: el más viejo se descarta', () => {
  const effects = new EffectsLayer({ maxFloats: 3 });
  ['a', 'b', 'c', 'd'].forEach((text) => effects.float(0, 0, text, '#fff'));

  assert.deepEqual(effects.floats.map((f) => f.text), ['b', 'c', 'd']);
});

test('draw no falla y deja la opacidad en 1', () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (target, prop) => (typeof prop === 'string' && prop !== 'globalAlpha'
      ? (...args) => calls.push([prop, args])
      : target[prop]),
    set: (target, prop, value) => { target[prop] = value; return true; },
  });
  const effects = new EffectsLayer({ random: seeded() });
  effects.burst(0, 0, '#fff', 5);
  effects.float(0, 0, '+1', '#fff');
  effects.draw(ctx);

  assert.equal(ctx.globalAlpha, 1);
  assert.ok(calls.some(([name]) => name === 'fillText'));
});

test('trackEffects lanza efectos cuando sube el puntaje y cuando alguien se ralentiza', () => {
  const effects = new EffectsLayer({ random: seeded() });
  const previous = new Map();
  const options = { currentUserId: 'a', palette, accent: null };
  const state = (a, b) => ({
    players: [
      { id: 'a', x: 10, y: 10, score: a.score, slow: a.slow, risk: a.risk ?? 1 },
      { id: 'b', x: 90, y: 90, score: b.score, slow: b.slow, risk: 1 },
    ],
  });

  // primera lectura: solo se anota, no hay efectos
  trackEffects(effects, previous, state({ score: 0, slow: 0 }, { score: 0, slow: 0 }), options);
  assert.equal(effects.size, 0);

  // Ana suma 3 puntos dentro de un sector de riesgo
  trackEffects(effects, previous, state({ score: 3, slow: 0, risk: 3 }, { score: 0, slow: 0 }), options);
  assert.deepEqual(effects.floats.map((f) => [f.text, f.color]), [['+3', '#ff4d6d']]);

  // Beto se ralentiza (sin texto) y Ana también (con "¡Frenado!")
  trackEffects(effects, previous, state({ score: 3, slow: 2, risk: 1 }, { score: 0, slow: 2 }), options);
  assert.deepEqual(effects.floats.map((f) => f.text), ['+3', '¡Frenado!']);

  // sin cambios no se agrega nada
  const before = effects.size;
  trackEffects(effects, previous, state({ score: 3, slow: 2 }, { score: 0, slow: 2 }), options);
  assert.equal(effects.size, before);
});

test('el color de los puntos usa el del evento activo cuando no hay sector', () => {
  const effects = new EffectsLayer({ random: seeded() });
  const previous = new Map([['a', { score: 0, slow: 0 }]]);
  trackEffects(
    effects,
    previous,
    { players: [{ id: 'a', x: 0, y: 0, score: 2, slow: 0, risk: 1 }] },
    { currentUserId: 'a', palette, accent: '#4cc9f0' }
  );

  assert.equal(effects.floats[0].color, '#4cc9f0');
});
