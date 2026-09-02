import { Constants } from '@librechat/agents';
import type { HookCallback } from '@librechat/agents';
import type {
  CodeEnvironmentPermissionDecision,
  CodeEnvironmentUserConfigSchema,
  CodeEnvironmentUserSettings,
} from 'librechat-data-provider';
import { CREATE_FILE_TOOL_NAME, EDIT_FILE_TOOL_NAME } from '~/agents/tools';

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
};

type CodeEnvironmentPolicyAgent = {
  id?: string;
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
      });
    }
  }
  return settingsByAgentId;
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
    const category = BYOM_FILE_WRITE_TOOLS.has(input.toolName)
      ? 'fileWrite'
      : BYOM_COMMAND_EXECUTION_TOOLS.has(input.toolName)
        ? 'commandExecution'
        : undefined;
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
      input.toolInput.path.startsWith('skills/')
    ) {
      return {
        decision: 'ask',
        reason: `${input.toolName} can modify a persistent LibreChat skill`,
      };
    }
    const policy =
      input.executingAgentId == null ? undefined : settingsByAgentId.get(input.executingAgentId);
    const field = policy?.configSchema?.permissions?.[category];
    const configuredDecision = policy?.settings?.permissions?.[category];
    const decision: CodeEnvironmentPermissionDecision =
      configuredDecision != null && field?.allowed.includes(configuredDecision) === true
        ? configuredDecision
        : (field?.default ?? 'ask');
    if (decision === 'allow') {
      return { decision };
    }
    return {
      decision,
      reason: `${input.toolName} can modify your attached code environment`,
    };
  };
}
