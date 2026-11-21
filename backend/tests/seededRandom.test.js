const { seededRandom, deriveSeed } = require('../src/shared/seededRandom');

describe('seededRandom', () => {
  it('misma semilla, misma secuencia; otra semilla, otra', () => {
    const take = (seed) => {
      const random = seededRandom(seed);

      return Array.from({ length: 5 }, () => random());
    };

    expect(take(42)).toEqual(take(42));
    expect(take(42)).not.toEqual(take(43));
  });

  it('da números en [0, 1)', () => {
    const random = seededRandom(7);
    for (let i = 0; i < 1000; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('deriveSeed da una semilla distinta por texto y estable', () => {
    expect(deriveSeed(1, 'a')).toBe(deriveSeed(1, 'a'));
    expect(deriveSeed(1, 'a')).not.toBe(deriveSeed(1, 'b'));
    expect(deriveSeed(1, 'a')).not.toBe(deriveSeed(2, 'a'));
  });
});
