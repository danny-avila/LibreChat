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
});
