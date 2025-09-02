const { v4: uuidv4 } = require('uuid');
const { EModelEndpoint, Constants, ForkOptions } = require('librechat-data-provider');
const { createImportBatchBuilder } = require('./importBatchBuilder');
const BaseClient = require('~/app/clients/BaseClient');
const { getConvo } = require('~/models/Conversation');
const { getMessages } = require('~/models/Message');
const logger = require('~/config/winston');

/**
 * Helper function to clone messages with proper parent-child relationships and timestamps
 * @param {TMessage[]} messagesToClone - Original messages to clone
 * @param {ImportBatchBuilder} importBatchBuilder - Instance of ImportBatchBuilder
 * @returns {Map<string, string>} Map of original messageIds to new messageIds
 */
function cloneMessagesWithTimestamps(messagesToClone, importBatchBuilder) {
  const idMapping = new Map();

  // First pass: create ID mapping and sort messages by parentMessageId
  const sortedMessages = [...messagesToClone].sort((a, b) => {
    if (a.parentMessageId === Constants.NO_PARENT) {
      return -1;
    }
    if (b.parentMessageId === Constants.NO_PARENT) {
      return 1;
    }
    return 0;
  });

  // Helper function to ensure date object
  const ensureDate = (dateValue) => {
    if (!dateValue) {
      return new Date();
    }
    return dateValue instanceof Date ? dateValue : new Date(dateValue);
  };

  // Second pass: clone messages while maintaining proper timestamps
  for (const message of sortedMessages) {
    const newMessageId = uuidv4();
    idMapping.set(message.messageId, newMessageId);

    const parentId =
      message.parentMessageId && message.parentMessageId !== Constants.NO_PARENT
        ? idMapping.get(message.parentMessageId)
        : Constants.NO_PARENT;

    // If this message has a parent, ensure its timestamp is after the parent's
    let createdAt = ensureDate(message.createdAt);
    if (parentId !== Constants.NO_PARENT) {
      const parentMessage = importBatchBuilder.messages.find((msg) => msg.messageId === parentId);
      if (parentMessage) {
        const parentDate = ensureDate(parentMessage.createdAt);
        if (createdAt <= parentDate) {
          createdAt = new Date(parentDate.getTime() + 1);
        }
      }
    }

    const clonedMessage = {
      ...message,
      messageId: newMessageId,
      parentMessageId: parentId,
      createdAt,
    };

    importBatchBuilder.saveMessage(clonedMessage);
  }

  return idMapping;
}

/**
 *
 * @param {object} params - The parameters for the importer.
 * @param {string} params.originalConvoId - The ID of the conversation to fork.
 * @param {string} params.targetMessageId - The ID of the message to fork from.
 * @param {string} params.requestUserId - The ID of the user making the request.
 * @param {string} [params.newTitle] - Optional new title for the forked conversation uses old title if not provided
 * @param {string} [params.option=''] - Optional flag for fork option
 * @param {boolean} [params.records=false] - Optional flag for returning actual database records or resulting conversation and messages.
 * @param {boolean} [params.splitAtTarget=false] - Optional flag for splitting the messages at the target message level.
 * @param {string} [params.latestMessageId] - latestMessageId - Required if splitAtTarget is true.
 * @param {(userId: string) => ImportBatchBuilder} [params.builderFactory] - Optional factory function for creating an ImportBatchBuilder instance.
 * @returns {Promise<TForkConvoResponse>} The response after forking the conversation.
 */
