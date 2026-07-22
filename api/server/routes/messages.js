const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');
const { ContentTypes, isAssistantsEndpoint } = require('librechat-data-provider');
const {
  unescapeLaTeX,
  countTokens,
  sendFeedbackScore,
  traceIdForMessage,
  mergeQuotedTextForCount,
} = require('@librechat/api');
const { findAllArtifacts, replaceArtifactContent } = require('~/server/services/Artifacts/update');
const {
  requireJwtAuth,
  validateMessageReq,
  configMiddleware,
  sendValidationResponse,
  prepareMessageRequestValidation,
} = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();
router.use(requireJwtAuth);

router.get('/', async (req, res) => {
  try {
    const user = req.user.id ?? '';
    const {
      cursor = null,
      sortBy = 'updatedAt',
      sortDirection = 'desc',
      pageSize: pageSizeRaw,
      conversationId,
      messageId,
      search,
    } = req.query;
    const pageSize = parseInt(pageSizeRaw, 10) || 25;
    /**
     * Search-only cap: this value reaches Meili as `hitsPerPage`, so an unbounded
     * one would fetch an oversized raw page and hydrate that many
     * conversations/messages — once per empty-page scan. Conversation paging
     * keeps its own unclamped `pageSize`, whose limit this cap doesn't justify.
     */
    const MAX_SEARCH_PAGE_SIZE = 100;
    const searchPageSize = Math.min(Math.max(pageSize, 1), MAX_SEARCH_PAGE_SIZE);

    let response;
    const sortField = ['endpoint', 'createdAt', 'updatedAt'].includes(sortBy)
      ? sortBy
      : 'createdAt';
    const sortOrder = sortDirection === 'asc' ? 1 : -1;

    if (conversationId && messageId) {
      const messages = await db.getMessages({ conversationId, messageId, user });
      response = { messages: messages?.length ? [messages[0]] : [], nextCursor: null };
    } else if (conversationId) {
      response = await db.getMessagesByCursor(
        { conversationId, user },
        { sortField, sortOrder, limit: pageSize, cursor },
      );
    } else if (search) {
      /**
       * Meili paginates in page mode (`page` + `hitsPerPage`), which returns an
       * exact `totalPages`. The frontend's opaque `cursor` carries the 1-based
       * page number; an absent cursor is the first page.
       */
      /**
       * A page whose hits ALL belong to deleted/inaccessible conversations
       * filters down to zero rows. Returning that empty page strands the client:
       * it renders the no-results state, so there are no rows to drive the next
       * fetch and later pages holding real hits are unreachable. Walk forward
       * until a page yields a row (or the pages run out).
       *
       * The bound only stops a pathological corpus from holding the request
       * open; it is deliberately high enough that reaching it means there are no
       * accessible hits in ~625 raw results. If it IS reached, the cursor is
       * still returned rather than nulled — claiming the search is exhausted
       * would silently drop real matches past the filtered run.
       */
      const MAX_EMPTY_PAGE_SCANS = 25;
      let page = Math.max(1, parseInt(cursor, 10) || 1);
      let activeMessages = [];
      let nextCursor = null;

      for (let scan = 0; scan < MAX_EMPTY_PAGE_SCANS; scan++) {
        const searchResults = await db.searchMessages(
          search,
          { filter: `user = "${user}"`, page, hitsPerPage: searchPageSize },
          true,
        );

        const messages = searchResults.hits || [];

        /**
         * `getConvosQueried` is only a hydration/`convoMap` helper for THIS
         * page's hits. Its `cursor` arg is a date (for the conversation-list
         * feature), so the numeric page cursor must NOT be passed to it, and its
         * default limit (25) would truncate conversations out of a page — pass a
         * limit covering every conversation the page's hits could belong to.
         */
        const result = await db.getConvosQueried(req.user.id, messages, null, messages.length || 1);

        const messageIds = [];
        const cleanedMessages = [];
        for (let i = 0; i < messages.length; i++) {
          const message = messages[i];
          if (result.convoMap[message.conversationId]) {
            messageIds.push(message.messageId);
            cleanedMessages.push(message);
          }
        }

        const dbMessages = await db.getMessages({
          user,
          messageId: { $in: messageIds },
        });

        const dbMessageMap = {};
        for (const dbMessage of dbMessages) {
          dbMessageMap[dbMessage.messageId] = dbMessage;
        }

        activeMessages = [];
        for (const message of cleanedMessages) {
          const convo = result.convoMap[message.conversationId];
          const dbMessage = dbMessageMap[message.messageId];

          activeMessages.push({
            ...message,
            title: convo.title,
            conversationId: message.conversationId,
            model: convo.model,
            isCreatedByUser: dbMessage?.isCreatedByUser,
            endpoint: dbMessage?.endpoint,
            iconURL: dbMessage?.iconURL,
          });
        }

        /**
         * Page from Meili's raw hit paging, NOT the post-`convoMap`-filter count:
         * a page can render fewer rows than `hitsPerPage` when some hits belong to
         * deleted/inaccessible conversations, but there may still be more pages, so
         * the cursor must keep advancing. Prefer Meili's exact `totalPages`; fall
         * back to "a full raw page implies there may be more".
         */
        const totalPages = Number.isFinite(searchResults.totalPages)
          ? searchResults.totalPages
          : null;
        const hasNextPage =
          totalPages != null ? page < totalPages : messages.length >= searchPageSize;
        nextCursor = hasNextPage ? String(page + 1) : null;

        if (activeMessages.length > 0 || !hasNextPage) {
          break;
        }
        page += 1;
      }

      response = { messages: activeMessages, nextCursor };
    } else {
      response = { messages: [], nextCursor: null };
    }

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Creates a new branch message from a specific agent's content within a parallel response message.
 * Filters the original message's content to only include parts attributed to the specified agentId.
 * Only available for non-user messages with content attributions.
 *
 * @route POST /branch
 * @param {string} req.body.messageId - The ID of the source message
 * @param {string} req.body.agentId - The agentId to filter content by
 * @returns {TMessage} The newly created branch message
 */
router.post('/branch', async (req, res) => {
  try {
    const { messageId, agentId } = req.body;
    const userId = req.user.id;

    if (!messageId || !agentId) {
      return res.status(400).json({ error: 'messageId and agentId are required' });
    }

    const sourceMessage = await db.getMessage({ user: userId, messageId });
    if (!sourceMessage) {
      return res.status(404).json({ error: 'Source message not found' });
    }

    if (sourceMessage.isCreatedByUser) {
      return res.status(400).json({ error: 'Cannot branch from user messages' });
    }

    if (!Array.isArray(sourceMessage.content)) {
      return res.status(400).json({ error: 'Message does not have content' });
    }

    const hasAgentMetadata = sourceMessage.content.some((part) => part?.agentId);
    if (!hasAgentMetadata) {
      return res
        .status(400)
        .json({ error: 'Message does not have parallel content with attributions' });
    }

    /** @type {Array<import('librechat-data-provider').TMessageContentParts>} */
    const filteredContent = [];
    for (const part of sourceMessage.content) {
      if (part?.agentId === agentId) {
        const { agentId: _a, groupId: _g, ...cleanPart } = part;
        filteredContent.push(cleanPart);
      }
    }

    if (filteredContent.length === 0) {
      return res.status(400).json({ error: 'No content found for the specified agentId' });
    }

    const newMessageId = uuidv4();
    /** @type {import('librechat-data-provider').TMessage} */
    const newMessage = {
      messageId: newMessageId,
      conversationId: sourceMessage.conversationId,
      parentMessageId: sourceMessage.parentMessageId,
      attachments: sourceMessage.attachments,
      isCreatedByUser: false,
      model: sourceMessage.model,
      endpoint: sourceMessage.endpoint,
      sender: sourceMessage.sender,
      iconURL: sourceMessage.iconURL,
      content: filteredContent,
      unfinished: false,
      error: false,
      user: userId,
    };

    const savedMessage = await db.saveMessage(
      {
        userId: req?.user?.id,
        isTemporary: req?.body?.isTemporary,
        interfaceConfig: req?.config?.interfaceConfig,
      },
      newMessage,
      { context: 'POST /api/messages/branch' },
    );

    if (!savedMessage) {
      return res.status(500).json({ error: 'Failed to save branch message' });
    }

    res.status(201).json(savedMessage);
  } catch (error) {
    logger.error('Error creating branch message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/artifact/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { index, original, updated } = req.body;

    if (typeof index !== 'number' || index < 0 || original == null || updated == null) {
      return res.status(400).json({ error: 'Invalid request parameters' });
    }

    const message = await db.getMessage({ user: req.user.id, messageId });
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const artifacts = findAllArtifacts(message);
    if (index >= artifacts.length) {
      return res.status(400).json({ error: 'Artifact index out of bounds' });
    }

    // Unescape LaTeX preprocessing done by the frontend
    // The frontend escapes $ signs for display, but the database has unescaped versions
    const unescapedOriginal = unescapeLaTeX(original);
    const unescapedUpdated = unescapeLaTeX(updated);

    const targetArtifact = artifacts[index];
    let updatedText = null;

    if (targetArtifact.source === 'content') {
      const part = message.content[targetArtifact.partIndex];
      updatedText = replaceArtifactContent(
        part.text,
        targetArtifact,
        unescapedOriginal,
        unescapedUpdated,
      );
      if (updatedText) {
        part.text = updatedText;
      }
    } else {
      updatedText = replaceArtifactContent(
        message.text,
        targetArtifact,
        unescapedOriginal,
        unescapedUpdated,
      );
      if (updatedText) {
        message.text = updatedText;
      }
    }

    if (!updatedText) {
      return res.status(400).json({ error: 'Original content not found in target artifact' });
    }

    const savedMessage = await db.saveMessage(
      {
        userId: req?.user?.id,
        isTemporary: req?.body?.isTemporary,
        interfaceConfig: req?.config?.interfaceConfig,
      },
      {
        messageId,
        conversationId: message.conversationId,
        text: message.text,
        content: message.content,
        user: req.user.id,
      },
      { context: 'POST /api/messages/artifact/:messageId' },
    );

    res.status(200).json({
      conversationId: savedMessage.conversationId,
      content: savedMessage.content,
      text: savedMessage.text,
    });
  } catch (error) {
    logger.error('Error editing artifact:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:conversationId', prepareMessageRequestValidation, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const validation = req.messageRequestValidation;
    // This intentionally starts a user-scoped read before validation resolves;
    // the response remains gated on validation success below.
    const messagesPromise = validation.shouldFetchMessages
      ? db.getMessages({ conversationId, user: req.user.id }, '-_id -__v -user').then(
          (messages) => ({ messages }),
          (error) => ({ error }),
        )
      : null;

    const validationResult = await validation.promise;
    if (!validationResult.ok) {
      return sendValidationResponse(res, validationResult);
    }

    const messagesResult = await messagesPromise;
    if (messagesResult?.error) {
      throw messagesResult.error;
    }

    const messages = messagesResult?.messages ?? [];
    res.status(200).json(messages);
  } catch (error) {
    logger.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:conversationId', validateMessageReq, async (req, res) => {
  try {
    const message = { ...req.body, conversationId: req.params.conversationId };
    const reqCtx = {
      userId: req?.user?.id,
      isTemporary: req?.body?.isTemporary,
      interfaceConfig: req?.config?.interfaceConfig,
    };
    const savedMessage = await db.saveMessage(
      reqCtx,
      { ...message, user: req.user.id },
      { context: 'POST /api/messages/:conversationId' },
    );
    if (!savedMessage) {
      return res.status(400).json({ error: 'Message not saved' });
    }
    await db.saveConvo(reqCtx, savedMessage, { context: 'POST /api/messages/:conversationId' });
    res.status(201).json(savedMessage);
  } catch (error) {
    logger.error('Error saving message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:conversationId/:messageId', validateMessageReq, async (req, res) => {
  try {
    const { conversationId, messageId } = req.params;
    const message = await db.getMessages(
      { conversationId, messageId, user: req.user.id },
      '-_id -__v -user',
    );
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    res.status(200).json(message);
  } catch (error) {
    logger.error('Error fetching message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:conversationId/:messageId', validateMessageReq, async (req, res) => {
  try {
    const { conversationId, messageId } = req.params;
    const { text, index, model } = req.body;

    if (index === undefined) {
      /** A user turn's persisted `quotes` are re-prepended into the prompt on
       *  every send, but this edit only changes `text`. Count the merged
       *  text+quotes so the stored `tokenCount` stays authoritative (matching the
       *  send path); a plain text-only count under-reports by the quote block. */
      const existing = (
        await db.getMessages(
          { conversationId, messageId, user: req.user.id },
          'quotes isCreatedByUser',
        )
      )?.[0];
      const textToCount = mergeQuotedTextForCount(
        text,
        existing?.quotes,
        existing?.isCreatedByUser === true,
      );
      const tokenCount = await countTokens(textToCount, model);
      const result = await db.updateMessage(req?.user?.id, { messageId, text, tokenCount });
      return res.status(200).json(result);
    }

    if (typeof index !== 'number' || index < 0) {
      return res.status(400).json({ error: 'Invalid index' });
    }

    const message = (
      await db.getMessages({ conversationId, messageId, user: req.user.id }, 'content tokenCount')
    )?.[0];
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const existingContent = message.content;
    if (!Array.isArray(existingContent) || index >= existingContent.length) {
      return res.status(400).json({ error: 'Invalid index' });
    }

    const updatedContent = [...existingContent];
    if (!updatedContent[index]) {
      return res.status(400).json({ error: 'Content part not found' });
    }

    const currentPartType = updatedContent[index].type;
    if (currentPartType !== ContentTypes.TEXT && currentPartType !== ContentTypes.THINK) {
      return res.status(400).json({ error: 'Cannot update non-text content' });
    }

    const oldText = updatedContent[index][currentPartType];
    updatedContent[index] = { type: currentPartType, [currentPartType]: text };

    let tokenCount = message.tokenCount;
    if (tokenCount !== undefined) {
      const oldTokenCount = await countTokens(oldText, model);
      const newTokenCount = await countTokens(text, model);
      tokenCount = Math.max(0, tokenCount - oldTokenCount) + newTokenCount;
    }

    const result = await db.updateMessage(req?.user?.id, {
      messageId,
      content: updatedContent,
      tokenCount,
    });
    return res.status(200).json(result);
  } catch (error) {
    logger.error('Error updating message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put(
  '/:conversationId/:messageId/feedback',
  validateMessageReq,
  configMiddleware,
  async (req, res) => {
    try {
      const { conversationId, messageId } = req.params;
      const { feedback } = req.body;

      const updatedMessage = await db.updateMessage(
        req?.user?.id,
        {
          messageId,
          feedback: feedback || null,
        },
        { context: 'updateFeedback' },
      );

      // Best-effort: Assistants messages do not have deterministic AgentRun traces.
      if (!isAssistantsEndpoint(updatedMessage.endpoint)) {
        sendFeedbackScore({
          traceId: traceIdForMessage(messageId),
          feedback: updatedMessage.feedback,
          appConfig: req.config,
          metadata: {
            messageId: updatedMessage.messageId ?? messageId,
            parentMessageId: updatedMessage.parentMessageId,
            conversationId: updatedMessage.conversationId ?? conversationId,
            sessionId: updatedMessage.conversationId ?? conversationId,
            userId: req?.user?.id,
            tenantId: req?.user?.tenantId,
            endpoint: updatedMessage.endpoint,
            sender: updatedMessage.sender,
            isCreatedByUser: updatedMessage.isCreatedByUser,
            tokenCount: updatedMessage.tokenCount,
          },
        }).catch((err) => logger.error('[langfuse] feedback score failed:', err));
      }

      res.json({
        messageId,
        conversationId,
        feedback: updatedMessage.feedback,
      });
    } catch (error) {
      logger.error('Error updating message feedback:', error);
      res.status(500).json({ error: 'Failed to update feedback' });
    }
  },
);

router.delete('/:conversationId/:messageId', validateMessageReq, async (req, res) => {
  try {
    const { conversationId, messageId } = req.params;
    await db.deleteMessages({ messageId, conversationId, user: req.user.id });
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
