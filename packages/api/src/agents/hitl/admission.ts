import type { TToolApprovalPolicy } from 'librechat-data-provider';
import type { PluginHookSource } from '~/agents/hooks/source';
import type { MCPToolAlias } from '~/tools/classification';
import type { ResolvedToolApprovalHook } from './hooks';
import { healToolApprovalPolicy, isHITLEnabled, isToolApprovalPauseCapable } from './policy';
import { ASK_USER_QUESTION_TOOL_NAME } from './askUserQuestionTool';
import { resolvedToolApprovalHooksCanMatch } from './hooks';
import { collectReachableAgents } from '../traversal';

interface ApprovalToolReference {
  readonly name?: string;
}

interface ApprovalToolRegistry {
  keys(): Iterable<string>;
}

export interface ToolApprovalAdmissionAgent {
  readonly tools?: readonly (string | ApprovalToolReference)[];
  readonly toolRegistry?: ApprovalToolRegistry;
  readonly toolDefinitions?: readonly ApprovalToolReference[];
  readonly mcpToolAliases?: readonly MCPToolAlias[];
  readonly subagentAgentConfigs?: readonly (ToolApprovalAdmissionAgent | null | undefined)[];
}

export interface ToolApprovalAdmissionInput {
  readonly policy: TToolApprovalPolicy | undefined;
  readonly agents: readonly (ToolApprovalAdmissionAgent | null | undefined)[];
  readonly resolvedProgrammaticHooks?: readonly ResolvedToolApprovalHook[];
  readonly pluginHookSource?: PluginHookSource;
}

/**
 * Whether the initialized agent graph exposes a tool that can actually pause
 * under the effective approval policy. Admission uses the eager tool surface;
 * the interrupt boundary remains the fail-closed backstop for lazy tools that
 * resolve later in the run.
 */
export function canAgentGraphPauseForToolApproval({
  policy,
  agents,
  resolvedProgrammaticHooks = [],
  pluginHookSource,
}: ToolApprovalAdmissionInput): boolean {
  if (!isHITLEnabled(policy)) {
    return false;
  }

  const toolNames = new Set<string>();
  const aliases: MCPToolAlias[] = [];
  const aliasesByToolName = new Map<string, string[]>();
  const addToolName = (name: unknown) => {
    if (typeof name === 'string' && name !== ASK_USER_QUESTION_TOOL_NAME) {
      toolNames.add(name);
    }
  };

  for (const agent of collectReachableAgents(agents)) {
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
  return Array.from(toolNames).some((toolName) => {
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
}
