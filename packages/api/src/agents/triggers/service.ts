import type { BoundAddress } from '../../app/origin';
import type {
  AgentTriggerExecutionHost,
  AgentTriggerExecutionHostDeps,
  AgentTriggerExecutionResult,
} from './host';
import { generateAgentTriggerToken } from '../../crypto/jwt';
import { selfOriginFromAddress } from '../../app/origin';
import { createAgentTriggerExecutionHost } from './host';

export const AGENT_TRIGGER_TOKEN_TTL = '60s';

export interface AgentTriggerServiceOptions {
  address?: BoundAddress | string | null;
}

export interface AgentTriggerServiceDeps {
  fetch?: AgentTriggerExecutionHostDeps['fetch'];
  getTimezone?: AgentTriggerExecutionHostDeps['getTimezone'];
  mintToken?: AgentTriggerExecutionHostDeps['mintToken'];
  timeoutMs?: number;
}

export interface AgentTriggerService {
  initialize: (options?: AgentTriggerServiceOptions) => void;
  dispatch: (
    envelope: unknown,
    options?: { signal?: AbortSignal },
  ) => Promise<AgentTriggerExecutionResult>;
}

/** Production composition for trusted, in-process trigger producers. */
export function createAgentTriggerService(deps: AgentTriggerServiceDeps = {}): AgentTriggerService {
  let boundOrigin: string | undefined;
  const host: AgentTriggerExecutionHost = createAgentTriggerExecutionHost({
    getBaseUrl: () => {
      const origin = process.env.AGENT_TRIGGERS_SELF_URL ?? boundOrigin;
      if (origin == null) {
        throw new Error('Agent trigger service has not been initialized with a listener address');
      }
      return origin;
    },
    mintToken:
      deps.mintToken ??
      ((principal) => generateAgentTriggerToken(principal.userId, AGENT_TRIGGER_TOKEN_TTL)),
    ...(deps.fetch != null && { fetch: deps.fetch }),
    ...(deps.getTimezone != null && { getTimezone: deps.getTimezone }),
    ...(deps.timeoutMs != null && { timeoutMs: deps.timeoutMs }),
  });

  return {
    initialize: (options = {}) => {
      boundOrigin = selfOriginFromAddress(options.address) ?? boundOrigin;
    },
    dispatch: (envelope, options) => host.dispatch(envelope, options),
  };
}
