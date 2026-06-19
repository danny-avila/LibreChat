const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const {
  isTarsConfigured,
  createTarsConversation,
  createTarsMessage,
  deleteTarsConversation,
  deleteTarsConversations,
} = require('@librechat/api');
const { getConvo, saveConvo } = require('~/models');

/**
 * Best-effort, one-way mirror of a finished LibreChat chat turn into the pwc_tars
 * DB (LibreChat → pwc_tars). Lazily creates the linked pwc_tars conversation on
 * the first turn and stores the mapping (`tarsConversationId`) on the LibreChat
 * conversation, then appends the query/response as a pwc_tars message.
 *
 * Never throws — any failure is logged and swallowed so chat is unaffected.
 */
async function mirrorChatToTars(
  req,
  { conversationId, existingTarsConversationId, title, model, domainId, query, response },
) {
  try {
    const tarsId = req?.user?.tarsId;
    if (!isTarsConfigured() || !tarsId || !conversationId || !query || !response) {
      return;
    }

    const userId = req.user.id;
    // Prefer the mapping captured before generation (the agent's convo save wipes it);
    // fall back to re-reading in case it survived.
    let tarsConversationId =
      existingTarsConversationId || (await getConvo(userId, conversationId))?.tarsConversationId;

    if (!tarsConversationId) {
      tarsConversationId = await createTarsConversation(tarsId, {
        name: title || 'New Chat',
        domainId,
        modelName: model,
        systemInstruction: req?.body?.promptPrefix ?? null,
      });
      if (!tarsConversationId) {
        return;
      }
    }

    // Always re-assert the mapping: the agent's per-turn convo save wipes it, so without
    // re-saving each turn the next turn would create a duplicate pwc_tars conversation.
    await saveConvo(
      { userId },
      { conversationId, tarsConversationId },
      { context: 'api/server/services/Tars/mirror.js - link pwc_tars conversation' },
    );

    await createTarsMessage(tarsId, {
      conversationId: tarsConversationId,
      query,
      response,
      modelName: model,
    });
  } catch (error) {
    logger.error('[mirrorChatToTars] Failed to mirror conversation to pwc_tars', error);
  }
}

/**
 * Best-effort mirror of a LibreChat conversation deletion into pwc_tars. Given the
 * linked `tarsConversationId` (resolved before the LibreChat doc is removed),
 * soft-deletes the pwc_tars conversation. Never throws.
 */
async function mirrorDeleteToTars(req, tarsConversationId) {
  try {
    const tarsId = req?.user?.tarsId;
    if (!isTarsConfigured() || !tarsId || !tarsConversationId) {
      return;
    }
    await deleteTarsConversation(tarsId, tarsConversationId);
  } catch (error) {
    logger.error('[mirrorDeleteToTars] Failed to delete pwc_tars conversation', error);
  }
}

/**
 * Collects the linked pwc_tars conversation ids for the LibreChat conversations that
 * a delete operation will remove (matching `filter`, scoped to the user). Must be
 * called BEFORE the LibreChat docs are deleted. Returns [] for non-tars users.
 */
async function collectTarsConversationIds(userId, filter = {}) {
  try {
    const Conversation = mongoose.models.Conversation;
    if (!Conversation) {
      return [];
    }
    const rows = await Conversation.find(
      { ...filter, user: userId, tarsConversationId: { $exists: true, $ne: null } },
      'tarsConversationId',
    ).lean();
    return rows.map((row) => row.tarsConversationId).filter(Boolean);
  } catch (error) {
    logger.error('[collectTarsConversationIds] Failed to collect pwc_tars conversation ids', error);
    return [];
  }
}

/**
 * Best-effort batch mirror of LibreChat conversation deletions into pwc_tars
 * (clear-all / bulk delete). Never throws.
 */
async function mirrorDeleteManyToTars(req, tarsConversationIds) {
  try {
    const tarsId = req?.user?.tarsId;
    if (!isTarsConfigured() || !tarsId || !tarsConversationIds?.length) {
      return;
    }
    await deleteTarsConversations(tarsId, tarsConversationIds);
  } catch (error) {
    logger.error('[mirrorDeleteManyToTars] Failed to delete pwc_tars conversations', error);
  }
}

module.exports = {
  mirrorChatToTars,
  mirrorDeleteToTars,
  mirrorDeleteManyToTars,
  collectTarsConversationIds,
};
