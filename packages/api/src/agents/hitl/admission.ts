import type { TToolApprovalPolicy } from 'librechat-data-provider';
import type { PluginHookSource } from '~/agents/hooks/source';
import type { MCPToolAlias } from '~/tools/classification';
import type { ResolvedToolApprovalHook } from './hooks';
import {
  healToolApprovalPolicy,
  isHITLEnabled,
  isToolApprovalPauseCapable,
  isToolDeniedByApprovalPolicy,
} from './policy';
import { ASK_USER_QUESTION_TOOL_NAME } from './askUserQuestionTool';
import { resolvedToolApprovalHooksCanMatch } from './hooks';

interface ApprovalToolReference {
  readonly name?: string;
}

interface ApprovalToolRegistry {
  keys(): Iterable<string>;
  has(name: string): boolean;
}

interface ApprovalSubagentGraph {
  readonly memberConfigs?: readonly (ToolApprovalAdmissionAgent | null | undefined)[];
}

export interface ToolApprovalAdmissionAgent {
  readonly tools?: readonly (string | ApprovalToolReference)[];
  readonly toolRegistry?: ApprovalToolRegistry;
  readonly toolDefinitions?: readonly ApprovalToolReference[];
  readonly mcpToolAliases?: readonly MCPToolAlias[];
  readonly subagentAgentConfigs?: readonly (ToolApprovalAdmissionAgent | null | undefined)[];
  readonly lazySubagentConfigs?: readonly (ToolApprovalAdmissionAgent | null | undefined)[];
  readonly subagentGraphMemberMetadata?: readonly (ToolApprovalAdmissionAgent | null | undefined)[];
  readonly subagentGraphConfigs?: readonly ApprovalSubagentGraph[];
}

export interface ToolApprovalAdmissionInput {
  readonly policy: TToolApprovalPolicy | undefined;
  readonly agents: readonly (ToolApprovalAdmissionAgent | null | undefined)[];
  readonly hostGeneratedToolNames?: readonly string[];
  readonly resolvedProgrammaticHooks?: readonly ResolvedToolApprovalHook[];
  readonly pluginHookSource?: PluginHookSource;
  readonly askUserQuestionAdminDisabled?: boolean;
}

function agentHasTool(agent: ToolApprovalAdmissionAgent, toolName: string): boolean {
  return (
    agent.tools?.some((tool) => (typeof tool === 'string' ? tool : tool.name) === toolName) ===
      true ||
    agent.toolRegistry?.has(toolName) === true ||
    agent.toolDefinitions?.some((definition) => definition.name === toolName) === true
  );
}

function collectApprovalAgents(roots: readonly (ToolApprovalAdmissionAgent | null | undefined)[]): {
  agents: ToolApprovalAdmissionAgent[];
  hasLazyToolSurface: boolean;
} {
  const agents: ToolApprovalAdmissionAgent[] = [];
  const visited = new Set<ToolApprovalAdmissionAgent>();
  const pending = [...roots];
  let hasLazyToolSurface = false;

  for (let index = 0; index < pending.length; index++) {
    const agent = pending[index];
    if (agent == null || visited.has(agent)) {
      continue;
    }
    visited.add(agent);
    agents.push(agent);
    pending.push(...(agent.subagentAgentConfigs ?? []));
    if ((agent.lazySubagentConfigs?.length ?? 0) > 0) {
      hasLazyToolSurface = true;
      pending.push(...(agent.lazySubagentConfigs ?? []));
    }
    pending.push(...(agent.subagentGraphMemberMetadata ?? []));
    for (const graph of agent.subagentGraphConfigs ?? []) {
      pending.push(...(graph.memberConfigs ?? []));
    }
  }

  return { agents, hasLazyToolSurface };
}

/**
 * Whether an initialized run can pause through tool approval or a top-level
 * `ask_user_question`. Eager tools are matched exactly across every subagent
 * form; unresolved lazy surfaces are classified conservatively. The interrupt
 * boundary remains the final fail-closed durability check.
 */
export function canAgentGraphPause({
  policy,
  agents,
  hostGeneratedToolNames = [],
  resolvedProgrammaticHooks = [],
  pluginHookSource,
  askUserQuestionAdminDisabled = false,
}: ToolApprovalAdmissionInput): boolean {
  const asksUserQuestion =
    !askUserQuestionAdminDisabled &&
    !isToolDeniedByApprovalPolicy(policy, ASK_USER_QUESTION_TOOL_NAME) &&
    agents.some((agent) => agent != null && agentHasTool(agent, ASK_USER_QUESTION_TOOL_NAME));
  if (!isHITLEnabled(policy)) {
    return asksUserQuestion;
  }

  const approvalGraph = collectApprovalAgents(agents);
  const toolNames = new Set<string>();
  const aliases: MCPToolAlias[] = [];
  const aliasesByToolName = new Map<string, string[]>();
  const addToolName = (name: unknown) => {
    if (typeof name === 'string' && name !== ASK_USER_QUESTION_TOOL_NAME) {
      toolNames.add(name);
    }
  };

  for (const name of hostGeneratedToolNames) {
    addToolName(name);
  }

  for (const agent of approvalGraph.agents) {
    for (const tool of agent.tools ?? []) {
      addToolName(typeof tool === 'string' ? tool : tool.name);
    }
    if (agent.toolRegistry) {
      for (const name of agent.toolRegistry.keys()) {
        addToolName(name);
      }
    }
    for (const definition of agent.toolDefinitions ?? []) {
      addToolName(definition.name);
    }
    for (const alias of agent.mcpToolAliases ?? []) {
      aliases.push(alias);
      const names = aliasesByToolName.get(alias.name) ?? [];
      names.push(alias.aliasName);
      aliasesByToolName.set(alias.name, names);
    }
  }

  const effectivePolicy = healToolApprovalPolicy(policy, aliases);
  const knownToolCanPause = Array.from(toolNames).some((toolName) => {
    const matcherNames = [toolName, ...(aliasesByToolName.get(toolName) ?? [])];
    const requestHookCanAsk = resolvedToolApprovalHooksCanMatch(
      resolvedProgrammaticHooks,
      matcherNames,
    );
    const pluginHookCanAsk = pluginHookSource?.hasToolApprovalHooks?.([toolName]) === true;
    return isToolApprovalPauseCapable(effectivePolicy, requestHookCanAsk || pluginHookCanAsk, [
      toolName,
    ]);
  });
  if (knownToolCanPause) {
    return true;
  }
  if (approvalGraph.hasLazyToolSurface) {
    const unresolvedHookCanAsk =
      resolvedProgrammaticHooks.length > 0 || pluginHookSource?.hasToolApprovalHooks?.() === true;
    if (isToolApprovalPauseCapable(effectivePolicy, unresolvedHookCanAsk)) {
      return true;
    }
  }
  return asksUserQuestion;
}

/**
 * Whether `createRun` attaches a checkpointer for this initialization.
 * Cleanup follows attachment, not current pause capability: a retry must not
 * restore remnants written before a policy or request-hook change.
 */
export function agentRunUsesCheckpointer({
  policy,
  agents,
  askUserQuestionAdminDisabled = false,
}: Pick<
  ToolApprovalAdmissionInput,
  'policy' | 'agents' | 'askUserQuestionAdminDisabled'
>): boolean {
  return (
    isHITLEnabled(policy) ||
    (!askUserQuestionAdminDisabled &&
      agents.some((agent) => agent != null && agentHasTool(agent, ASK_USER_QUESTION_TOOL_NAME)))
  );
}
