import type { BaseMessage } from '@langchain/core/messages';

/** Signature for a function that counts tokens in a LangChain message. */
export type TokenCounter = (message: BaseMessage) => number;

/**
 * Lazily fills missing token counts for formatted LangChain messages.
 * Preserves precomputed counts and only computes undefined indices.
 *
 * This is used after `formatAgentMessages` to ensure every message index
 * has a token count before passing `indexTokenCountMap` to the agent run.
 */
export function hydrateMissingIndexTokenCounts({
  messages,
  indexTokenCountMap,
  tokenCounter,
}: {
  messages: BaseMessage[];
  indexTokenCountMap: Record<number, number | undefined> | undefined;
  tokenCounter: TokenCounter;
}): Record<number, number> {
  const hydratedMap: Record<number, number> = {};

  if (indexTokenCountMap) {
    for (const [index, tokenCount] of Object.entries(indexTokenCountMap)) {
      if (typeof tokenCount === 'number' && Number.isFinite(tokenCount) && tokenCount > 0) {
        hydratedMap[Number(index)] = tokenCount;
      }
    }
  }

  for (let i = 0; i < messages.length; i++) {
    if (
      typeof hydratedMap[i] === 'number' &&
      Number.isFinite(hydratedMap[i]) &&
      hydratedMap[i] > 0
    ) {
      continue;
    }
    hydratedMap[i] = tokenCounter(messages[i]);
  }

  return hydratedMap;
}
