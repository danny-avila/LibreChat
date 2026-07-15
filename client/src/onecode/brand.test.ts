import { ONECODE_AGENT_CAPABILITIES, ONECODE_BRAND, ONECODE_STARTER_PROMPTS } from './brand';

describe('OneCode brand constants', () => {
  it('uses OneCode as the primary product brand', () => {
    expect(ONECODE_BRAND.productName).toBe('OneCode');
    expect(ONECODE_BRAND.endpointName).toBe('OneCode');
    expect(ONECODE_BRAND.defaultModel).toBe('onecode-agent');
  });

  it('contains the phase 1 agent capabilities', () => {
    expect(ONECODE_AGENT_CAPABILITIES.map((item) => item.id)).toEqual([
      'inspect',
      'plan',
      'write',
      'patch',
      'verify',
    ]);
  });

  it('starter prompts are concise OneCode tasks', () => {
    expect(ONECODE_STARTER_PROMPTS).toHaveLength(4);
    expect(ONECODE_STARTER_PROMPTS[0]).toContain('Inspect');
    expect(ONECODE_STARTER_PROMPTS.every((prompt) => prompt.length <= 42)).toBe(true);
  });
});
