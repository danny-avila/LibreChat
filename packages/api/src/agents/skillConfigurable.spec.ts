import { enrichWithSkillConfigurable } from './skillConfigurable';

describe('enrichWithSkillConfigurable', () => {
  const req = { user: { id: 'user-1' } };
  const accessibleSkillIds = ['skill-a', 'skill-b'];

  it('augments configurable with req, accessibleSkillIds, and codeEnvAvailable', () => {
    const result = enrichWithSkillConfigurable(
      { loadedTools: [], configurable: { other: 'value' } },
      req,
      accessibleSkillIds,
      true,
    );

    expect(result.configurable).toEqual({
      other: 'value',
      req,
      codeEnvAvailable: true,
      accessibleSkillIds,
      skillPrimedIdsByName: undefined,
    });
  });

  it('propagates codeEnvAvailable=false verbatim (not coerced)', () => {
    const result = enrichWithSkillConfigurable(
      { loadedTools: [], configurable: {} },
      req,
      accessibleSkillIds,
      false,
    );

    expect(result.configurable.codeEnvAvailable).toBe(false);
  });

  it('does not inject a codeApiKey key (per-user lookup removed)', () => {
    const result = enrichWithSkillConfigurable(
      { loadedTools: [], configurable: {} },
      req,
      accessibleSkillIds,
      true,
    );

    expect(result.configurable).not.toHaveProperty('codeApiKey');
  });

  it('threads skillPrimedIdsByName through unchanged', () => {
    const primed = { 'brand-guidelines': 'abc123' };
    const result = enrichWithSkillConfigurable(
      { loadedTools: [], configurable: {} },
      req,
      accessibleSkillIds,
      true,
      primed,
    );

    expect(result.configurable.skillPrimedIdsByName).toBe(primed);
  });

  it('preserves loadedTools unchanged', () => {
    const tools = [{ name: 'x' }];
    const result = enrichWithSkillConfigurable(
      { loadedTools: tools, configurable: undefined },
      req,
      accessibleSkillIds,
      false,
    );

    expect(result.loadedTools).toBe(tools);
  });
});
