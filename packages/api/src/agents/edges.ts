import type { GraphEdge } from 'librechat-data-provider';

/**
 * Creates a stable key for edge deduplication.
 * Handles both single and array-based from/to values.
 */
export function getEdgeKey(edge: GraphEdge): string {
  const from = Array.isArray(edge.from) ? [...edge.from].sort().join('|') : edge.from;
  const to = Array.isArray(edge.to) ? [...edge.to].sort().join('|') : edge.to;
  const type = edge.edgeType ?? 'handoff';
  return `${from}=>${to}::${type}`;
}

/**
 * Extracts all agent IDs referenced in an edge (both from and to).
 */
export function getEdgeParticipants(edge: GraphEdge): string[] {
  const participants: string[] = [];
  if (Array.isArray(edge.from)) {
    participants.push(...edge.from);
  } else if (typeof edge.from === 'string') {
    participants.push(edge.from);
  }
  if (Array.isArray(edge.to)) {
    participants.push(...edge.to);
  } else if (typeof edge.to === 'string') {
    participants.push(edge.to);
  }
  return participants;
}

/**
 * Filters out edges that reference non-existent (orphaned) agents.
 * Only filters based on the 'to' field since those are the handoff targets.
 */
export function filterOrphanedEdges(edges: GraphEdge[], skippedAgentIds: Set<string>): GraphEdge[] {
  if (!edges || skippedAgentIds.size === 0) {
    return edges;
  }
  return edges.filter((edge) => {
    const toIds = Array.isArray(edge.to) ? edge.to : [edge.to];
    return !toIds.some((id) => typeof id === 'string' && skippedAgentIds.has(id));
  });
}

/**
 * Result of discovering and aggregating edges from connected agents.
 */
export interface EdgeDiscoveryResult {
  /** Deduplicated edges from all discovered agents */
  edges: GraphEdge[];
  /** Agent IDs that were not found (orphaned references) */
  skippedAgentIds: Set<string>;
}

/**
 * Collects and deduplicates edges, tracking new agents to process.
 * Used for BFS discovery of connected agents.
 */
export function createEdgeCollector(
  checkAgentInit: (agentId: string) => boolean,
  skippedAgentIds: Set<string>,
): {
  edgeMap: Map<string, GraphEdge>;
  agentsToProcess: Set<string>;
  collectEdges: (edgeList: GraphEdge[] | undefined) => void;
} {
  const edgeMap = new Map<string, GraphEdge>();
  const agentsToProcess = new Set<string>();

  const collectEdges = (edgeList: GraphEdge[] | undefined): void => {
    if (!edgeList || edgeList.length === 0) {
      return;
    }
    for (const edge of edgeList) {
      const key = getEdgeKey(edge);
      if (!edgeMap.has(key)) {
        edgeMap.set(key, edge);
      }
      const participants = getEdgeParticipants(edge);
      for (const id of participants) {
        if (!checkAgentInit(id) && !skippedAgentIds.has(id)) {
          agentsToProcess.add(id);
        }
      }
    }
  };

  return { edgeMap, agentsToProcess, collectEdges };
}
