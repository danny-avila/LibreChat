import { getConversationDisplayTitle } from '../utils';

describe('getConversationDisplayTitle', () => {
  it.each([undefined, null, '', '   '])('uses New Chat when the title is empty', (title) => {
    expect(getConversationDisplayTitle(title)).toBe('New Chat');
  });

  it('preserves a generated title', () => {
    expect(getConversationDisplayTitle('  Governance rollout plan  ')).toBe(
      'Governance rollout plan',
    );
  });
});
