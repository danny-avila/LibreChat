import {
  visionModels,
  nonVisionModels,
  validateVisionModel,
  resolveImageCapability,
  ImageCapabilitySource,
} from '../src/config';

describe('resolveImageCapability', () => {
  describe('heuristic matching (no explicit signal)', () => {
    it('flags a known vision model', () => {
      expect(resolveImageCapability({ model: 'gpt-4o' })).toEqual({
        capable: true,
        source: ImageCapabilitySource.heuristic,
      });
    });

    it('matches known models as substrings', () => {
      expect(resolveImageCapability({ model: 'openai/gpt-4o-2024-08-06' }).capable).toBe(true);
      expect(resolveImageCapability({ model: 'claude-opus-4-20250101' }).capable).toBe(true);
    });

    it('reports an unknown model as `none`, not a confident negative', () => {
      expect(resolveImageCapability({ model: 'some-proxy-model-xyz' })).toEqual({
        capable: false,
        source: ImageCapabilitySource.none,
      });
    });

    it('excludes known text-only look-alikes', () => {
      expect(resolveImageCapability({ model: 'gpt-4-turbo-preview' })).toEqual({
        capable: false,
        source: ImageCapabilitySource.excluded,
      });
      expect(resolveImageCapability({ model: 'o1-mini' })).toEqual({
        capable: false,
        source: ImageCapabilitySource.excluded,
      });
    });
  });

  describe('explicit declaration wins', () => {
    it('overrides a positive heuristic when declared false', () => {
      expect(resolveImageCapability({ model: 'gpt-4o', vision: false })).toEqual({
        capable: false,
        source: ImageCapabilitySource.declared,
      });
    });

    it('overrides the exclusion list when declared true', () => {
      expect(resolveImageCapability({ model: 'o1-mini', vision: true })).toEqual({
        capable: true,
        source: ImageCapabilitySource.declared,
      });
    });

    it('resolves an unknown model when declared true', () => {
      expect(resolveImageCapability({ model: 'my-custom-vlm', vision: true }).capable).toBe(true);
    });
  });

  describe('operator aliases (additionalModels)', () => {
    it('recognizes a renamed/proxy model via aliases', () => {
      expect(
        resolveImageCapability({
          model: 'Claude Opus - Premium',
          additionalModels: ['Premium'],
        }),
      ).toEqual({ capable: true, source: ImageCapabilitySource.heuristic });
    });
  });

  describe('endpoint-level default', () => {
    it('falls back to endpointCapable only when no per-model signal exists', () => {
      expect(resolveImageCapability({ model: 'unknown-x', endpointCapable: true })).toEqual({
        capable: true,
        source: ImageCapabilitySource.endpoint,
      });
    });

    it('does not override a heuristic match', () => {
      expect(resolveImageCapability({ model: 'gpt-4o', endpointCapable: false }).source).toBe(
        ImageCapabilitySource.heuristic,
      );
    });
  });

  describe('availableModels gate', () => {
    it('marks a model absent from availableModels as unavailable', () => {
      expect(resolveImageCapability({ model: 'gpt-4o', availableModels: ['gpt-3.5'] })).toEqual({
        capable: false,
        source: ImageCapabilitySource.unavailable,
      });
    });

    it('allows a model present in availableModels', () => {
      expect(resolveImageCapability({ model: 'gpt-4o', availableModels: ['gpt-4o'] }).capable).toBe(
        true,
      );
    });
  });

  it('returns `none` with no signals at all', () => {
    expect(resolveImageCapability({})).toEqual({
      capable: false,
      source: ImageCapabilitySource.none,
    });
  });
});

describe('validateVisionModel (backward compatibility)', () => {
  it('returns false for an empty model', () => {
    expect(validateVisionModel({ model: '' })).toBe(false);
  });

  it('matches every built-in vision model', () => {
    for (const model of visionModels) {
      expect(validateVisionModel({ model })).toBe(true);
    }
  });

  it('excludes the known text-only look-alikes', () => {
    for (const model of nonVisionModels) {
      expect(validateVisionModel({ model })).toBe(false);
    }
  });

  it('honors additionalModels', () => {
    expect(validateVisionModel({ model: 'my-vlm', additionalModels: ['my-vlm'] })).toBe(true);
  });

  it('gates on availableModels', () => {
    expect(validateVisionModel({ model: 'gpt-4o', availableModels: ['other'] })).toBe(false);
  });

  it('accepts an explicit vision declaration', () => {
    expect(validateVisionModel({ model: 'unknown', vision: true })).toBe(true);
    expect(validateVisionModel({ model: 'gpt-4o', vision: false })).toBe(false);
  });
});
