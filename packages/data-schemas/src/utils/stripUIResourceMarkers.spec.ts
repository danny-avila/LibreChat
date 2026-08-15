import { Constants, ContentTypes } from 'librechat-data-provider';
import { sanitizeUIResourceContent, stripUIResourceMarkers } from './stripUIResourceMarkers';

describe('stripUIResourceMarkers', () => {
  it('removes markers from renderable text while preserving non-text Markdown nodes', () => {
    const markdown = [
      'Before \\ui{rendered} after',
      '`\\ui{inline}`',
      '```text',
      '\\ui{fenced}',
      '```',
      '<div>\\ui{html}</div>',
      '$$\\ui{inline-math}$$',
      '$$',
      '\\ui{display-math}',
      '$$',
    ].join('\n');

    expect(stripUIResourceMarkers(markdown)).toBe(markdown.replace('\\ui{rendered}', ''));
  });

  it('preserves markers inside inline and display math nodes', () => {
    const markdown = ['$$\\ui{inline-math}$$', '', '$$', '\\ui{display-math}', '$$'].join('\n');
    expect(stripUIResourceMarkers(markdown)).toBe(markdown);
    expect(stripUIResourceMarkers('$\\ui{rendered}$')).toBe('$$');
  });

  it('preserves directive attributes that the renderer does not visit as text', () => {
    const markdown = '::artifact{title="\\ui{example}"}';
    expect(stripUIResourceMarkers(markdown)).toBe(markdown);
  });

  it('removes markers after Markdown escapes and character references are decoded', () => {
    const markdown = [
      'Encoded &#92;ui{backslash}',
      'Encoded \\ui&#123;braces&#125;',
      'Escaped \\ui\\{braces\\}',
    ].join('\n');

    expect(stripUIResourceMarkers(markdown)).toBe(['Encoded ', 'Encoded ', 'Escaped '].join('\n'));
  });

  it('handles paragraph continuations and container code according to CommonMark', () => {
    const markdown = [
      'intro',
      '    \\ui{paragraph}',
      '',
      '    \\ui{indented-code}',
      '> ```',
      '> \\ui{quote-code}',
      'outside \\ui{outside}',
    ].join('\n');

    expect(stripUIResourceMarkers(markdown)).toBe(
      markdown.replace('\\ui{paragraph}', '').replace('\\ui{outside}', ''),
    );
  });

  it('maps markers across CRLF paragraph continuations', () => {
    const markdown = 'intro\r\n    \\ui{paragraph}\r\nnext \\ui{next}';
    expect(stripUIResourceMarkers(markdown)).toBe('intro\r\n    \r\nnext ');
  });

  it('maps markers across blockquote paragraph prefixes', () => {
    const markdown = '> intro\n> \\ui{paragraph}\n>\n>     \\ui{code}';
    expect(stripUIResourceMarkers(markdown)).toBe(markdown.replace('\\ui{paragraph}', ''));
  });

  it('handles escaped blockquote content and CommonMark replacement characters', () => {
    expect(stripUIResourceMarkers('> intro\n> \\> \\ui{paragraph}')).toBe('> intro\n> \\> ');
    expect(stripUIResourceMarkers('prefix\0 \\ui{paragraph}')).toBe('prefix\0 ');
  });

  it('handles long literal text without per-character source-span objects', () => {
    const markdown = `\\not-a-marker ${'a'.repeat(100_000)} & plain text`;
    expect(stripUIResourceMarkers(markdown)).toBe(markdown);
  });

  it('walks deeply nested Markdown without recursive traversal', () => {
    const prefix = '> '.repeat(500);
    expect(stripUIResourceMarkers(`${prefix}\\ui{deep}`)).toBe(prefix);
  });

  it('recursively sanitizes TextData and subagent content while preserving annotations', () => {
    const content = [
      {
        type: 'tool_call',
        tool_call: {
          subagent_content: [
            {
              type: ContentTypes.TEXT,
              text: {
                value: 'Before \\ui{nested} after',
                annotations: [{ type: 'citation' }],
              },
            },
          ],
        },
      },
    ];

    expect(sanitizeUIResourceContent(content)).toEqual([
      {
        type: 'tool_call',
        tool_call: {
          subagent_content: [
            {
              type: ContentTypes.TEXT,
              text: { value: 'Before  after', annotations: [{ type: 'citation' }] },
            },
          ],
        },
      },
    ]);
  });

  it('preserves top-level user text while sanitizing assistant-rendered subagent fields', () => {
    const content = [
      { type: ContentTypes.TEXT, text: 'User example \\ui{literal}' },
      {
        type: ContentTypes.TOOL_CALL,
        tool_call: {
          name: Constants.SUBAGENT,
          output: 'Legacy \\ui{legacy} output',
          subagent_content: [
            { type: ContentTypes.TEXT, text: 'Nested \\ui{nested} content' },
            {
              type: ContentTypes.TOOL_CALL,
              tool_call: {
                name: Constants.SUBAGENT,
                output: 'Deep \\ui{deep} output',
              },
            },
          ],
        },
      },
    ];

    expect(sanitizeUIResourceContent(content, false)).toEqual([
      { type: ContentTypes.TEXT, text: 'User example \\ui{literal}' },
      {
        type: ContentTypes.TOOL_CALL,
        tool_call: {
          name: Constants.SUBAGENT,
          output: 'Legacy  output',
          subagent_content: [
            { type: ContentTypes.TEXT, text: 'Nested  content' },
            {
              type: ContentTypes.TOOL_CALL,
              tool_call: { name: Constants.SUBAGENT, output: 'Deep  output' },
            },
          ],
        },
      },
    ]);
  });
});
