import { chipsFitInline, formatElapsed } from '../Bar';

/**
 * The two pure decisions behind the bar's layout: whether the chips share the
 * button row, and how long a recording has been running.
 */

const chip = (key: string) => ({ key });

describe('chipsFitInline', () => {
  const widths = { a: 40, b: 60, c: 100 };

  it('keeps an empty row inline, whatever the room', () => {
    expect(chipsFitInline([], widths, 0)).toBe(true);
    expect(chipsFitInline([], widths, 500)).toBe(true);
  });

  it('gives chips a row of their own once there is no room at all', () => {
    expect(chipsFitInline([chip('a')], widths, 0)).toBe(false);
    expect(chipsFitInline([chip('a')], widths, -10)).toBe(false);
  });

  /* On the first pass nothing has been measured, and guessing would move the
     chips twice: once on the guess and again on the measurement. */
  it('keeps everything inline until anything has been measured', () => {
    expect(chipsFitInline([chip('a'), chip('b')], {}, 10)).toBe(true);
  });

  /* Once the measured ones already overflow, the answer is known without the
     rest: the row cannot hold them whatever the unmeasured chip turns out to be. */
  it('wraps as soon as the measured chips alone do not fit', () => {
    expect(chipsFitInline([chip('c'), chip('unmeasured')], widths, 50)).toBe(false);
  });

  it('counts the gap between chips, not just the chips', () => {
    /* 40 + 60 alone would fit exactly; the gap between them is what does not. */
    expect(chipsFitInline([chip('a'), chip('b')], widths, 100)).toBe(false);
    expect(chipsFitInline([chip('a'), chip('b')], widths, 108)).toBe(true);
  });

  it('takes a row that fills the space exactly', () => {
    expect(chipsFitInline([chip('c')], widths, 100)).toBe(true);
    expect(chipsFitInline([chip('c')], widths, 99)).toBe(false);
  });
});

describe('formatElapsed', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [59, '0:59'],
    [60, '1:00'],
    [61, '1:01'],
    [600, '10:00'],
    [3599, '59:59'],
  ])('reads %i seconds as %s', (seconds, expected) => {
    expect(formatElapsed(seconds)).toBe(expected);
  });
});
