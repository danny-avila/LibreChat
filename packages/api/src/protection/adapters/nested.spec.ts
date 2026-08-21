import { visitNestedStrings } from './nested';

describe('visitNestedStrings', () => {
  it.each([Number.NaN, -1])(
    'fails closed for an invalid array length %s without dispatching its iterator',
    (invalidLength) => {
      let iteratorReads = 0;
      const value = new Proxy(['PRIVATE-NESTED'], {
        get(target, property, receiver) {
          if (property === 'length') {
            return invalidLength;
          }
          if (property === Symbol.iterator) {
            iteratorReads++;
            throw new Error('nested iterator must not run');
          }
          return Reflect.get(target, property, receiver);
        },
      });
      const onString = jest.fn();

      expect(visitNestedStrings(value, '/value', onString)).toBe(false);
      expect(onString).not.toHaveBeenCalled();
      expect(iteratorReads).toBe(0);
    },
  );

  it('captures an array length once before bounded numeric traversal', () => {
    let lengthReads = 0;
    const value = new Proxy(['retained'], {
      get(target, property, receiver) {
        if (property === 'length') {
          lengthReads++;
          return lengthReads === 1 ? 1 : Number.NaN;
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const values: string[] = [];

    expect(visitNestedStrings(value, '/value', (text) => values.push(text))).toBe(true);
    expect(values).toEqual(['retained']);
    expect(lengthReads).toBe(1);
  });
});
