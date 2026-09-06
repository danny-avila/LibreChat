import { Constants } from '@librechat/agents';
import type {
  CodeEnvironmentPermissionDecision,
  CodeEnvironmentUserConfigSchema,
  CodeEnvironmentUserSettings,
} from 'librechat-data-provider';
import type { HookCallback } from '@librechat/agents';
import type { ResolvedToolApprovalHook } from './hooks';
import { CREATE_FILE_TOOL_NAME, EDIT_FILE_TOOL_NAME } from '~/agents/tools';
import { isSkillFilePath } from '~/agents/skills';

const BYOM_FILE_WRITE_TOOLS = new Set<string>([
  Constants.WRITE_FILE,
  Constants.EDIT_FILE,
  CREATE_FILE_TOOL_NAME,
  EDIT_FILE_TOOL_NAME,
]);

const BYOM_COMMAND_EXECUTION_TOOLS = new Set<string>([
  Constants.BASH_TOOL,
  Constants.EXECUTE_CODE,
  Constants.PROGRAMMATIC_TOOL_CALLING,
  Constants.BASH_PROGRAMMATIC_TOOL_CALLING,
  Constants.COMPILE_CHECK,
]);

export type AttachedCodeEnvironmentPolicySettings = {
  configSchema?: CodeEnvironmentUserConfigSchema;
  settings?: CodeEnvironmentUserSettings;
  skillAuthoringAvailable?: boolean;
};

type PermissionCategory = 'fileWrite' | 'commandExecution';

type CodeEnvironmentPolicyAgent = {
  id?: string;
  skillAuthoringAvailable?: boolean;
  codeExecutionContext?: {
    environmentType?: string;
    codeEnvironmentConfigSchema?: CodeEnvironmentUserConfigSchema;
    codeEnvironmentSettings?: CodeEnvironmentUserSettings;
  };
  subagentAgentConfigs?: readonly (CodeEnvironmentPolicyAgent | null | undefined)[];
  lazySubagentConfigs?: readonly (CodeEnvironmentPolicyAgent | null | undefined)[];
  subagentGraphMemberMetadata?: readonly (CodeEnvironmentPolicyAgent | null | undefined)[];
  subagentGraphConfigs?: readonly {
    memberConfigs?: readonly (CodeEnvironmentPolicyAgent | null | undefined)[];
  }[];
};

function collectCodeEnvironmentPolicyAgents(
  roots: readonly (CodeEnvironmentPolicyAgent | null | undefined)[],
): CodeEnvironmentPolicyAgent[] {
  const agents: CodeEnvironmentPolicyAgent[] = [];
  const visited = new Set<CodeEnvironmentPolicyAgent>();
  const pending = [...roots];
  for (let index = 0; index < pending.length; index++) {
    const agent = pending[index];
    if (agent == null || visited.has(agent)) {
      continue;
    }
    visited.add(agent);
    agents.push(agent);
    pending.push(...(agent.subagentAgentConfigs ?? []));
    pending.push(...(agent.lazySubagentConfigs ?? []));
    pending.push(...(agent.subagentGraphMemberMetadata ?? []));
    for (const graph of agent.subagentGraphConfigs ?? []) {
      pending.push(...(graph.memberConfigs ?? []));
    }
  }
  return agents;
}

export class AttachedCodeEnvironmentApprovalError extends Error {
  readonly code = 'BYOM_TOOL_APPROVAL_UNSUPPORTED';

  constructor() {
    super('Attached code environments require a tool-approval capable client');
    this.name = 'AttachedCodeEnvironmentApprovalError';
  }
}

/** Prevent an approval-gated BYOM tool from running on an ingress that cannot resume it. */
export function assertAttachedCodeEnvironmentApprovalSupported({
  hasAttachedCodeEnvironment,
  hitlCapable,
  approvalExplicitlyDisabled,
}: {
  hasAttachedCodeEnvironment: boolean;
  hitlCapable: boolean;
  approvalExplicitlyDisabled: boolean;
}): void {
  if (hasAttachedCodeEnvironment && !hitlCapable && !approvalExplicitlyDisabled) {
    throw new AttachedCodeEnvironmentApprovalError();
  }
}

/** Collect the SDK agent identities whose execution route targets an attached VM. */
export function collectAttachedCodeEnvironmentAgentIds(
  roots: readonly (CodeEnvironmentPolicyAgent | null | undefined)[],
): Set<string> {
  const attachedAgentIds = new Set<string>();
  for (const agent of collectCodeEnvironmentPolicyAgents(roots)) {
    if (agent.id && agent.codeExecutionContext?.environmentType === 'attached') {
      attachedAgentIds.add(agent.id);
    }
  }
  return attachedAgentIds;
}

