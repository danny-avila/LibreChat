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
    ].join('\n');

    expect(stripUIResourceMarkers(markdown)).toBe(markdown.replace('\\ui{rendered}', ''));
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
