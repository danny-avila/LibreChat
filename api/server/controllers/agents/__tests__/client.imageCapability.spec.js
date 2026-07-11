const AgentClient = require('../client');
const { formatMessage } = require('@librechat/agents');

const { stripImageContentParts } = AgentClient;

/**
 * Exercises the real backend plumbing (getCustomEndpointConfig + modelSpec
 * lookup + getImageCapability) via a minimal `self`, so config resolution is
 * covered without standing up a full run.
 */
const resolve = (self) => {
  self._imageCapability = undefined;
  return self.resolveModelImageCapability();
};

const makeSelf = ({ model, endpoint = 'openAI', spec, config = {} }) =>
  Object.assign(Object.create(AgentClient.prototype), {
    model,
    options: {
      endpoint,
      agent: { endpoint, model_parameters: { model } },
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

describe('AgentClient.shouldStripImagesForRun (mixed-model runs)', () => {
  const agent = (model, endpoint = 'openAI') => ({ endpoint, model_parameters: { model } });

  const runSelf = ({ primary, added = [], config = {} }) =>
    Object.assign(Object.create(AgentClient.prototype), {
      model: primary.model_parameters.model,
      agentConfigs: new Map(added.map((a, i) => [`added-${i}`, a])),
      options: { endpoint: 'openAI', agent: primary, spec: undefined, req: { config } },
    });

  const strip = (self) => self.shouldStripImagesForRun();

  it('does not strip when the only agent is vision-capable', () => {
    expect(strip(runSelf({ primary: agent('gpt-4o') }))).toBe(false);
  });

  it('does not strip when the primary is an unknown (permissive) model', () => {
    expect(strip(runSelf({ primary: agent('some-proxy-model') }))).toBe(false);
  });

  it('strips when the primary model is confidently non-vision', () => {
    expect(strip(runSelf({ primary: agent('o1-mini') }))).toBe(true);
  });

  it('strips when a vision-capable primary has a text-only added agent', () => {
    expect(strip(runSelf({ primary: agent('gpt-4o'), added: [agent('o1-mini')] }))).toBe(true);
  });

  it('does not strip when every run agent is vision-capable', () => {
    expect(strip(runSelf({ primary: agent('gpt-4o'), added: [agent('claude-opus-4-x')] }))).toBe(
      false,
    );
  });
});

describe('stripImageContentParts (real formatMessage payloads)', () => {
  it('removes uploaded images routed through image_urls, keeping text', () => {
    const formatted = formatMessage({
      message: {
        role: 'user',
        text: 'hello',
        image_urls: [{ type: 'image_url', image_url: { url: 'data:x' } }],
      },
    });
    stripImageContentParts(formatted);
    expect(formatted.content).toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('removes image blocks already embedded in content (e.g. tool artifacts)', () => {
    const formatted = formatMessage({
      message: {
        role: 'user',
        content: [
          { type: 'text', text: 'see' },
          { type: 'image_url', image_url: { url: 'x' } },
        ],
      },
    });
    stripImageContentParts(formatted);
    expect(formatted.content).toEqual([{ type: 'text', text: 'see' }]);
  });

  it('removes image_file parts (image-generation tool results)', () => {
    const formatted = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'here is your image' },
        { type: 'image_file', image_file: { file_id: 'abc' } },
      ],
    };
    stripImageContentParts(formatted);
    expect(formatted.content).toEqual([{ type: 'text', text: 'here is your image' }]);
  });

  it('leaves plain string content untouched', () => {
    const formatted = formatMessage({ message: { role: 'user', text: 'just text' } });
    stripImageContentParts(formatted);
    expect(formatted.content).toBe('just text');
  });

  it('does not produce an empty-array content for an image-only message', () => {
    const formatted = formatMessage({
      message: { role: 'user', image_urls: [{ type: 'image_url', image_url: { url: 'x' } }] },
    });
    stripImageContentParts(formatted);
    expect(formatted.content).not.toHaveLength(0);
    expect(JSON.stringify(formatted.content)).not.toContain('image_url');
  });
});
