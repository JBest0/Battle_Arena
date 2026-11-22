const { EventFactory, createDefaultEventFactory } = require('../src/modules/events/eventFactory');
const { SpecialEvent } = require('../src/modules/events/specialEvent');

class FakeEvent extends SpecialEvent {}
FakeEvent.type = 'fake';
FakeEvent.label = 'Falso';

describe('EventFactory', () => {
  it('trae registrados los cinco tipos del juego', () => {
    const factory = createDefaultEventFactory();

    expect(factory.types().sort()).toEqual(
      [
        'alternate-route',
        'blackout',
        'energy-rain',
        'guardian-invasion',
        'reactor-overload',
      ].sort()
    );
  });

  it('crea un evento del tipo pedido con su duración y su generador aleatorio', () => {
    const factory = new EventFactory().register(FakeEvent);
    const random = () => 0.1;
    const event = factory.create('fake', { durationSeconds: 7, random });

    expect(event).toBeInstanceOf(FakeEvent);
    expect(event.durationSeconds).toBe(7);
    expect(event.random).toBe(random);
  });

  it('permite registrar un tipo nuevo sin tocar la fábrica', () => {
    const factory = createDefaultEventFactory();
    factory.register(FakeEvent);

    expect(factory.has('fake')).toBe(true);
    expect(factory.types()).toHaveLength(6);
  });

  it('rechaza un tipo repetido, uno sin `type` propio y uno desconocido', () => {
    const factory = new EventFactory().register(FakeEvent);

    expect(() => factory.register(FakeEvent)).toThrow(/Ya existe/);
    expect(() => factory.register(SpecialEvent)).toThrow(/type/);
    expect(() => factory.register(class Anonimo {})).toThrow(/type/);
    expect(() => factory.create('no-existe', {})).toThrow(/desconocido/);
    expect(() => factory.canStart('no-existe', {})).toThrow(/desconocido/);
  });

  it('consulta si un tipo puede empezar en esa partida', () => {
    class OnlyWithScenario extends SpecialEvent {
      static canStart(engine) {
        return Boolean(engine.scenario);
      }
    }
    OnlyWithScenario.type = 'solo-escenario';
    const factory = new EventFactory().register(OnlyWithScenario).register(FakeEvent);

    expect(factory.canStart('solo-escenario', { scenario: null })).toBe(false);
    expect(factory.canStart('solo-escenario', { scenario: {} })).toBe(true);
    expect(factory.canStart('fake', {})).toBe(true);
  });

  it('usa peso 1 si el tipo no declara uno válido', () => {
    class Heavy extends SpecialEvent {}
    Heavy.type = 'pesado';
    Heavy.weight = 4;
    class Broken extends SpecialEvent {}
    Broken.type = 'roto';
    Broken.weight = -3;
    const factory = new EventFactory().register(Heavy).register(Broken);

    expect(factory.weight('pesado')).toBe(4);
    expect(factory.weight('roto')).toBe(1);
  });
});
