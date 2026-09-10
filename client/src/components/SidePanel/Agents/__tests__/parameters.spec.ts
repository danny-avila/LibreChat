import { resolveAgentParameterSettings } from '../parameters';

/**
 * `web_search` is a default model parameter for the OpenAI, Anthropic and Google
 * column sets, so the builder offers its switch to every agent editor unless the
 * role grant is consulted here — the model-parameters twin of the Web Search
 * capability toggle.
 */
describe('resolveAgentParameterSettings — web_search role gating', () => {
  const resolve = (webSearchAllowed: boolean, provider = 'openAI', model = 'gpt-4o') =>
    resolveAgentParameterSettings({
      endpointsConfig: {},
      startupConfig: undefined,
      model,
      provider,
      webSearchAllowed,
    }).parameters.map((param) => param.key);

  it.each([
    ['openAI', 'gpt-4o'],
    ['anthropic', 'claude-3-5-sonnet'],
    ['google', 'gemini-1.5-pro'],
  ])('offers web_search on %s when the role grants it', (provider, model) => {
    expect(resolve(true, provider, model)).toContain('web_search');
  });

  it.each([
    ['openAI', 'gpt-4o'],
    ['anthropic', 'claude-3-5-sonnet'],
    ['google', 'gemini-1.5-pro'],
  ])('withholds web_search on %s when the role denies it', (provider, model) => {
    expect(resolve(false, provider, model)).not.toContain('web_search');
  });

  it('withholds only web_search, leaving the rest of the set intact', () => {
    const granted = resolve(true);
    const denied = resolve(false);
    expect(granted.length - denied.length).toBe(1);
    expect(denied).toEqual(granted.filter((key) => key !== 'web_search'));
  });
});
