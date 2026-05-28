import { formatDate } from '../formatDate';

describe('formatDate', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date(2024, 5, 15) });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('empty cases', () => {
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });

  it('formats a current-year date without the year', () => {
    expect(formatDate(new Date(2024, 2, 5))).toBe('March 5');
  });

  it('formats a past-year date with the year', () => {
    expect(formatDate(new Date(2023, 10, 20))).toBe('November 20, 2023');
  });

  it('accepts a date string', () => {
    expect(formatDate('2024-03-05T12:00:00')).toBe('March 5');
  });
});
