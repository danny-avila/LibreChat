import { Constants } from '@librechat/agents';
import type { HookCallback } from '@librechat/agents';

const BYOM_APPROVAL_TOOLS = new Set<string>([
  Constants.BASH_TOOL,
  Constants.EXECUTE_CODE,
  Constants.PROGRAMMATIC_TOOL_CALLING,
  Constants.BASH_PROGRAMMATIC_TOOL_CALLING,
  Constants.WRITE_FILE,
  Constants.EDIT_FILE,
  Constants.COMPILE_CHECK,
  'create_file',
]);

type CodeEnvironmentPolicyAgent = {
  id?: string;
  codeExecutionContext?: { environmentType?: string };
  subagentAgentConfigs?: readonly (CodeEnvironmentPolicyAgent | null | undefined)[];
  lazySubagentConfigs?: readonly (CodeEnvironmentPolicyAgent | null | undefined)[];
  subagentGraphMemberMetadata?: readonly (CodeEnvironmentPolicyAgent | null | undefined)[];
  subagentGraphConfigs?: readonly {
    memberConfigs?: readonly (CodeEnvironmentPolicyAgent | null | undefined)[];
  }[];
};

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
  const visited = new Set<CodeEnvironmentPolicyAgent>();
  const pending = [...roots];
  for (let index = 0; index < pending.length; index++) {
    const agent = pending[index];
    if (agent == null || visited.has(agent)) {
      continue;
    }
    visited.add(agent);
    if (agent.id && agent.codeExecutionContext?.environmentType === 'attached') {
      attachedAgentIds.add(agent.id);
    }
    pending.push(...(agent.subagentAgentConfigs ?? []));
    pending.push(...(agent.lazySubagentConfigs ?? []));
    pending.push(...(agent.subagentGraphMemberMetadata ?? []));
    for (const graph of agent.subagentGraphConfigs ?? []) {
      pending.push(...(graph.memberConfigs ?? []));
    }
  }
  return attachedAgentIds;
}

/**
 * Safe default for user-operated code environments. Read-only file and search
 * operations fall through to the run-wide policy; actions that can execute code
 * or modify the workspace require approval for the agent that owns the BYOM route.
 */
export function createAttachedCodeEnvironmentPolicyHook(
  attachedAgentIds: ReadonlySet<string>,
): HookCallback<'PreToolUse'> {
  return async (input) => {
    if (
      !BYOM_APPROVAL_TOOLS.has(input.toolName) ||
      (input.executingAgentId != null && !attachedAgentIds.has(input.executingAgentId))
    ) {
      return {};
    }
    return {
      decision: 'ask',
      reason: `${input.toolName} can modify your attached code environment`,
    };
  };
}
