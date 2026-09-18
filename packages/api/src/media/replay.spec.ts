import type { MessageContentComplex } from '@librechat/agents';
import { collapseAssistantReplayContent } from './replay';

describe('collapseAssistantReplayContent', () => {
  const image = (extra: Partial<MessageContentComplex> = {}): MessageContentComplex =>
    ({
      type: 'image_url',
      image_url: { url: 'https://example.test/chart.png' },
      ...extra,
    }) as MessageContentComplex;

  it('joins text parts with newlines and drops non-native parts', () => {
    expect(
      collapseAssistantReplayContent([
        { type: 'text', text: '  First' },
        image(),
        { type: 'text', text: 'Second  ' },
      ]),
    ).toBe('First\nSecond');
  });

  it('folds to an empty string when no text remains', () => {
    expect(collapseAssistantReplayContent([image()])).toBe('');
  });

  it('returns the same array, in order, when any part carries native media', () => {
    const parts: MessageContentComplex[] = [
      { type: 'text', text: 'Drawing.' },
      image({ native_media: { continuationRef: 'native:job-1:0' } }),
      { type: 'text', text: 'Done.' },
    ];
    expect(collapseAssistantReplayContent(parts)).toBe(parts);
  });
});
