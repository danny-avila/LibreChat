import type { TMessageContentParts } from 'librechat-data-provider';

/** Column key for a lane part that carries no agent id of its own. */
const UNATTRIBUTED_LANE = 'unknown';

/**
 * Columns a lane group needs before it renders as columns.
 *
 * `groupId` marks content the server ran as one wave, but a wave is only ever
 * shown as a side-by-side COMPARISON — the added-conversation feature seeds a
 * placeholder per agent so both columns exist from the first render. A group
 * that resolves to one agent has nothing to compare against, and rendering it
 * as a lane costs more than a redundant border: lanes draw their own author
 * header and branch control (restating the message's own sender) and they
 * render raw parts, which opts those parts out of tool grouping, activity
 * label headers and phase folds, while the message row widens for columns
 * that never arrive.
 *
 * A lone group is not exotic. A multi-agent graph assigns a group id to every
 * starting node, so an ordinary agent that merely has subagents available
 * carries one on its OWN output.
 */
export const MIN_PARALLEL_LANES = 2;

/**
 * Distinct lane agents per group id. Mirrors the column derivation in
 * `groupParallelContent`: a placeholder (empty `type`) establishes its agent's
 * column without contributing content, and a part with no agent id of its own
 * shares the single unattributed column.
 */
export function laneAgentsByGroup(
  content: ReadonlyArray<TMessageContentParts | undefined> | undefined,
): Map<number, Set<string>> {
  const lanes = new Map<number, Set<string>>();
  content?.forEach((part) => {
    if (part?.groupId == null) {
      return;
    }
    const agents = lanes.get(part.groupId) ?? new Set<string>();
    agents.add(part.agentId ?? UNATTRIBUTED_LANE);
    lanes.set(part.groupId, agents);
  });
  return lanes;
}

/**
 * True when some group is backed by enough distinct agents to render as
 * columns. The predicate every consumer of "does this message have parallel
 * content" asks, so a lone group renders exactly like content with no group
 * id at all.
 */
export function hasParallelLanes(
  content: ReadonlyArray<TMessageContentParts | undefined> | undefined,
): boolean {
  for (const agents of laneAgentsByGroup(content).values()) {
    if (agents.size >= MIN_PARALLEL_LANES) {
      return true;
    }
  }
  return false;
}
