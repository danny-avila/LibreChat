import { decodeStoredKey, encodeStoredKey, decodeStoredKeys, encodeStoredKeys } from './encoding';

const NUL = String.fromCharCode(0);

describe('config key encoding', () => {
  it.each([
    ['gpt-4.1', 'gpt-4%2E1'],
    ['$set', '%24set'],
    ['price$', 'price%24'],
    ['%', '%25'],
    ['%2E', '%252E'],
    ['%25', '%2525'],
    ['a.b$c%d', 'a%2Eb%24c%25d'],
    [`nul${NUL}key`, 'nul%00key'],
    ['模型.名称', '模型%2E名称'],
    ['plain', 'plain'],
  ])('encodes %j as %j and back', (key, encoded) => {
    expect(encodeStoredKey(key)).toBe(encoded);
    expect(decodeStoredKey(encoded)).toBe(key);
  });

  it('never emits a dot, a dollar sign or NUL', () => {
    const keys = ['.', '..', '$', '$$.$', `${NUL}.$%`];

    for (const key of keys) {
      expect(encodeStoredKey(key)).not.toMatch(/[.$]/);
      expect(encodeStoredKey(key)).not.toContain(NUL);
      expect(decodeStoredKey(encodeStoredKey(key))).toBe(key);
    }
  });

  it('decodes keys without escape sequences unchanged, including unknown `%` sequences', () => {
    for (const key of ['plain', 'gpt-4.1', '100%', '%2e', '%41', '%']) {
      expect(decodeStoredKey(key)).toBe(key);
    }
  });

  it('encodes keys at every depth, inside arrays, and never values', () => {
    const value = {
      'a.b': [{ $c: 'd.e', list: ['$x', { 'f.g': null }] }],
      nested: { deeper: { 'h.i': '%2E' } },
    };

    const encoded = encodeStoredKeys(value);

    expect(encoded).toEqual({
      'a%2Eb': [{ '%24c': 'd.e', list: ['$x', { 'f%2Eg': null }] }],
      nested: { deeper: { 'h%2Ei': '%2E' } },
    });
    expect(decodeStoredKeys(encoded)).toEqual(value);
  });

  it('returns untouched containers as they are and follows JSON for undefined', () => {
    const plain = { a: { b: [1, { c: 2 }] } };

    expect(encodeStoredKeys(plain)).toBe(plain);
    expect(encodeStoredKeys({ a: undefined, b: [undefined, 1] })).toEqual({ b: [null, 1] });
  });

  it('leaves non-plain objects such as dates alone', () => {
    const date = new Date(0);

    expect(encodeStoredKeys({ 'a.b': date })).toEqual({ 'a%2Eb': date });
  });
});
