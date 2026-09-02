import {
  isAgentFadingTier,
  isAgentFadingTierEntries,
  isAgentFadingTierEntry,
  MAX_AGENT_FADING_TIER_AGENT_ID_LENGTH,
} from './fading';

const tier = { v: 1, budgetTokens: 20_000, masked: true };

describe('isAgentFadingTier', () => {
  it('accepts the compact shape and rejects anything else', () => {
    expect(isAgentFadingTier(tier)).toBe(true);
    expect(isAgentFadingTier({ ...tier, v: 2 })).toBe(false);
    expect(isAgentFadingTier({ ...tier, budgetTokens: 0 })).toBe(false);
    expect(isAgentFadingTier({ ...tier, masked: 'yes' })).toBe(false);
    expect(isAgentFadingTier(null)).toBe(false);
  });
});

describe('isAgentFadingTierEntry', () => {
  it('requires a bounded, non-empty agent ID on a valid tier', () => {
    expect(isAgentFadingTierEntry({ agentId: 'agent-a', ...tier })).toBe(true);
    expect(isAgentFadingTierEntry({ agentId: '', ...tier })).toBe(false);
    expect(
      isAgentFadingTierEntry({
        agentId: 'a'.repeat(MAX_AGENT_FADING_TIER_AGENT_ID_LENGTH + 1),
        ...tier,
      }),
    ).toBe(false);
    expect(isAgentFadingTierEntry({ agentId: 'agent-a', ...tier, budgetTokens: -1 })).toBe(false);
    expect(isAgentFadingTierEntry(tier)).toBe(false);
  });
});

describe('isAgentFadingTierEntries', () => {
  it('accepts unique valid entries and rejects duplicates or malformed members', () => {
    expect(
      isAgentFadingTierEntries([
        { agentId: 'agent-a', ...tier },
        { agentId: 'agent-b', ...tier, masked: false },
      ]),
    ).toBe(true);
    expect(isAgentFadingTierEntries([])).toBe(true);
    expect(
      isAgentFadingTierEntries([
        { agentId: 'agent-a', ...tier },
        { agentId: 'agent-a', ...tier },
      ]),
    ).toBe(false);
    expect(isAgentFadingTierEntries([{ agentId: 'agent-a', ...tier }, tier])).toBe(false);
    expect(isAgentFadingTierEntries({ 'agent-a': tier })).toBe(false);
  });
});
