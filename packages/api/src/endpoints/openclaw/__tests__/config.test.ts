import { openClawDefaults, openClawParamDefinitions } from '../config';

describe('openClawDefaults', () => {
  it('has expected default values', () => {
    expect(openClawDefaults).toEqual({
      thinkingLevel: 'medium',
      sessionMode: 'auto',
      enableSkills: true,
      model: 'agent:main',
    });
  });
});

describe('openClawParamDefinitions', () => {
  it('defines thinkingLevel with all 6 options', () => {
    const def = openClawParamDefinitions.find((d) => d.key === 'thinkingLevel');
    expect(def).toBeDefined();
    expect(def?.options).toEqual(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']);
    expect(def?.default).toBe('medium');
  });

  it('defines sessionMode with auto/manual/persistent', () => {
    const def = openClawParamDefinitions.find((d) => d.key === 'sessionMode');
    expect(def?.options).toEqual(['auto', 'manual', 'persistent']);
    expect(def?.default).toBe('auto');
  });

  it('defines enableSkills as boolean defaulting to true', () => {
    const def = openClawParamDefinitions.find((d) => d.key === 'enableSkills');
    expect(def?.type).toBe('boolean');
    expect(def?.default).toBe(true);
  });

  it('defines model defaulting to agent:main', () => {
    const def = openClawParamDefinitions.find((d) => d.key === 'model');
    expect(def?.default).toBe('agent:main');
  });
});
