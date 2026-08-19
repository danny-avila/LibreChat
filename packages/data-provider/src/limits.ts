/** Maximum number of explicit subagents per parent agent. UI + Zod schema share this. */
export const MAX_SUBAGENTS = 10;

/** Chat project field limits. The dialogs and the persistence layer share these,
 *  so the inputs stop at the same point the server would otherwise truncate. */
export const MAX_CHAT_PROJECT_NAME_LENGTH = 100;
export const MAX_CHAT_PROJECT_DESCRIPTION_LENGTH = 1000;

/** Mirrors the bounded graph-child member limit in `@librechat/agents`. */
export const MAX_GRAPH_SUBAGENT_MEMBERS = 32;
