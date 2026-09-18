import { Providers } from '@librechat/agents';

import type { AgentInputs } from '@librechat/agents';

import { foldSubagentDynamicInstructionsForPromptCache } from './cache';

function makeInputs(overrides: Partial<AgentInputs> = {}): AgentInputs {
  return {
    provider: Providers.ANTHROPIC,
    instructions: 'You are a researcher.',
    additional_instructions: 'Conversation Date & Time: 2026-09-17',
    clientOptions: { promptCache: true },
    ...overrides,
  } as AgentInputs;
}

describe('foldSubagentDynamicInstructionsForPromptCache', () => {
  it('folds the dynamic tail so the SDK can place one body cache marker', () => {
    const original = makeInputs();
    const inputs = foldSubagentDynamicInstructionsForPromptCache(original);

    expect(inputs).not.toBe(original);
    expect(original.additional_instructions).toBe('Conversation Date & Time: 2026-09-17');
    expect(inputs.additional_instructions).toBeUndefined();
    expect(inputs.instructions).toBe(
      'You are a researcher.\nConversation Date & Time: 2026-09-17',
    );
  });

  it('leaves the parent-style split intact when promptCache is off', () => {
    const original = makeInputs({ clientOptions: { promptCache: false } });
    const inputs = foldSubagentDynamicInstructionsForPromptCache(original);

    expect(inputs).toBe(original);
    expect(inputs.instructions).toBe('You are a researcher.');
    expect(inputs.additional_instructions).toBe('Conversation Date & Time: 2026-09-17');
  });

  it('does not fold OpenAI inputs even when promptCache is set', () => {
    const inputs = foldSubagentDynamicInstructionsForPromptCache(
      makeInputs({ provider: Providers.OPENAI }),
    );

    expect(inputs.additional_instructions).toBe('Conversation Date & Time: 2026-09-17');
  });

  it('folds OpenRouter the same way as Anthropic', () => {
    const inputs = foldSubagentDynamicInstructionsForPromptCache(
      makeInputs({ provider: Providers.OPENROUTER }),
    );

    expect(inputs.additional_instructions).toBeUndefined();
    expect(inputs.instructions).toContain('Conversation Date & Time: 2026-09-17');
  });

  it('does not fold when only one instruction field is present', () => {
    const dynamicOnly = foldSubagentDynamicInstructionsForPromptCache(
      makeInputs({ instructions: '' }),
    );
    const stableOnly = foldSubagentDynamicInstructionsForPromptCache(
      makeInputs({ additional_instructions: undefined }),
    );

    expect(dynamicOnly.additional_instructions).toBe('Conversation Date & Time: 2026-09-17');
    expect(stableOnly.instructions).toBe('You are a researcher.');
    expect(stableOnly.additional_instructions).toBeUndefined();
  });
});
