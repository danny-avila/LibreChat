import { stripUIResourceMarkers } from './utils';

describe('stripUIResourceMarkers', () => {
  it('removes renderable markers while preserving Markdown code examples', () => {
    const markdown = [
      'Before \\ui{rendered} after',
      '`\\ui{inline}`',
      '``Use ` around \\ui{double}``',
      '```text',
      '\\ui{fenced}',
      '````',
      '    \\ui{indented}',
    ].join('\n');

    expect(stripUIResourceMarkers(markdown)).toBe(
      [
        'Before  after',
        '`\\ui{inline}`',
        '``Use ` around \\ui{double}``',
        '```text',
        '\\ui{fenced}',
        '````',
        '    \\ui{indented}',
      ].join('\n'),
    );
  });

  it('removes multiple resource ids and leaves malformed markers unchanged', () => {
    expect(stripUIResourceMarkers('\\ui{one,two} \\ui{not-valid!}')).toBe(' \\ui{not-valid!}');
  });
});
