import { pruneAgentModelParameters, resolveAgentParameterSettings } from '../parameters';

/**
 * `web_search` is a default model parameter for the OpenAI, Anthropic and Google
 * column sets, so the builder offers its switch to every agent editor unless the
 * role grant is consulted here — the model-parameters twin of the Web Search
 * capability toggle.
 */
describe('resolveAgentParameterSettings — web_search role gating', () => {
  const settings = (webSearchAllowed: boolean, provider = 'openAI', model = 'gpt-4o') =>
    resolveAgentParameterSettings({
      endpointsConfig: {},
      startupConfig: undefined,
      model,
      provider,
      webSearchAllowed,
    });

  const resolve = (webSearchAllowed: boolean, provider = 'openAI', model = 'gpt-4o') =>
    settings(webSearchAllowed, provider, model).visibleParameters.map((param) => param.key);

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

/**
 * A parameter the role may not see is still part of the endpoint schema. Pruning
 * has to keep recognising it, or a user without the permission opening someone
 * else's agent silently drops that agent's configuration on the next save.
 */
describe('resolveAgentParameterSettings — denied parameters survive pruning', () => {
  const resolved = (webSearchAllowed: boolean) =>
    resolveAgentParameterSettings({
      endpointsConfig: {},
      startupConfig: undefined,
      model: 'gpt-4o',
      provider: 'openAI',
      webSearchAllowed,
    });

  it('keeps web_search in the full parameter set even when the role denies it', () => {
    const keys = resolved(false).parameters.map((param) => param.key);
    expect(keys).toContain('web_search');
  });

  it("preserves a stored web_search value through a denied editor's save", () => {
    const denied = resolved(false);
    const stored = { model: 'gpt-4o', web_search: true, temperature: 0.5 };
    expect(pruneAgentModelParameters(stored, denied)).toEqual(stored);
  });

  it('still prunes a parameter the schema genuinely does not define', () => {
    const denied = resolved(false);
    const stored = { model: 'gpt-4o', not_a_real_param: true } as never;
    expect(pruneAgentModelParameters(stored, denied)).not.toHaveProperty('not_a_real_param');
  });
});
