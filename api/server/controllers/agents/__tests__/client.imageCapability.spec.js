const AgentClient = require('../client');

/**
 * Exercises the real backend plumbing (getCustomEndpointConfig + modelSpec
 * lookup + getImageCapability) via a minimal `self`, so config resolution is
 * covered without standing up a full run.
 */
const resolve = (self) => {
  self._imageCapability = undefined;
  return AgentClient.prototype.resolveModelImageCapability.call(self);
};

const makeSelf = ({ model, endpoint = 'openAI', spec, config = {} }) => ({
  model,
  options: {
    endpoint,
    agent: { endpoint },
    spec,
    req: { config },
  },
});

describe('AgentClient.resolveModelImageCapability', () => {
  it('uses the built-in heuristic for a known vision model', () => {
    const result = resolve(makeSelf({ model: 'gpt-4o' }));
    expect(result).toEqual({ capable: true, source: 'heuristic' });
  });

  it('reports an unknown model as `none` (stays permissive)', () => {
    const result = resolve(makeSelf({ model: 'some-proxy-model' }));
    expect(result).toEqual({ capable: false, source: 'none' });
  });

  it('honors an explicit modelSpec.vision: false declaration', () => {
    const result = resolve(
      makeSelf({
        model: 'gpt-4o',
        spec: 'text-only-spec',
        config: { modelSpecs: { list: [{ name: 'text-only-spec', vision: false }] } },
      }),
    );
    expect(result).toEqual({ capable: false, source: 'declared' });
  });

  it('recognizes proxy models via a custom endpoint visionModels list', () => {
    const result = resolve(
      makeSelf({
        model: 'premium-model',
        endpoint: 'LiteLLM',
        config: { endpoints: { custom: [{ name: 'LiteLLM', visionModels: ['premium'] }] } },
      }),
    );
    expect(result).toEqual({ capable: true, source: 'heuristic' });
  });

  it('caches the resolution on the instance', () => {
    const self = makeSelf({ model: 'gpt-4o' });
    const first = AgentClient.prototype.resolveModelImageCapability.call(self);
    const second = AgentClient.prototype.resolveModelImageCapability.call(self);
    expect(second).toBe(first);
  });
});
