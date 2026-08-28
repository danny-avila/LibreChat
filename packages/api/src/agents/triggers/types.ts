import type { JsonValue } from '../json';

/** Optional source-declared proof the generation is expected to produce. The
 * host evaluates this against completed tool evidence; it never trusts a model
 * assertion that work happened. */
export interface AgentTriggerExpectedAction {
  toolName: string;
  argumentSubset?: Record<string, JsonValue>;
}

/** Minimal job-store projection of the canonical Conversation suspension.
 * The signed suspension stays private in Mongo; this marker only routes a
 * paused job through the durable resume protocol during rolling deploys. */
export interface AgentEventSuspensionProjection {
  version: 1;
  suspensionId: string;
  attempt: number;
}
