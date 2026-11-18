const { EventFactory } = require('../src/modules/events/eventFactory');
const { EventScheduler } = require('../src/modules/events/eventScheduler');
const { SpecialEvent } = require('../src/modules/events/specialEvent');

function eventType(type, extra = {}) {
  const Cls = class extends SpecialEvent {
    constructor(options) {
      super(options);
      this.log = [];
    }

    start() {
      Cls.calls.push(`start:${type}`);
    }

    update() {
      Cls.calls.push(`update:${type}`);
    }

    end() {
      Cls.calls.push(`end:${type}`);
    }

    modify(modifiers) {
      modifiers.pointMultiplier *= extra.multiplier || 1;
    }

    params() {
      return { tag: type };
    }
  };
  Cls.type = type;
  Cls.label = `Evento ${type}`;
  Cls.description = `Descripción ${type}`;
  Cls.accent = '#abcdef';
  Cls.calls = [];
  if (extra.canStart) Cls.canStart = extra.canStart;
  if (extra.weight) Cls.weight = extra.weight;

  return Cls;
}

function setup({ types, interval = 10, duration = 4, random = () => 0.5 } = {}) {
  const classes = types || [eventType('a'), eventType('b')];
  const factory = new EventFactory();
  classes.forEach((Cls) => factory.register(Cls));
  const engine = { elapsed: 0 };
  const scheduler = new EventScheduler({
    factory,
    intervalSeconds: interval,
    durationSeconds: duration,
    random,
  });

  // Avanza `seconds` en pasos de 0,5 s (el reloj del motor corre junto con el programador).
  const advance = (seconds) => {
    for (let t = 0; t < seconds - 1e-9; t += 0.5) {
      engine.elapsed += 0.5;
      scheduler.update(0.5, engine);
    }
  };

  return { scheduler, engine, advance, classes };
}

describe('EventScheduler', () => {
  it('espera entre 0,5 y 1,5 veces el intervalo antes del primer evento', () => {
    const early = setup({ random: () => 0 });
    const late = setup({ random: () => 0.999 });

    expect(early.scheduler.untilNext).toBe(5);
    expect(late.scheduler.untilNext).toBeCloseTo(14.99, 1);
  });

  it('no hay evento antes de tiempo y se anuncia al llegar el momento', () => {
    const { scheduler, advance } = setup(); // random 0.5 => 10 s

    advance(9.5);
    expect(scheduler.publicState()).toEqual([]);

    advance(0.5);
    const [event] = scheduler.publicState();
    expect(event).toMatchObject({
      type: expect.any(String),
      name: expect.stringContaining('Evento'),
      description: expect.stringContaining('Descripción'),
      accent: '#abcdef',
      duration: 4,
      remaining: 4,
    });
  });

  it('dura lo configurado, se revierte y vuelve a esperar', () => {
    const { scheduler, engine, advance, classes } = setup();

    advance(10);
    expect(scheduler.publicState()).toHaveLength(1);
    advance(2);
    expect(scheduler.publicState()[0].remaining).toBe(2);
    advance(2);

    expect(scheduler.publicState()).toEqual([]);
    const calls = classes.flatMap((Cls) => Cls.calls);
    expect(calls.filter((c) => c.startsWith('end:'))).toHaveLength(1);
    expect(scheduler.untilNext).toBe(10);
    expect(engine.elapsed).toBe(14);
  });

  it('nunca hay dos eventos a la vez y no repite el tipo dos veces seguidas', () => {
    const { scheduler, advance } = setup({ interval: 2, duration: 1, random: () => 0.5 });
    const seen = [];

    for (let i = 0; i < 40; i += 1) {
      advance(0.5);
      const active = scheduler.publicState();
      expect(active.length).toBeLessThanOrEqual(1);
      if (active[0] && seen[seen.length - 1] !== active[0].id) seen.push(active[0].id);
    }

    const types = scheduler.history().map((record) => record.type);
    expect(types.length).toBeGreaterThan(3);
    types.slice(1).forEach((type, i) => expect(type).not.toBe(types[i]));
  });

  it('aplica y revierte los modificadores de reglas', () => {
    const { scheduler, advance } = setup({
      types: [eventType('doble', { multiplier: 2 })],
    });

    expect(scheduler.modifiers()).toEqual({ pointMultiplier: 1 });
    advance(10);
    expect(scheduler.modifiers()).toEqual({ pointMultiplier: 2 });
    advance(4);
    expect(scheduler.modifiers()).toEqual({ pointMultiplier: 1 });
  });

  it('omite los tipos que no pueden empezar y reprograma si no queda ninguno', () => {
    const never = eventType('nunca', { canStart: () => false });
    const { scheduler, advance } = setup({ types: [never] });

    advance(10);
    expect(scheduler.publicState()).toEqual([]);
    expect(scheduler.history()).toEqual([]);
    expect(scheduler.untilNext).toBe(10);

    const mixed = setup({ types: [never, eventType('si')] });
    mixed.advance(10);
    expect(mixed.scheduler.publicState()[0].type).toBe('si');
  });

  it('elige según el peso de cada tipo', () => {
    const rare = eventType('raro', { weight: 1 });
    const common = eventType('comun', { weight: 9 });
    const { scheduler } = setup({ types: [rare, common], random: () => 0.05 });

    // 0,05 * 10 = 0,5 cae en el tramo del primero (peso 1); con 0,5 cae en el segundo.
    expect(scheduler.pickType({})).toBe('raro');
    scheduler.random = () => 0.5;
    expect(scheduler.pickType({})).toBe('comun');
  });

  it('guarda el historial con tiempos y parámetros, y lo cierra al terminar la partida', () => {
    const { scheduler, engine, advance } = setup();

    advance(10);
    advance(4);
    advance(10);
    advance(1); // segundo evento en curso
    scheduler.finish(engine);

    const history = scheduler.history();
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      id: 'event-1',
      startedAt: 10,
      endedAt: 14,
      durationSeconds: 4,
    });
    expect(history[0].params).toEqual({ tag: history[0].type });
    expect(history[1].startedAt).toBe(24);
    expect(history[1].endedAt).toBe(engine.elapsed);
    expect(scheduler.publicState()).toEqual([]);
  });
});
