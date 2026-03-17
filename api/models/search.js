const { Conversation, Message } = require('~/db/models');

/**
 * Runs parallel Meilisearch queries against Conversation and Message indices,
 * returning the raw results and a merged Set of matching conversation IDs.
 *
 * @param {string} search - The search query string.
 * @param {string} user - The user ID to scope results to.
 * @param {boolean} [populateMessages=false] - Whether to populate message results.
 * @returns {Promise<{ convoHits: Array, messageHits: Array, conversationIds: Set<string> }>}
 */
const searchConversationsAndMessages = async (search, user, populateMessages = false) => {
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

  return { convoHits, messageHits, conversationIds };
};

module.exports = { searchConversationsAndMessages };
