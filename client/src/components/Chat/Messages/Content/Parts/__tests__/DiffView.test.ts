import { parseUnifiedDiff } from '../DiffView';

describe('parseUnifiedDiff', () => {
  it('drops file headers but keeps changed lines that begin with header markers', () => {
    const parsed = parseUnifiedDiff(
      [
        '--- a/example.txt',
        '+++ b/example.txt',
        '@@ -4,2 +4,2 @@',
        '--- deleted text',
        '+++ added text',
        ' unchanged',
      ].join('\n'),
    );

    expect(parsed).toEqual({
      additions: 1,
      deletions: 1,
      hasLineNumbers: true,
      lines: [
        { type: 'hunk', text: '@@ -4,2 +4,2 @@' },
        { type: 'del', text: '-- deleted text', oldLine: 4 },
        { type: 'add', text: '++ added text', newLine: 4 },
        { type: 'context', text: 'unchanged', oldLine: 5, newLine: 5 },
      ],
    });
  });

  it('keeps the same changed lines after an argless streaming hunk marker', () => {
    const parsed = parseUnifiedDiff(
      ['--- old_text', '+++ new_text', '@@', '--- deleted text', '+++ added text'].join('\n'),
    );

    expect(parsed.lines).toEqual([
      { type: 'hunk', text: '' },
      { type: 'del', text: '-- deleted text', oldLine: undefined },
      { type: 'add', text: '++ added text', newLine: undefined },
    ]);
    expect(parsed.additions).toBe(1);
    expect(parsed.deletions).toBe(1);
  });

  it('skips the separator pair before every batched edit', () => {
    const parsed = parseUnifiedDiff(
      [
        '--- old_text 1',
        '+++ new_text 1',
        '@@',
        '-first old',
        '+first new',
        '',
        '--- old_text 2',
        '+++ new_text 2',
        '@@',
        '-second old',
        '+second new',
      ].join('\n'),
    );

    /** The second edit's synthetic pair used to be counted as a real deletion
     *  and addition, inflating both statistics and rendering marker rows. */
    expect(parsed.deletions).toBe(2);
    expect(parsed.additions).toBe(2);
    expect(parsed.lines.some((line) => line.text.includes('old_text'))).toBe(false);
    expect(parsed.lines.some((line) => line.text.includes('new_text'))).toBe(false);
  });

  it('keeps changed lines that collide with the synthetic header names', () => {
    /** Deleting a real `-- old_text` comment (SQL, Lua) and adding
     *  `++ new_text` prefixes to exactly the synthetic marker text. Only the
     *  separator POSITION, an adjacent pair before a hunk header, separates
     *  the two, so this pair inside a hunk must survive as content. */
    const parsed = parseUnifiedDiff(['@@ -1,2 +1,2 @@', '--- old_text', '+++ new_text'].join('\n'));

    expect(parsed.deletions).toBe(1);
    expect(parsed.additions).toBe(1);
    expect(parsed.lines).toEqual([
      { type: 'hunk', text: '@@ -1,2 +1,2 @@' },
      { type: 'del', text: '-- old_text', oldLine: 1 },
      { type: 'add', text: '++ new_text', newLine: 1 },
    ]);
  });
});
