import { setDeep } from './accessDeep';

describe('setDeep', () => {
  it('correctly sets values in maps', () => {
    const obj = {
      a: new Map([[new Set(['NaN']), [[1, 'undefined']]]]),
    };

    setDeep(obj, ['a', 0, 0, 0], Number);
    setDeep(obj, ['a', 0, 1], entries => new Map(entries));
    setDeep(obj, ['a', 0, 1, 0, 1], () => undefined);

    expect(obj).toEqual({
      a: new Map([[new Set([NaN]), new Map([[1, undefined]])]]),
    });
  });

  it('correctly sets values in sets', () => {
    const obj = {
      a: new Set([10, new Set(['NaN'])]),
    };

    setDeep(obj, ['a', 1, 0], Number);

    expect(obj).toEqual({
      a: new Set([10, new Set([NaN])]),
    });
  });
});
