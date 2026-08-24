import { HookRegistry, createToolPolicyHook } from '@librechat/agents';
import type { TToolApprovalPolicy } from 'librechat-data-provider';
import type { MCPToolAlias } from '~/tools/classification';
import type { ToolApprovalHookContext } from './hooks';
import {
  isHITLEnabled,
  mapToolApprovalPolicy,
  collectAliasMatcherNames,
  buildAliasMatcherPattern,
} from './policy';
import { buildToolApprovalHooks } from './hooks';

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
 * The returned `hooks` registry carries the static-config `PreToolUse` policy hook built
 * from {@link mapToolApprovalPolicy} (an enabled policy with no allow/deny/ask lists falls
 * through to `mode: 'default'`, i.e. every tool prompts — the safe default for "HITL on,
 * nothing else specified"), PLUS any host-registered programmatic hooks
 * ({@link registerToolApprovalHook}) resolved against `context`. The static hook is
 * registered first as the baseline; host hooks layer after it. Decisions fold in the SDK
 * as `deny` > `ask` > `allow`, so a host hook can only TIGHTEN the configured policy.
 */
export function buildHITLRunWiring(
  policy: TToolApprovalPolicy | undefined,
  context: ToolApprovalHookContext = {},
  mcpToolAliases: readonly MCPToolAlias[] = [],
): HITLRunWiring | undefined {
  if (!isHITLEnabled(policy)) {
    return undefined;
  }

  const registry = new HookRegistry();
  // Static config-driven policy (mode/allow/deny/ask) — the baseline.
  registry.register('PreToolUse', {
    hooks: [createToolPolicyHook(mapToolApprovalPolicy(policy) ?? {})],
  });

  // Host-registered programmatic hooks — context-aware, layered after the baseline so their
  // `updatedInput` / `allowedDecisions` win the SDK's last-writer-wins precedence. Each can
  // carry its own tool-name matcher; the SDK still folds decisions deny > ask > allow.
  for (const { hook, matcher } of buildToolApprovalHooks(context)) {
    registry.register(
      'PreToolUse',
      matcher ? { pattern: matcher, hooks: [hook] } : { hooks: [hook] },
    );
    /** A matcher written against a tool's OTHER key spelling (pre-strip or
     *  current) would silently never fire for the renamed instance, skipping
     *  its argument/user/tenant-specific deny or ask. The SAME hook is
     *  registered again under an exact-name pattern for those aliased names
     *  — a separate entry keeps the admin's regex semantics and the SDK's
     *  pattern-length cap intact, and the name sets are disjoint so the hook
     *  never fires twice for one call. */
    const aliasNames = matcher ? collectAliasMatcherNames(matcher, mcpToolAliases) : [];
    if (aliasNames.length > 0) {
      registry.register('PreToolUse', {
        pattern: buildAliasMatcherPattern(aliasNames),
        hooks: [hook],
      });
    }
  }

  return { humanInTheLoop: { enabled: true }, hooks: registry };
}
