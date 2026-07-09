import type { TAgentsEndpoint } from 'librechat-data-provider';

const DEFAULT_RECURSION_LIMIT = 50;

/**
 * Mirrors `RECURSION_MULTIPLIER` in `@librechat/agents` `SubagentExecutor`,
 * which derives a subagent's graph `recursionLimit` as `maxTurns * 3`. Keep in
 * sync with the SDK so a subagent's effective recursion limit matches the
 * resolved value it is configured for.
 */
const SUBAGENT_RECURSION_MULTIPLIER = 3;

/**
 * Mirrors `DEFAULT_MAX_TURNS` in `@librechat/agents` `SubagentExecutor`. Used as
 * a floor so a subagent never drops below the SDK's historical default of 75
 * graph steps (25 turns) when the resolved recursion limit is small.
 */
const DEFAULT_SUBAGENT_MAX_TURNS = 25;

/**
 * Resolves the effective recursion limit for an agent run via a 3-step cascade:
 * 1. YAML endpoint config default (falls back to 50)
 * 2. Per-agent DB override (if set and positive)
 * 3. Global max cap from YAML (if set and positive)
 */
export function resolveRecursionLimit(
  agentsEConfig: Partial<TAgentsEndpoint> | undefined,
  agent: { recursion_limit?: number } | undefined,
): number {
  let limit = agentsEConfig?.recursionLimit ?? DEFAULT_RECURSION_LIMIT;

  if (typeof agent?.recursion_limit === 'number' && agent.recursion_limit > 0) {
    limit = agent.recursion_limit;
  }

  if (
    typeof agentsEConfig?.maxRecursionLimit === 'number' &&
    agentsEConfig.maxRecursionLimit > 0 &&
    limit > agentsEConfig.maxRecursionLimit
  ) {
    limit = agentsEConfig.maxRecursionLimit;
  }

  return limit;
}

/**
 * Resolves a subagent's `maxTurns` so its graph `recursionLimit`
 * (`maxTurns * SUBAGENT_RECURSION_MULTIPLIER` in the SDK) tracks the same
 * resolved recursion limit as a top-level run. Without this, subagents ignore
 * both the YAML `recursionLimit`/`maxRecursionLimit` and the per-agent
 * `recursion_limit`, always running at the SDK default of 75 graph steps.
 *
 * Floored at {@link DEFAULT_SUBAGENT_MAX_TURNS} so a small resolved limit never
 * reduces subagent capacity below the historical default. When an explicit
 * `maxRecursionLimit` cap is set it wins over that floor: `maxTurns` is clamped
 * to `floor(maxRecursionLimit / SUBAGENT_RECURSION_MULTIPLIER)` so the effective
 * graph limit never exceeds the admin cap (the SDK's `* 3` would otherwise let
 * the floor or `ceil` overshoot it, e.g. cap 20 → 75 steps, cap 200 → 201).
 */
export function resolveSubagentMaxTurns(
  agentsEConfig: Partial<TAgentsEndpoint> | undefined,
  agent: { recursion_limit?: number } | undefined,
): number {
  const limit = resolveRecursionLimit(agentsEConfig, agent);
  let turns = Math.max(
    DEFAULT_SUBAGENT_MAX_TURNS,
    Math.ceil(limit / SUBAGENT_RECURSION_MULTIPLIER),
  );

  const maxCap = agentsEConfig?.maxRecursionLimit;
  if (typeof maxCap === 'number' && maxCap > 0) {
    turns = Math.min(turns, Math.floor(maxCap / SUBAGENT_RECURSION_MULTIPLIER));
  }

  return Math.max(1, turns);
}
