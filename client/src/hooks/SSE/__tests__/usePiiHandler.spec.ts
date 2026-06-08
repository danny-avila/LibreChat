import type { PiiPatternMatch } from '~/hooks/SSE/piiLabels';
import { formatPiiLabels } from '~/hooks/SSE/piiLabels';

describe('formatPiiLabels', () => {
  it('returns empty string when matches is undefined', () => {
    expect(formatPiiLabels(undefined)).toBe('');
  });

  it('returns empty string when matches is empty', () => {
    expect(formatPiiLabels([])).toBe('');
  });

  it('joins multiple distinct pattern labels with a comma', () => {
    const matches: PiiPatternMatch[] = [
      { patternId: 'a', patternLabel: 'Anthropic API key', count: 1 },
      { patternId: 'b', patternLabel: 'GitHub token', count: 2 },
    ];
    expect(formatPiiLabels(matches)).toBe('Anthropic API key, GitHub token');
  });

  it('dedupes pattern labels by display name', () => {
    const matches: PiiPatternMatch[] = [
      { patternId: 'a', patternLabel: 'Anthropic API key', count: 1 },
      { patternId: 'b', patternLabel: 'Anthropic API key', count: 1 },
      { patternId: 'c', patternLabel: 'GitHub token', count: 1 },
    ];
    expect(formatPiiLabels(matches)).toBe('Anthropic API key, GitHub token');
  });

  it('skips entries without a usable label', () => {
    const matches = [
      { patternId: 'a', patternLabel: '', count: 1 },
      { patternId: 'b', patternLabel: '   ', count: 1 },
      { patternId: 'c', patternLabel: 'GitHub token', count: 1 },
    ] as PiiPatternMatch[];
    expect(formatPiiLabels(matches)).toBe('GitHub token');
  });
});
