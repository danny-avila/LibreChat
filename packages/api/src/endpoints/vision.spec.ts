import { ImageCapabilitySource } from 'librechat-data-provider';
import { getImageCapability, shouldStripImages } from './vision';

describe('getImageCapability', () => {
  it('uses the built-in heuristic when no config is present', () => {
    expect(getImageCapability({ model: 'gpt-4o' }).capable).toBe(true);
    expect(getImageCapability({ model: 'unknown-model' })).toEqual({
      capable: false,
      source: ImageCapabilitySource.none,
    });
  });

  it('lets a modelSpec.vision declaration override the heuristic', () => {
    expect(getImageCapability({ model: 'gpt-4o', modelSpec: { vision: false } })).toEqual({
      capable: false,
      source: ImageCapabilitySource.declared,
    });
    expect(getImageCapability({ model: 'text-only-x', modelSpec: { vision: true } }).capable).toBe(
      true,
    );
  });

  it('prefers a caller vision override over the modelSpec', () => {
    expect(
      getImageCapability({ model: 'gpt-4o', vision: true, modelSpec: { vision: false } }).capable,
    ).toBe(true);
  });

  it('recognizes proxy/renamed models via endpoint visionModels', () => {
    expect(
      getImageCapability({
        model: 'Claude Opus - Premium',
        endpointConfig: { visionModels: ['Premium'] },
      }),
    ).toEqual({ capable: true, source: ImageCapabilitySource.heuristic });
  });
});

describe('shouldStripImages', () => {
  it('strips on a confident negative', () => {
    expect(shouldStripImages({ capable: false, source: ImageCapabilitySource.declared })).toBe(
      true,
    );
    expect(shouldStripImages({ capable: false, source: ImageCapabilitySource.excluded })).toBe(
      true,
    );
    expect(shouldStripImages({ capable: false, source: ImageCapabilitySource.unavailable })).toBe(
      true,
    );
    expect(shouldStripImages({ capable: false, source: ImageCapabilitySource.endpoint })).toBe(
      true,
    );
  });

  it('stays permissive when there is no signal', () => {
    expect(shouldStripImages({ capable: false, source: ImageCapabilitySource.none })).toBe(false);
  });

  it('never strips when capable', () => {
    expect(shouldStripImages({ capable: true, source: ImageCapabilitySource.heuristic })).toBe(
      false,
    );
  });
});
