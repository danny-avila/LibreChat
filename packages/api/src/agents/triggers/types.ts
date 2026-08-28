import type { JsonValue } from '../json';

/** Optional source-declared proof the generation is expected to produce. The
 * host evaluates this against completed tool evidence; it never trusts a model
 * assertion that work happened. */
export interface AgentTriggerExpectedAction {
  toolName: string;
  argumentSubset?: Record<string, JsonValue>;
}
