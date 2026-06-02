import {
  ASSISTANT_DISPLAY_NAME,
  containsProviderBrand,
  getAssistantDisplayName,
  getPublicModelName,
  isProviderModelId,
} from '../branding';

describe('branding', () => {
  it('detects provider brand strings', () => {
    expect(containsProviderBrand('Claude Sonnet 4.6')).toBe(true);
    expect(containsProviderBrand('OpenAI GPT-4')).toBe(true);
    expect(containsProviderBrand('Support Agent')).toBe(false);
  });

  it('returns neutral assistant name for provider labels', () => {
    expect(getAssistantDisplayName('Claude Sonnet 4.6')).toBe(ASSISTANT_DISPLAY_NAME);
    expect(getAssistantDisplayName('Support Agent')).toBe('Support Agent');
  });

  it('hides provider model ids from display', () => {
    expect(isProviderModelId('claude-sonnet-4-6')).toBe(true);
    expect(getPublicModelName('claude-sonnet-4-6')).toBeUndefined();
  });
});
