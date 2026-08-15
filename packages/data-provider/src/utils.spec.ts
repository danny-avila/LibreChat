import { stripUIResourceMarkers, stripUIResourceMarkersFromTextPart } from './utils';

describe('stripUIResourceMarkers', () => {
  it('removes renderable markers while preserving Markdown code examples', () => {
    const markdown = [
      'Before \\ui{rendered} after',
      '`\\ui{inline}`',
      '> ```',
      '> \\ui{blockquote}',
      '> ```',
      '- ~~~html',
      '  \\ui{list-item}',
      '  ~~~',
      '    \\ui{indented}',
    ].join('\n');

    expect(stripUIResourceMarkers(markdown)).toBe(markdown.replace('\\ui{rendered}', ''));
  });

  it('ends an unclosed container-nested fence with its container', () => {
    const markdown = ['> ```', '> \\ui{example}', 'outside \\ui{rendered}'].join('\n');
    expect(stripUIResourceMarkers(markdown)).toBe(
      ['> ```', '> \\ui{example}', 'outside '].join('\n'),
    );
  });

  it('inherits list context for fences opened on continuation lines', () => {
    const markdown = ['- item', '  ~~~', '  \\ui{example}', 'outside \\ui{rendered}'].join('\n');
    expect(stripUIResourceMarkers(markdown)).toBe(
      ['- item', '  ~~~', '  \\ui{example}', 'outside '].join('\n'),
    );
  });

  it('handles long marker-free prose without changing it', () => {
    const text = 'a'.repeat(1_000_000);
    expect(stripUIResourceMarkers(text)).toBe(text);
  });

  it('sanitizes TextData values without dropping annotations', () => {
    const part = {
      type: 'text',
      text: { value: 'Before \\ui{resource} after', annotations: [{ type: 'citation' }] },
    };
    expect(stripUIResourceMarkersFromTextPart(part)).toEqual({
      type: 'text',
      text: { value: 'Before  after', annotations: [{ type: 'citation' }] },
    });
  });
});
