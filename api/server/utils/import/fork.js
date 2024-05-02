const { v4: uuidv4 } = require('uuid');
const { EModelEndpoint, Constants } = require('librechat-data-provider');
const { createImportBatchBuilder } = require('./importBatchBuilder');
const BaseClient = require('~/app/clients/BaseClient');
const { getConvo } = require('~/models/Conversation');
const { getMessages } = require('~/models/Message');
const logger = require('~/config/winston');

/**
 *
 * @param {object} params - The parameters for the importer.
 * @param {string} params.originalConvoId - The ID of the conversation to fork.
 * @param {string} params.targetMessageId - The ID of the message to fork from.
 * @param {string} params.requestUserId - The ID of the user making the request.
 * @param {string} [params.newTitle] - Optional new title for the forked conversation uses old title if not provided
 * @param {boolean} [params.includeBranches=true] - Optional flag to include branches in the forked conversation; otherwise, only the main line thread will be forked.
 * @param {(userId: string) => ImportBatchBuilder} [params.builderFactory] - Optional factory function for creating an ImportBatchBuilder instance.
 */
async function forkConversation({
  originalConvoId,
  targetMessageId,
  requestUserId,
  newTitle,
  includeBranches = true,
  builderFactory = createImportBatchBuilder,
}) {
  try {
    const originalConvo = await getConvo(requestUserId, originalConvoId);
    const originalMessages = await getMessages({
      user: requestUserId,
      conversationId: originalConvoId,
    });

    const importBatchBuilder = builderFactory(requestUserId);
    importBatchBuilder.startConversation(EModelEndpoint.openAI);

    // Determine the set of messages to fork
    const messagesToClone = includeBranches
      ? getAllMessagesUpToParent(originalMessages, targetMessageId)
      : BaseClient.getMessagesForConversation({
        messages: originalMessages,
        parentMessageId: targetMessageId,
      });

    let firstMessageDate = null;
    const idMapping = new Map();

    // Clone and save the determined messages
    for (const message of messagesToClone) {
      const newMessageId = uuidv4();
      idMapping.set(message.messageId, newMessageId);

      const clonedMessage = {
        ...message,
        messageId: newMessageId,
        parentMessageId: message.parentMessageId
          ? idMapping.get(message.parentMessageId)
          : Constants.NO_PARENT,
      };

      importBatchBuilder.saveMessage(clonedMessage);
      if (!firstMessageDate || new Date(message.createdAt) < firstMessageDate) {
        firstMessageDate = new Date(message.createdAt);
      }
    }

    const result = importBatchBuilder.finishConversation(
      newTitle || originalConvo.title,
      firstMessageDate,
    );
    await importBatchBuilder.saveBatch();
    logger.debug(
      `user: ${requestUserId} | New conversation "${
        newTitle || originalConvo.title
      }" forked from conversation ID ${originalConvoId}`,
    );
    return result;
  } catch (error) {
    logger.error(
      `user: ${requestUserId} | Error forking conversation from original ID ${originalConvoId}`,
      error,
    );
    throw error;
  }
}

/**
 * Retrieves all messages up to the root from the target message.
 * @param {TMessage[]} messages - The list of messages to search.
 * @param {string} targetMessageId - The ID of the target message.
 * @returns {TMessage[]} The list of messages up to the root from the target message.
 */
function getAllMessagesUpToParent(messages, targetMessageId) {
  const targetMessage = messages.find((msg) => msg.messageId === targetMessageId);
  if (!targetMessage) {
    return [];
  }

  const pathToRoot = new Set();
  let current = targetMessage;

  // Traverse up to root to capture the path
  while (current) {
    pathToRoot.add(current.messageId);
    current = messages.find((msg) => msg.messageId === current.parentMessageId);
  }

  // Include all messages that are in the path or whose parent is in the path
  return messages.filter(
    (msg) =>
      pathToRoot.has(msg.messageId) ||
      (pathToRoot.has(msg.parentMessageId) && msg.messageId !== targetMessageId),
  );
}

module.exports = { forkConversation, getAllMessagesUpToParent };
