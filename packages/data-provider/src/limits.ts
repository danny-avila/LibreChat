/** Maximum number of explicit subagents per parent agent. UI + Zod schema share this. */
export const MAX_SUBAGENTS = 10;

/** Hard upper bound for `endpoints.agents.maxSubagents`, keeping the request-validation
 *  cap bounded no matter what the config file says. */
export const MAX_SUBAGENTS_CEILING = 50;

let maxSubagents = MAX_SUBAGENTS;

/** Effective subagents-per-agent cap; initialized from `endpoints.agents.maxSubagents` at startup. */
export const getMaxSubagents = (): number => maxSubagents;

/** Applies a configured cap; any missing or out-of-range value resets to the default. */
export const setMaxSubagents = (value: number | undefined): void => {
  maxSubagents =
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_SUBAGENTS_CEILING
      ? value
      : MAX_SUBAGENTS;
};

/** Chat project field limits. The dialogs and the persistence layer share these,
 *  so the inputs stop at the same point the server would otherwise truncate. */
export const MAX_CHAT_PROJECT_NAME_LENGTH = 100;
export const MAX_CHAT_PROJECT_DESCRIPTION_LENGTH = 1000;

/** Mirrors the bounded graph-child member limit in `@librechat/agents`. */
export const MAX_GRAPH_SUBAGENT_MEMBERS = 32;
