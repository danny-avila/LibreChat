import { HookRegistry, createToolPolicyHook } from '@librechat/agents';
import type { TToolApprovalPolicy } from 'librechat-data-provider';
import { isHITLEnabled, mapToolApprovalPolicy } from './policy';

/**
 * The HITL fragment spread onto a `RunConfig` when tool approval is enabled.
 *
 * Kept as one object so the run seam attaches the opt-in switch and the policy
 * hook together — they're meaningless apart. The checkpointer is resolved
 * separately (it's an async, process-wide singleton) and merged into
 * `graphConfig.compileOptions` at the call site.
 */
export interface HITLRunWiring {
  humanInTheLoop: { enabled: true };
  hooks: HookRegistry;
}

/**
 * Assemble the run-level HITL wiring for a tool-approval policy, or `undefined`
 * when HITL is disabled (the default) — in which case the run attaches nothing
 * and behaves exactly as it did before this feature.
 *
 * The returned `hooks` registry carries a single `PreToolUse` policy hook built
 * from {@link mapToolApprovalPolicy}. An enabled policy with no allow/deny/ask
 * lists falls through to `mode: 'default'`, i.e. every tool prompts — the safe
 * default for "HITL on, nothing else specified".
 */
export function buildHITLRunWiring(
  policy: TToolApprovalPolicy | undefined,
): HITLRunWiring | undefined {
  if (!isHITLEnabled(policy)) {
    return undefined;
  }

  const registry = new HookRegistry();
  registry.register('PreToolUse', {
    hooks: [createToolPolicyHook(mapToolApprovalPolicy(policy) ?? {})],
  });

  return { humanInTheLoop: { enabled: true }, hooks: registry };
}
