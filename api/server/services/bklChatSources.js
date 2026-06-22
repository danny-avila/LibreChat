/**
 * BKL citation-source remapping for duplicated/forked/branched conversations.
 *
 * Source/citation payloads live in the ai-api Postgres table `bkl_chat_sources`
 * (owned by the Python service), keyed by `request_id` and `message_id`. When
 * LibreChat duplicates/forks a conversation it mints brand-new `messageId`s, so
 * the rows orphan and the copy loses its `[N]` citations. `fork.js` already
 * builds the old→new id map while cloning; this helper forwards it to the ai-api
 * remap endpoint so the copied messages resolve their sources again.
 *
 * Best-effort: any failure is swallowed so a sources-service hiccup can never
 * fail the underlying fork/duplicate.
 */
const axios = require('axios');
const { logger } = require('@librechat/data-schemas');

const BKL_BASE_URL = process.env.BKL_API_BASE_URL || 'http://bkl-api:8000';
const BKL_API_TOKEN = process.env.IRE_API_TOKEN || '';

/**
 * Remap BKL citation sources from original message ids to their clones.
 * @param {Map<string, string>} idMapping - original messageId -> new messageId
 * @param {string} [conversationId] - new conversation id for the copied rows
 * @returns {Promise<void>}
 */
async function remapBklChatSources(idMapping, conversationId) {
  if (!idMapping || idMapping.size === 0) {
    return;
  }

  if (!BKL_API_TOKEN) {
    logger.warn('[bklChatSources] IRE_API_TOKEN is not set — skipping citation-source remap');
    return;
  }

  const mappings = [];
  for (const [oldMessageId, newMessageId] of idMapping) {
    if (oldMessageId && newMessageId && oldMessageId !== newMessageId) {
      mappings.push({ old_message_id: oldMessageId, new_message_id: newMessageId });
    }
  }

  if (mappings.length === 0) {
    return;
  }

  try {
    const response = await axios.post(
      `${BKL_BASE_URL}/v1/sources/remap`,
      { mappings, conversation_id: conversationId ?? null },
      {
        headers: {
          Authorization: `Bearer ${BKL_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 15_000,
      },
    );
    logger.debug(
      `[bklChatSources] Remapped ${response.data?.remapped ?? '?'}/${mappings.length} citation sources`,
    );
  } catch (err) {
    logger.warn('[bklChatSources] Failed to remap citation sources:', err?.message || err);
  }
}

module.exports = { remapBklChatSources };
