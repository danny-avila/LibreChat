import { describe, expect, it } from 'vitest';

import { CODE_POINTER, IMAGE_POINTER, SpeechFilter, TABLE_POINTER } from './speech.js';

const run = (chunks: string[]): string => {
  const filter = new SpeechFilter();
  return chunks.map((chunk) => filter.push(chunk)).join('') + filter.flush();
};

describe('SpeechFilter', () => {
  it('speaks plain prose unchanged', () => {
    expect(run(['Hello there.']).trim()).toBe('Hello there.');
  });

  it('replaces a code block with a pointer instead of reading it aloud', () => {
    const spoken = run(['Here you go:\n```js\nconst x = 1;\n```\nThat works.']);

    expect(spoken).toContain('Here you go:');
    expect(spoken).toContain(CODE_POINTER);
    expect(spoken).toContain('That works.');
    expect(spoken).not.toContain('const x = 1;');
  });

  it('handles a fence split across deltas, which is the normal case', () => {
    const spoken = run(['Try this:\n``', '`py\nprint(1)\n', '```\nDone.']);

    expect(spoken).toContain(CODE_POINTER);
    expect(spoken).not.toContain('print(1)');
    expect(spoken).toContain('Done.');
  });

  it('announces code once, not per block', () => {
    const spoken = run(['A\n```\nx\n```\nB\n```\ny\n```\nC']);

    expect(spoken.match(new RegExp(CODE_POINTER, 'g'))).toHaveLength(1);
    expect(spoken).toContain('A');
    expect(spoken).toContain('C');
  });

  it('does not read a markdown table row by row', () => {
    const spoken = run(['Results:\n| a | b |\n| --- | --- |\n| 1 | 2 |\nThat is all.']);

    expect(spoken).toContain(TABLE_POINTER);
    expect(spoken.match(new RegExp(TABLE_POINTER, 'g'))).toHaveLength(1);
    expect(spoken).not.toContain('| 1 | 2 |');
    expect(spoken).toContain('That is all.');
  });

  it('points at images rather than speaking their url', () => {
    const spoken = run(['Look: ![a chart](https://example.com/c.png) nice']);

    expect(spoken).toContain(IMAGE_POINTER);
    expect(spoken).not.toContain('example.com');
  });

  it('speaks link text without the url', () => {
    const spoken = run(['See [the docs](https://example.com/docs) for more']);

    expect(spoken).toContain('the docs');
    expect(spoken).not.toContain('example.com');
  });

  it('strips markdown emphasis that would otherwise be spoken as punctuation', () => {
    expect(run(['**bold** and _italic_ and `code`']).trim()).toBe('bold and italic and code');
  });

  it('flushes a reply with no trailing newline', () => {
    const filter = new SpeechFilter();
    expect(filter.push('No newline here')).toBe('');
    expect(filter.flush().trim()).toBe('No newline here');
  });

  it('never leaks fenced content when the stream ends inside a fence', () => {
    const spoken = run(['Here:\n```\nsecret_code_line\n']);

    expect(spoken).not.toContain('secret_code_line');
  });
});

describe('SpeechFilter.sourceOffsetFor (barge-in mapping)', () => {
  it('maps a full listen back to the whole source', () => {
    const filter = new SpeechFilter();
    const source = 'One line.\nTwo line.\n';
    const spoken = filter.push(source);

    expect(filter.sourceOffsetFor(spoken.length)).toBe(source.length);
  });

  it('maps a partial listen back to the last fully spoken line', () => {
    const filter = new SpeechFilter();
    filter.push('One line.\nTwo line.\n');

    // Heard only the first line's worth of speech.
    expect(filter.sourceOffsetFor('One line.\n'.length)).toBe('One line.\n'.length);
  });

  it('rounds down rather than persisting unheard words', () => {
    const filter = new SpeechFilter();
    filter.push('One line.\nTwo line.\n');

    // Cut mid-way through the second line: only the first line is safe to keep.
    expect(filter.sourceOffsetFor('One line.\nTwo li'.length)).toBe('One line.\n'.length);
  });

  it('returns 0 when nothing was heard', () => {
    const filter = new SpeechFilter();
    filter.push('One line.\nTwo line.\n');

    expect(filter.sourceOffsetFor(0)).toBe(0);
  });

  it('accounts for markdown that was rewritten before speaking', () => {
    const filter = new SpeechFilter();
    const source = '**Bold** intro.\nSecond line.\n';
    const spoken = filter.push(source);

    // The spoken form is shorter than the source, so a naive prefix cut would be wrong.
    expect(spoken.length).toBeLessThan(source.length);
    expect(filter.sourceOffsetFor(spoken.length)).toBe(source.length);
  });

  it('does not credit source consumed by a skipped code block', () => {
    const filter = new SpeechFilter();
    const source = 'Intro line.\n```\ncode();\n```\n';
    const spoken = filter.push(source);

    expect(filter.sourceOffsetFor(spoken.length)).toBe(source.length);
    expect(filter.sourceOffsetFor(0)).toBe(0);
  });
});
