import { configSchema, normalizeBamlEndpoint } from '../src/config';
import { EModelEndpoint, Providers } from '../src/schemas';

/**
 * Behavior 1.1 — the public loader accepts only the BAML cross-field grammar.
 *
 * Everything here goes through `configSchema.strict()`, the same call
 * `loadCustomConfig` makes, because that is the only boundary where the rules
 * exist: `endpoints.custom` is `endpointSchema.partial()`, so a rule declared on
 * the endpoint schema would be erased for exactly this config shape.
 */

const validBaml = {
  name: 'Team-BAML',
  provider: Providers.BAML,
  models: {
    default: ['OpenRouter', 'OpenRouterFast'],
    fetch: false,
  },
  tokenConfig: {
    OpenRouter: { context: 131072, prompt: 0.03, completion: 0.17 },
  },
};

const parse = (custom: unknown[]) =>
  configSchema.strict().safeParse({ version: '1.3.0', endpoints: { custom } });

/** Paths are reported relative to `endpoints.custom`, so the table below reads `<index>.<field>`. */
const issuePaths = (result: ReturnType<typeof parse>) =>
  result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join('.').replace('endpoints.custom.', ''));

describe('BAML custom-endpoint grammar', () => {
  it('accepts a credential-free BAML endpoint', () => {
    const result = parse([validBaml]);
    expect(result.success).toBe(true);
  });

  it('accepts the endpoint with no tokenConfig at all', () => {
    const { tokenConfig: _tokenConfig, ...withoutTokens } = validBaml;
    expect(parse([withoutTokens]).success).toBe(true);
  });

  it.each([
    ['omitted', undefined],
    ['custom', EModelEndpoint.custom],
    ['baml', Providers.BAML],
  ])('accepts defaultParamsEndpoint %s', (_label, defaultParamsEndpoint) => {
    const customParams = defaultParamsEndpoint === undefined ? {} : { defaultParamsEndpoint };
    expect(parse([{ ...validBaml, customParams }]).success).toBe(true);
  });

  it('publishes all three accepted default-params spellings as baml', () => {
    for (const defaultParamsEndpoint of [undefined, EModelEndpoint.custom, Providers.BAML]) {
      const endpoint = normalizeBamlEndpoint({
        ...validBaml,
        ...(defaultParamsEndpoint === undefined ? {} : { customParams: { defaultParamsEndpoint } }),
      } as Record<string, unknown>);
      expect((endpoint.customParams as { defaultParamsEndpoint: string }).defaultParamsEndpoint).toBe(
        Providers.BAML,
      );
    }
  });

  it('leaves a non-BAML endpoint untouched when normalizing', () => {
    const openAiLike = { name: 'Proxy', customParams: { defaultParamsEndpoint: 'custom' } };
    expect(normalizeBamlEndpoint({ ...openAiLike })).toEqual(openAiLike);
  });

  it.each([
    ['an empty models.default', { models: { default: [] } }, '0.models.default'],
    ['a missing models block', { models: undefined }, '0.models.default'],
    ['models.fetch true', { models: { default: ['OpenRouter'], fetch: true } }, '0.models.fetch'],
    [
      'models.userIdQuery',
      { models: { default: ['OpenRouter'], userIdQuery: true } },
      '0.models.userIdQuery',
    ],
    ['an apiKey', { apiKey: 'sk-test' }, '0.apiKey'],
    ['a user-provided apiKey', { apiKey: 'user_provided' }, '0.apiKey'],
    ['a baseURL', { baseURL: 'https://openrouter.ai/api/v1' }, '0.baseURL'],
    ['a user-provided baseURL', { baseURL: 'user_provided' }, '0.baseURL'],
    ['headers', { headers: { 'x-team': 'a' } }, '0.headers'],
    ['directEndpoint', { directEndpoint: true }, '0.directEndpoint'],
    ['addParams', { addParams: { temperature: 0.2 } }, '0.addParams'],
    ['dropParams', { dropParams: ['temperature'] }, '0.dropParams'],
    [
      'a foreign defaultParamsEndpoint',
      { customParams: { defaultParamsEndpoint: EModelEndpoint.anthropic } },
      '0.customParams.defaultParamsEndpoint',
    ],
    [
      'reasoning custom params',
      { customParams: { reasoningKey: 'reasoning_content' } },
      '0.customParams.reasoningKey',
    ],
    [
      'a non-empty paramDefinitions',
      {
        customParams: {
          paramDefinitions: [
            { key: 'temperature', type: 'number', component: 'slider', optionType: 'model' },
          ],
        },
      },
      '0.customParams.paramDefinitions',
    ],
  ])('rejects %s', (_label, override, path) => {
    const result = parse([{ ...validBaml, ...override }]);
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain(path);
  });

  it('rejects an empty name', () => {
    const result = parse([{ ...validBaml, name: '   ' }]);
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain('0.name');
  });

  it('reports the failing endpoint index, not just the first entry', () => {
    const result = parse([validBaml, { ...validBaml, name: 'Second', apiKey: 'sk-oops' }]);
    expect(issuePaths(result)).toContain('1.apiKey');
  });

  it('leaves existing custom providers on the partial schema', () => {
    const openAiLike = { name: 'Proxy', apiKey: 'sk-x', baseURL: 'https://x/v1' };
    const anthropicLike = {
      name: 'Gateway',
      provider: EModelEndpoint.anthropic,
      apiKey: 'sk-y',
      baseURL: 'https://y',
      models: { default: ['claude-opus-4-5'] },
    };
    expect(parse([openAiLike, anthropicLike, validBaml]).success).toBe(true);
  });
});
