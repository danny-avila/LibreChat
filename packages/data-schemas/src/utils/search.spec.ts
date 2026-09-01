import { escapeMeiliFilterValue } from './search';

describe('escapeMeiliFilterValue', () => {
  it('escapes quotes and backslashes in filter values', () => {
    expect(escapeMeiliFilterValue('user123')).toBe('user123');
    expect(escapeMeiliFilterValue('user"123')).toBe('user\\"123');
    expect(escapeMeiliFilterValue('user\\123')).toBe('user\\\\123');
    expect(escapeMeiliFilterValue('user\\"123')).toBe('user\\\\\\"123');
  });
});