async function forkConversation({
  originalConvoId,
  targetMessageId: targetId,
  requestUserId,
  newTitle,
  option = ForkOptions.TARGET_LEVEL,
  records = false,
  splitAtTarget = false,
  latestMessageId,
  builderFactory = createImportBatchBuilder,
}) {
  try {
    const originalConvo = await getConvo(requestUserId, originalConvoId);
    let originalMessages = await getMessages({
      user: requestUserId,
      conversationId: originalConvoId,
    });

    let targetMessageId = targetId;
    if (splitAtTarget && !latestMessageId) {
      throw new Error('Latest `messageId` is required for forking from target message.');
    } else if (splitAtTarget) {
      originalMessages = splitAtTargetLevel(originalMessages, targetId);
      targetMessageId = latestMessageId;
    }

    const importBatchBuilder = builderFactory(requestUserId);
    importBatchBuilder.startConversation(originalConvo.endpoint ?? EModelEndpoint.openAI);

    let messagesToClone = [];

    if (option === ForkOptions.DIRECT_PATH) {
      // Direct path only
      messagesToClone = BaseClient.getMessagesForConversation({
        messages: originalMessages,
        parentMessageId: targetMessageId,
      });
    } else if (option === ForkOptions.INCLUDE_BRANCHES) {
      // Direct path and siblings
      messagesToClone = getAllMessagesUpToParent(originalMessages, targetMessageId);
    } else if (option === ForkOptions.TARGET_LEVEL || !option) {
      // Direct path, siblings, and all descendants
      messagesToClone = getMessagesUpToTargetLevel(originalMessages, targetMessageId);
    }

    cloneMessagesWithTimestamps(messagesToClone, importBatchBuilder);

    const result = importBatchBuilder.finishConversation(
      newTitle || originalConvo.title,
      new Date(),
      originalConvo,
    );
    await importBatchBuilder.saveBatch();
    logger.debug(
      `user: ${requestUserId} | New conversation "${
        newTitle || originalConvo.title
      }" forked from conversation ID ${originalConvoId}`,
    );

    if (!records) {
      return result;
    }

    const conversation = await getConvo(requestUserId, result.conversation.conversationId);
    const messages = await getMessages({
      user: requestUserId,
      conversationId: conversation.conversationId,
    });

    return {
      conversation,
      messages,
    };
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
  const visited = new Set();
  let current = targetMessage;

  while (current) {
    if (visited.has(current.messageId)) {
      break;
    }

    visited.add(current.messageId);
    pathToRoot.add(current.messageId);

    const currentParentId = current.parentMessageId ?? Constants.NO_PARENT;
    if (currentParentId === Constants.NO_PARENT) {
      break;
    }

    current = messages.find((msg) => msg.messageId === currentParentId);
  }

  // Include all messages that are in the path or whose parent is in the path
  // Exclude children of the target message
  return messages.filter(
    (msg) =>
      (pathToRoot.has(msg.messageId) && msg.messageId !== targetMessageId) ||
      (pathToRoot.has(msg.parentMessageId) && msg.parentMessageId !== targetMessageId) ||
      msg.messageId === targetMessageId,
  );
}

/**
 * Retrieves all messages up to the root from the target message and its neighbors.
 * @param {TMessage[]} messages - The list of messages to search.
 * @param {string} targetMessageId - The ID of the target message.
 * @returns {TMessage[]} The list of inclusive messages up to the root from the target message.
 */
function getMessagesUpToTargetLevel(messages, targetMessageId) {
  if (messages.length === 1 && messages[0] && messages[0].messageId === targetMessageId) {
    return messages;
  }

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

  const visited = new Set();

  const rootMessages = parentToChildrenMap.get(Constants.NO_PARENT) || [];
  let currentLevel = rootMessages.length > 0 ? [...rootMessages] : [targetMessage];
  const results = new Set(currentLevel);

  // Check if the target message is at the root level
  if (
    currentLevel.some((msg) => msg.messageId === targetMessageId) &&
    targetMessage.parentMessageId === Constants.NO_PARENT
  ) {
    return Array.from(results);
  }

  // Iterate level by level until the target is found
  let targetFound = false;
  while (!targetFound && currentLevel.length > 0) {
    const nextLevel = [];
    for (const node of currentLevel) {
      if (visited.has(node.messageId)) {
        logger.warn('Cycle detected in message tree');
        continue;
      }
      visited.add(node.messageId);
      const children = parentToChildrenMap.get(node.messageId) || [];
      for (const child of children) {
        if (visited.has(child.messageId)) {
          logger.warn('Cycle detected in message tree');
          continue;
        }
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

/**
 * Splits the conversation at the targeted message level, including the target, its siblings, and all descendant messages.
 * All target level messages have their parentMessageId set to the root.
 * @param {TMessage[]} messages - The list of messages to analyze.
 * @param {string} targetMessageId - The ID of the message to start the split from.
 * @returns {TMessage[]} The list of messages at and below the target level.
 */
function splitAtTargetLevel(messages, targetMessageId) {
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

  // Initialize the search with root messages
  const rootMessages = parentToChildrenMap.get(Constants.NO_PARENT) || [];
  let currentLevel = [...rootMessages];
  let currentLevelIndex = 0;
  const levelMap = {};

  // Map messages to their levels
  rootMessages.forEach((msg) => {
    levelMap[msg.messageId] = 0;
  });

  // Search for the target level
  while (currentLevel.length > 0) {
    const nextLevel = [];
    for (const node of currentLevel) {
      const children = parentToChildrenMap.get(node.messageId) || [];
      for (const child of children) {
        nextLevel.push(child);
        levelMap[child.messageId] = currentLevelIndex + 1;
      }
    }
    currentLevel = nextLevel;
    currentLevelIndex++;
  }

  // Determine the target level
  const targetLevel = levelMap[targetMessageId];
  if (targetLevel === undefined) {
    logger.error('Target level not found.');
    return [];
  }

  // Filter messages at or below the target level
  const filteredMessages = messages
    .map((msg) => {
      const messageLevel = levelMap[msg.messageId];
      if (messageLevel < targetLevel) {
        return null;
      } else if (messageLevel === targetLevel) {
        return {
          ...msg,
          parentMessageId: Constants.NO_PARENT,
        };
      }

      return msg;
    })
    .filter((msg) => msg !== null);

  return filteredMessages;
}

/**
 * Duplicates a conversation and all its messages.
 * @param {object} params - The parameters for duplicating the conversation.
 * @param {string} params.userId - The ID of the user duplicating the conversation.
 * @param {string} params.conversationId - The ID of the conversation to duplicate.
 * @returns {Promise<{ conversation: TConversation, messages: TMessage[] }>} The duplicated conversation and messages.
 */
async function duplicateConversation({ userId, conversationId }) {
  // Get original conversation
  const originalConvo = await getConvo(userId, conversationId);
  if (!originalConvo) {
    throw new Error('Conversation not found');
  }

  // Get original messages
  const originalMessages = await getMessages({
    user: userId,
    conversationId,
  });

  const messagesToClone = getMessagesUpToTargetLevel(
    originalMessages,
    originalMessages[originalMessages.length - 1].messageId,
  );

  const importBatchBuilder = createImportBatchBuilder(userId);
  importBatchBuilder.startConversation(originalConvo.endpoint ?? EModelEndpoint.openAI);

  cloneMessagesWithTimestamps(messagesToClone, importBatchBuilder);

  const result = importBatchBuilder.finishConversation(
    originalConvo.title,
    new Date(),
    originalConvo,
  );
  await importBatchBuilder.saveBatch();
  logger.debug(
    `user: ${userId} | New conversation "${originalConvo.title}" duplicated from conversation ID ${conversationId}`,
  );

  const conversation = await getConvo(userId, result.conversation.conversationId);
  const messages = await getMessages({
    user: userId,
    conversationId: conversation.conversationId,
  });

  return {
    conversation,
    messages,
  };
}

module.exports = {
  forkConversation,
  splitAtTargetLevel,
  duplicateConversation,
  getAllMessagesUpToParent,
  getMessagesUpToTargetLevel,
  cloneMessagesWithTimestamps,
};
