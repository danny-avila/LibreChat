/**
 * @fileoverview Model-spec ↔ user-toggle reconciliation for ephemeral agents.
 *
 * A model spec's tool flags (`webSearch`, `executeCode`, `mcpServers`, …) are
 * DEFAULTS the chat badge row is seeded from, not mandatory additions: once
 * the client sends an explicit toggle for a capability, that toggle decides.
 * Specs that must equip a tool unconditionally suppress the badge row
 * (`hideBadgeRow`), leaving the seeded spec values as the only ones sent.
 *
 * Shared by both ephemeral loaders — `loadEphemeralAgent` (primary) and
 * `loadAddedAgent` (multi-convo) — so the two resolve identically.
 *
 * @module packages/api/src/agents/toggles
 */

import { Tools, SPEC_TOOL_TOGGLES, resolveSpecToolFlag } from 'librechat-data-provider';
import type { TEphemeralAgent, TModelSpec } from 'librechat-data-provider';
import { ASK_USER_QUESTION_TOOL_NAME } from '~/agents/hitl/askUserQuestionTool';

/** Tool id equipped for each spec-configurable capability. */
const TOOL_NAMES: Record<string, string> = {
  web_search: Tools.web_search,
  file_search: Tools.file_search,
  execute_code: Tools.execute_code,
  memory: Tools.memory,
  ask_user_question: ASK_USER_QUESTION_TOOL_NAME,
};

export type EphemeralToolSource = Pick<
  TEphemeralAgent,
  'web_search' | 'file_search' | 'execute_code' | 'memory' | 'ask_user_question'
>;

export type SpecToolSource = Pick<
  TModelSpec,
  'webSearch' | 'fileSearch' | 'executeCode' | 'memory' | 'askUserQuestion'
>;

/**
 * Resolves the tool ids an ephemeral agent is equipped with, taking the model
 * spec as the default for each capability and the request's explicit toggle as
 * the decision. Downstream gating (admin capabilities, `createRun`'s HITL and
 * subagent filters) still applies to every id returned here.
 */
export function resolveEphemeralTools(
  ephemeralAgent: EphemeralToolSource | null | undefined,
  modelSpec: SpecToolSource | null | undefined,
): string[] {
  const tools: string[] = [];
  for (const [toggleKey, specKey] of SPEC_TOOL_TOGGLES) {
    if (resolveSpecToolFlag(ephemeralAgent?.[toggleKey], modelSpec?.[specKey])) {
      tools.push(TOOL_NAMES[toggleKey]);
    }
  }
  return tools;
}
