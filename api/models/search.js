const { Conversation, Message } = require('~/db/models');

const SEARCH_CACHE_TTL_MS = 2000;
const searchCache = new Map();

/** @param {string} key */
const getCachedSearch = (key) => {
  const entry = searchCache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.timestamp > SEARCH_CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  return entry.value;
};

/**
 * Runs parallel Meilisearch queries against Conversation and Message indices,
 * returning the raw results and a merged Set of matching conversation IDs.
 * Results are cached for 2 seconds keyed on `search + user` to deduplicate
 * concurrent requests from the conversations and messages endpoints.
 *
 * @param {string} search - The search query string.
 * @param {string} user - The user ID to scope results to.
 * @param {boolean} [populateMessages=false] - Whether to populate message results.
 * @returns {Promise<{ convoHits: Array, messageHits: Array, conversationIds: Set<string> }>}
 */
const searchConversationsAndMessages = async (search, user, populateMessages = false) => {
  const cacheKey = `${user}:${search}`;
  const cached = getCachedSearch(cacheKey);
  if (cached) {
    return cached;
  }

  const [convoResults, messageResults] = await Promise.all([
    Conversation.meiliSearch(search, { filter: `user = "${user}"` }),
    Message.meiliSearch(search, { filter: `user = "${user}"` }, populateMessages),
  ]);

  const conversationIds = new Set();

  const convoHits = Array.isArray(convoResults.hits) ? convoResults.hits : [];
  for (const hit of convoHits) {
    if (hit.conversationId) {
      conversationIds.add(hit.conversationId);
    }
  }

  const messageHits = Array.isArray(messageResults.hits) ? messageResults.hits : [];
  for (const hit of messageHits) {
    if (hit.conversationId) {
      conversationIds.add(hit.conversationId);
    }
  }

  const result = { convoHits, messageHits, conversationIds };
  searchCache.set(cacheKey, { value: result, timestamp: Date.now() });
  return result;
};

/**
 * Builds the aggregation pipeline that fetches the latest message per
 * conversation for a set of title-only matched conversation IDs.
 *
 * @param {string} user - The user ID to scope results to.
 * @param {string[]} conversationIds - Conversation IDs to fetch latest messages for.
 * @returns {import('mongoose').PipelineStage[]}
 */
const buildLatestMessagePipeline = (user, conversationIds) => [
  {
    $match: {
      user,
      conversationId: { $in: conversationIds },
    },
  },
  {
    $project: {
      conversationId: 1,
      messageId: 1,
      text: 1,
      isCreatedByUser: 1,
      endpoint: 1,
      iconURL: 1,
      model: 1,
      updatedAt: 1,
      _id: 0,
    },
  },
  { $sort: { conversationId: 1, updatedAt: -1 } },
  {
    $group: {
      _id: '$conversationId',
      message: { $first: '$$ROOT' },
    },
  },
];

/** Exposed for testing; clears the short-lived search cache. */
const clearSearchCache = () => searchCache.clear();

module.exports = {
  searchConversationsAndMessages,
  buildLatestMessagePipeline,
  clearSearchCache,
};
