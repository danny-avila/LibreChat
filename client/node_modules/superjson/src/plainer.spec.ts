import SuperJSON from '.';
import { walker } from './plainer';

test('walker', () => {
  expect(
    walker(
      {
        a: new Map([[NaN, null]]),
        b: /test/g,
      },
      new Map(),
      new SuperJSON(),
      false
    )
  ).toEqual({
    transformedValue: {
      a: [['NaN', null]],
      b: '/test/g',
    },
    annotations: {
      a: [
        'map',
        {
          '0.0': ['number'],
        },
      ],
      b: ['regexp'],
    },
  });
});
