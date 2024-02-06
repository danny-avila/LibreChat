import {
  arrayIsEqual,
  degree,
  getRandom,
  padEnd,
  padStart,
} from '../src/util/util';

describe('#padStart', () => {
  it('should works.', () => {
    expect(padStart('abc', 5, '0')).toEqual('00abc');
    expect(padStart('abcdef', 4, '0')).toEqual('abcdef');
    expect(padStart('abc', 10, '123')).toEqual('1231231abc');
  });
});

describe('#padEnd', () => {
  it('should works.', () => {
    expect(padEnd('abc', 5, '0')).toEqual('abc00');
    expect(padEnd('abcdef', 4, '0')).toEqual('abcdef');
    expect(padEnd('abc', 10, '123')).toEqual('abc1231231');
  });
});

describe('#getRandom', () => {
  it('works.', () => {
    for (let i = 0; i < 10; i++) {
      const num = getRandom(0, 255, 2);
      expect(num).toBeGreaterThanOrEqual(0);
      expect(num).toBeLessThanOrEqual(255);
    }
  });

  it('0-360', () => {
    for (let i = 0; i < 10; i++) {
      const num = getRandom(0, 360);
      expect(num).toBeGreaterThanOrEqual(0);
      expect(num).toBeLessThanOrEqual(360);
    }
  });
});

describe('#degree', () => {
  it('converts minus to plus degree.', () => {
    const d = degree(-45);
    expect(d).toEqual(315);
  });
});

describe('#arrayIsEqual', () => {
  it('works.', () => {
    expect(arrayIsEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(arrayIsEqual([1, 2, 3], [2, 2, 3])).toBe(false);
    expect(arrayIsEqual([1, [2, 3], 4], [1, [2, 3], 4])).toBe(true);
  });
});
