import { parseToolTags } from '../toolTags';

describe('parseToolTags', () => {
  test('parses a single pending tool', () => {
    const segments = parseToolTags('<tool>save_file(file=a.py)</tool>');

    expect(segments).toEqual([
      {
        type: 'tool',
        call: 'save_file(file=a.py)',
        result: null,
        raw: 'save_file(file=a.py)',
      },
    ]);
  });

  test('parses a single completed tool with result', () => {
    const segments = parseToolTags('<tool>save_file(file=a.py)\nok</tool>');

    expect(segments).toEqual([
      {
        type: 'tool',
        call: 'save_file(file=a.py)',
        result: 'ok',
        raw: 'save_file(file=a.py)\nok',
      },
    ]);
  });

  test('parses a completed tool with empty result', () => {
    const segments = parseToolTags('<tool>save_file(file=a.py)\n</tool>');

    expect(segments).toEqual([
      {
        type: 'tool',
        call: 'save_file(file=a.py)',
        result: '',
        raw: 'save_file(file=a.py)\n',
      },
    ]);
  });

  test('preserves ordering for mixed text and tool content', () => {
    const segments = parseToolTags('Before <tool>save_file(file=a.py)\nok</tool> after');

    expect(segments).toEqual([
      { type: 'text', text: 'Before ' },
      {
        type: 'tool',
        call: 'save_file(file=a.py)',
        result: 'ok',
        raw: 'save_file(file=a.py)\nok',
      },
      { type: 'text', text: ' after' },
    ]);
  });

  test('parses tools inside a tool-group into separate tool segments', () => {
    const segments = parseToolTags(
      '<tool-group>\n<tool>save_file(file=a.py)\nok</tool>\n\n<tool>run_shell(cmd=pwd)\n/app</tool>\n</tool-group>',
    );

    expect(segments).toEqual([
      {
        type: 'tool',
        call: 'save_file(file=a.py)',
        result: 'ok',
        raw: 'save_file(file=a.py)\nok',
      },
      {
        type: 'tool',
        call: 'run_shell(cmd=pwd)',
        result: '/app',
        raw: 'run_shell(cmd=pwd)\n/app',
      },
    ]);
  });

  test('falls back to plain text for malformed unclosed tool tags', () => {
    const input = 'prefix <tool>save_file(file=a.py)';
    const segments = parseToolTags(input);

    expect(segments).toEqual([{ type: 'text', text: input }]);
  });

  test('decodes escaped tool payload content safely', () => {
    const segments = parseToolTags(
      '<tool>save_file(file=&quot;a&lt;b&gt;.py&quot;)\n&lt;ok &amp; done&gt;</tool>',
    );

    expect(segments).toEqual([
      {
        type: 'tool',
        call: 'save_file(file="a<b>.py")',
        result: '<ok & done>',
        raw: 'save_file(file=&quot;a&lt;b&gt;.py&quot;)\n&lt;ok &amp; done&gt;',
      },
    ]);
  });

  test('returns a single empty text segment for empty input', () => {
    expect(parseToolTags('')).toEqual([{ type: 'text', text: '' }]);
  });

  test('returns a single text segment for plain text with no tool tags', () => {
    const input = 'Just plain markdown text without any tool tags.';
    expect(parseToolTags(input)).toEqual([{ type: 'text', text: input }]);
  });

  test('preserves multiline tool result content', () => {
    const segments = parseToolTags(
      '<tool>run_shell(cmd=cat file.txt)\nline 1\nline 2\nline 3</tool>',
    );

    expect(segments).toEqual([
      {
        type: 'tool',
        call: 'run_shell(cmd=cat file.txt)',
        result: 'line 1\nline 2\nline 3',
        raw: 'run_shell(cmd=cat file.txt)\nline 1\nline 2\nline 3',
      },
    ]);
  });

  test('preserves text before and after a tool-group block', () => {
    const segments = parseToolTags(
      'Before group\n\n<tool-group>\n<tool>foo()\nbar</tool>\n</tool-group>\n\nAfter group',
    );

    expect(segments).toEqual([
      { type: 'text', text: 'Before group\n\n' },
      {
        type: 'tool',
        call: 'foo()',
        result: 'bar',
        raw: 'foo()\nbar',
      },
      { type: 'text', text: '\n\nAfter group' },
    ]);
  });

  test('treats unclosed tool-group as plain text', () => {
    const input = '<tool-group><tool>foo()\nbar</tool>';
    expect(parseToolTags(input)).toEqual([{ type: 'text', text: input }]);
  });

  test('decodes numeric HTML entities in call and result', () => {
    const segments = parseToolTags('<tool>save_file(msg=&#34;hi&#34;)\n&#x3c;ok&#x3e;</tool>');

    expect(segments).toEqual([
      {
        type: 'tool',
        call: 'save_file(msg="hi")',
        result: '<ok>',
        raw: 'save_file(msg=&#34;hi&#34;)\n&#x3c;ok&#x3e;',
      },
    ]);
  });

  test('preserves exact interleaving order of text and tool segments', () => {
    const segments = parseToolTags('A\n\n<tool>t1()\nr1</tool>\n\nB\n\n<tool>t2()\nr2</tool>\n\nC');

    expect(segments).toEqual([
      { type: 'text', text: 'A\n\n' },
      { type: 'tool', call: 't1()', result: 'r1', raw: 't1()\nr1' },
      { type: 'text', text: '\n\nB\n\n' },
      { type: 'tool', call: 't2()', result: 'r2', raw: 't2()\nr2' },
      { type: 'text', text: '\n\nC' },
    ]);
  });

  test('does not parse tool tags inside inline markdown code spans', () => {
    const input = 'Use `<tool>save_file(file=a.py)</tool>` as an example.';
    expect(parseToolTags(input)).toEqual([{ type: 'text', text: input }]);
  });

  test('does not parse tool tags inside fenced markdown code blocks', () => {
    const input = [
      '```xml',
      '<tool>save_file(file=a.py)',
      'ok</tool>',
      '```',
      '',
      'This is documentation text.',
    ].join('\n');

    expect(parseToolTags(input)).toEqual([{ type: 'text', text: input }]);
  });

  test('parses tool tags outside fenced code blocks while keeping fenced examples as text', () => {
    const input = [
      '```txt',
      '<tool>example_call()',
      'example_result</tool>',
      '```',
      '',
      '<tool>run_shell(cmd=pwd)',
      '/app</tool>',
    ].join('\n');

    expect(parseToolTags(input)).toEqual([
      {
        type: 'text',
        text: '```txt\n<tool>example_call()\nexample_result</tool>\n```\n\n',
      },
      {
        type: 'tool',
        call: 'run_shell(cmd=pwd)',
        result: '/app',
        raw: 'run_shell(cmd=pwd)\n/app',
      },
    ]);
  });
});