export function collectAttachedCodeEnvironmentPolicySettings(
  roots: readonly (CodeEnvironmentPolicyAgent | null | undefined)[],
): Map<string, AttachedCodeEnvironmentPolicySettings> {
  const settingsByAgentId = new Map<string, AttachedCodeEnvironmentPolicySettings>();
  for (const agent of collectCodeEnvironmentPolicyAgents(roots)) {
    if (agent.id && agent.codeExecutionContext?.environmentType === 'attached') {
      settingsByAgentId.set(agent.id, {
        configSchema: agent.codeExecutionContext.codeEnvironmentConfigSchema,
        settings: agent.codeExecutionContext.codeEnvironmentSettings,
        skillAuthoringAvailable: agent.skillAuthoringAvailable === true,
      });
    }
  }
  return settingsByAgentId;
}

function permissionDecision(
  policy: AttachedCodeEnvironmentPolicySettings | undefined,
  category: PermissionCategory,
): CodeEnvironmentPermissionDecision {
  const field = policy?.configSchema?.permissions?.[category];
  const configuredDecision = policy?.settings?.permissions?.[category];
  return configuredDecision != null && field?.allowed.includes(configuredDecision) === true
    ? configuredDecision
    : (field?.default ?? 'ask');
}

function exactToolMatcher(toolNames: ReadonlySet<string>): string {
  return `^(?:${Array.from(toolNames, (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`;
}

/** Describe only the BYOM hook branches that can actually return `ask` during admission. */
export function buildAttachedCodeEnvironmentAdmissionHooks(
  attachedAgentIds: ReadonlySet<string>,
  settingsByAgentId: ReadonlyMap<string, AttachedCodeEnvironmentPolicySettings> = new Map(),
): ResolvedToolApprovalHook[] {
  const hook = createAttachedCodeEnvironmentPolicyHook(attachedAgentIds, settingsByAgentId);
  const hooks: ResolvedToolApprovalHook[] = [];
  const askFileAgents = new Set<string>();
  const askCommandAgents = new Set<string>();
  const skillAuthoringAgents = new Set<string>();
  for (const agentId of attachedAgentIds) {
    const policy = settingsByAgentId.get(agentId);
    if (permissionDecision(policy, 'fileWrite') === 'ask') askFileAgents.add(agentId);
    if (permissionDecision(policy, 'commandExecution') === 'ask') askCommandAgents.add(agentId);
    if (policy?.skillAuthoringAvailable === true) skillAuthoringAgents.add(agentId);
  }
  if (askFileAgents.size > 0) {
    hooks.push({ hook, matcher: exactToolMatcher(BYOM_FILE_WRITE_TOOLS), agentIds: askFileAgents });
  }
  if (askCommandAgents.size > 0) {
    hooks.push({
      hook,
      matcher: exactToolMatcher(BYOM_COMMAND_EXECUTION_TOOLS),
      agentIds: askCommandAgents,
    });
  }
  if (skillAuthoringAgents.size > 0) {
    hooks.push({
      hook,
      matcher: exactToolMatcher(new Set([CREATE_FILE_TOOL_NAME, EDIT_FILE_TOOL_NAME])),
      agentIds: skillAuthoringAgents,
    });
  }
  return hooks;
}

/**
 * Safe default for user-operated code environments. Read-only file and search
 * operations fall through to the run-wide policy; actions that can execute code
 * or modify the workspace require approval for the agent that owns the BYOM route.
 */
export function createAttachedCodeEnvironmentPolicyHook(
  attachedAgentIds: ReadonlySet<string>,
  settingsByAgentId: ReadonlyMap<string, AttachedCodeEnvironmentPolicySettings> = new Map(),
): HookCallback<'PreToolUse'> {
  return async (input) => {
    let category: PermissionCategory | undefined;
    if (BYOM_FILE_WRITE_TOOLS.has(input.toolName)) {
      category = 'fileWrite';
    } else if (BYOM_COMMAND_EXECUTION_TOOLS.has(input.toolName)) {
      category = 'commandExecution';
    }
    if (
      category == null ||
      (input.executingAgentId != null && !attachedAgentIds.has(input.executingAgentId))
    ) {
      return {};
    }
    if (
      category === 'fileWrite' &&
      (input.toolName === CREATE_FILE_TOOL_NAME || input.toolName === EDIT_FILE_TOOL_NAME) &&
      typeof input.toolInput?.path === 'string' &&
      isSkillFilePath(input.toolInput.path) &&
      settingsByAgentId.get(input.executingAgentId ?? '')?.skillAuthoringAvailable !== false
    ) {
      return {
        decision: 'ask',
        reason: `${input.toolName} can modify a persistent LibreChat skill`,
      };
    }
    if (input.executingAgentId == null) {
      return {
        decision: 'deny',
        reason: `${input.toolName} could not be attributed to an attached code environment`,
      };
    }
    const decision = permissionDecision(settingsByAgentId.get(input.executingAgentId), category);
    if (decision === 'allow') {
      return { decision };
    }
    return {
      decision,
      reason: `${input.toolName} can modify your attached code environment`,
    };
  };
}
