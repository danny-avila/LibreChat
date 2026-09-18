import { Providers } from '@librechat/agents';

import type { AgentInputs } from '@librechat/agents';

const PROMPT_CACHE_TAIL_PROVIDERS = new Set<string>([Providers.ANTHROPIC, Providers.OPENROUTER]);

function hasPromptCache(inputs: AgentInputs): boolean {
  return (inputs.clientOptions as { promptCache?: boolean } | undefined)?.promptCache === true;
}

/**
 * Isolated subagents start with a single human task at index 0. When both
 * stable and dynamic instructions are set, `@librechat/agents` moves the
 * dynamic tail to that index and skips `addTailCacheControl`, so the tool
 * loop is never marked (LibreChat#16044).
 *
 * Fold the dynamic tail into `instructions` so the SDK takes the empty-tail
 * path and can mark the growing transcript. Main-agent inputs are untouched.
 */
export function foldSubagentDynamicInstructionsForPromptCache(inputs: AgentInputs): AgentInputs {
  const stable = inputs.instructions?.trim();
  const dynamic = inputs.additional_instructions?.trim();
  if (!stable || !dynamic || !hasPromptCache(inputs)) {
    return inputs;
  }
  if (!PROMPT_CACHE_TAIL_PROVIDERS.has(inputs.provider as string)) {
    return inputs;
  }

  return {
    ...inputs,
    instructions: `${stable}\n${dynamic}`,
    additional_instructions: undefined,
  };
}
