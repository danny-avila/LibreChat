import { CHILD_PRELUDE } from './nativeProcess';

/**
 * The counter runs inside the child, where the payload is measured before it crosses
 * IPC. `JSON.stringify` is the ground truth it has to match: building that string to
 * measure it is exactly the allocation the cap exists to refuse, so the count is done in
 * one pass instead, and this pins the two together.
 */
const measure: (text: string) => number = new Function(
  `${CHILD_PRELUDE}; return __serializedBytes;`,
)();

const serialized = (text: string): number => Buffer.byteLength(JSON.stringify(text), 'utf8');

describe('child payload measurement', () => {
  it.each([
    ['plain ascii', 'Quarterly Report'],
    ['an empty string', ''],
    ['quotes and backslashes', 'he said "hi" \\ there'],
    ['newlines and tabs', 'a\nb\tc\r\n'],
    ['other control characters', 'a\u0001b\u001fc'],
    ['two-byte scalars', 'caf\u00e9 r\u00e9sum\u00e9 na\u00efve'],
    ['three-byte scalars', '\u65e5\u672c\u8a9e\u306e\u30c6\u30ad\u30b9\u30c8'],
    ['emoji, which are surrogate pairs', '\ud83d\ude42\ud83d\ude80 done'],
    ['a lone high surrogate', 'a\ud800b'],
    ['a lone low surrogate', 'a\udc00b'],
    ['a high surrogate at the end', 'ab\ud800'],
  ])('matches JSON serialization for %s', (_label, text) => {
    expect(measure(text)).toBe(serialized(text));
  });
});
