import { describe, it, expect } from '@jest/globals';
import { isValidCronExpression } from '../cron';

describe('isValidCronExpression', () => {
  it.each([
    '* * * * *',
    '0 * * * *',
    '*/5 * * * *',
    '0 9 * * 1-5',
    '0,15,30,45 9 * * *',
    '0 9 1 jan,jul mon',
    '15 14 1 * *',
    '0 0 1 1 *',
    '0 9-17/2 * * *',
  ])('accepts valid expression %s', (expr) => {
    expect(isValidCronExpression(expr)).toBe(true);
  });

  it.each([
    ['empty string', ''],
    ['too few fields', '0 * * *'],
    ['too many fields', '0 * * * * *'],
    ['stray punctuation', '0; * * * *'],
    ['negative step', '*/-5 * * * *'],
    ['unfinished list', '0, * * * *'],
    ['non-string input', null as unknown as string],
    ['object input', {} as unknown as string],
  ])('rejects %s', (_label, expr) => {
    expect(isValidCronExpression(expr)).toBe(false);
  });

  it('rejects whitespace-only input', () => {
    expect(isValidCronExpression('   ')).toBe(false);
  });
});
