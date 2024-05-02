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
  includeAllDescendants = true,
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

    let messagesToClone = [];

    if (!includeBranches) {
      // Direct path only
      messagesToClone = BaseClient.getMessagesForConversation({
        messages: originalMessages,
        parentMessageId: targetMessageId,
      });
    } else if (includeBranches && !includeAllDescendants) {
      // Direct path and siblings
      messagesToClone = getAllMessagesUpToParent(originalMessages, targetMessageId);
    } else {
      // Direct path, siblings, and all descendants
      messagesToClone = getMessagesUpToTargetLevel(originalMessages, targetMessageId);
    }

    let firstMessageDate = null;
    const idMapping = new Map();

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
  // Exclude children of the target message
  return messages.filter(
    (msg) =>
      (pathToRoot.has(msg.messageId) && msg.messageId !== targetMessageId) ||
      (pathToRoot.has(msg.parentMessageId) && msg.parentMessageId !== targetMessageId),
  );
}

/**
 * Retrieves all messages up to the root from the target message and its neighbors.
 * @param {TMessage[]} messages - The list of messages to search.
 * @param {string} targetMessageId - The ID of the target message.
 * @returns {TMessage[]} The list of inclusive messages up to the root from the target message.
 */
function getMessagesUpToTargetLevel(messages, targetMessageId) {
  // Create a map of parentMessageId to children messages
  const parentToChildrenMap = new Map();
  for (const message of messages) {
    if (!parentToChildrenMap.has(message.parentMessageId)) {
      parentToChildrenMap.set(message.parentMessageId, []);
    }
    parentToChildrenMap.get(message.parentMessageId).push(message);
  }

  // Retrieve the target message
  const targetMessage = messages.find((msg) => msg.messageId === targetMessageId);
  if (!targetMessage) {
    logger.error('Target message not found.');
    return [];
  }

  // Initialize the first level with the root messages
  const rootMessages = parentToChildrenMap.get(Constants.NO_PARENT) || [];
  let currentLevel = [...rootMessages];
  const results = new Set(currentLevel);

  // Check if the target message is at the root level
  if (currentLevel.some((msg) => msg.messageId === targetMessageId)) {
    return Array.from(results);
  }

  // Iterate level by level until the target is found
  let targetFound = false;
  while (!targetFound && currentLevel.length > 0) {
    const nextLevel = [];
    for (const node of currentLevel) {
      const children = parentToChildrenMap.get(node.messageId) || [];
      for (const child of children) {
        nextLevel.push(child);
        results.add(child);
        if (child.messageId === targetMessageId) {
          targetFound = true;
        }
      }
    }
    currentLevel = nextLevel;
  }

  return Array.from(results);
}

module.exports = { forkConversation, getAllMessagesUpToParent, getMessagesUpToTargetLevel };
