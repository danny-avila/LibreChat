import { ContentTypes } from 'librechat-data-provider';
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
});
