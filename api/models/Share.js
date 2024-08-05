const { nanoid } = require('nanoid');
const { Constants } = require('librechat-data-provider');
const SharedLink = require('./schema/shareSchema');
const { getMessages } = require('./Message');
const logger = require('~/config/winston');

/**
 * Anonymizes a conversation ID
 * @returns {string} The anonymized conversation ID
 */
function anonymizeConvoId() {
  return `convo_${nanoid()}`;
}

/**
 * Anonymizes an assistant ID
 * @returns {string} The anonymized assistant ID
 */
function anonymizeAssistantId() {
  return `a_${nanoid()}`;
}

/**
 * Anonymizes a message ID
 * @param {string} id - The original message ID
 * @returns {string} The anonymized message ID
 */
function anonymizeMessageId(id) {
  return id === Constants.NO_PARENT ? id : `msg_${nanoid()}`;
}

/**
 * Anonymizes a conversation object
 * @param {object} conversation - The conversation object
 * @returns {object} The anonymized conversation object
 */
function anonymizeConvo(conversation) {
  const newConvo = { ...conversation };
  if (newConvo.assistant_id) {
    newConvo.assistant_id = anonymizeAssistantId();
  }
  return newConvo;
}

/**
 * Anonymizes messages in a conversation
 * @param {TMessage[]} messages - The original messages
 * @param {string} newConvoId - The new conversation ID
 * @returns {TMessage[]} The anonymized messages
 */
function anonymizeMessages(messages, newConvoId) {
  const idMap = new Map();
  return messages.map((message) => {
    const newMessageId = anonymizeMessageId(message.messageId);
    idMap.set(message.messageId, newMessageId);

    const anonymizedMessage = Object.assign(message, {
      messageId: newMessageId,
      parentMessageId:
        idMap.get(message.parentMessageId) || anonymizeMessageId(message.parentMessageId),
      conversationId: newConvoId,
    });

    if (anonymizedMessage.model && anonymizedMessage.model.startsWith('asst_')) {
      anonymizedMessage.model = anonymizeAssistantId();
    }

    return anonymizedMessage;
  });
}

/**
 * Retrieves shared messages for a given share ID
 * @param {string} shareId - The share ID
 * @returns {Promise<object|null>} The shared conversation data or null if not found
 */
async function getSharedMessages(shareId) {
  try {
    const share = await SharedLink.findOne({ shareId })
      .populate({
        path: 'messages',
        select: '-_id -__v -user',
      })
      .select('-_id -__v -user')
      .lean();

    if (!share || !share.conversationId || !share.isPublic) {
      return null;
    }

    const newConvoId = anonymizeConvoId();
    return Object.assign(share, {
      conversationId: newConvoId,
      messages: anonymizeMessages(share.messages, newConvoId),
    });
  } catch (error) {
    logger.error('[getShare] Error getting share link', error);
    throw new Error('Error getting share link');
  }
}

/**
 * Retrieves shared links for a user
 * @param {string} user - The user ID
 * @param {number} [pageNumber=1] - The page number
 * @param {number} [pageSize=25] - The page size
 * @param {boolean} [isPublic=true] - Whether to retrieve public links only
 * @returns {Promise<object>} The shared links and pagination data
 */
async function getSharedLinks(user, pageNumber = 1, pageSize = 25, isPublic = true) {
  const query = { user, isPublic };
  try {
    const [totalConvos, sharedLinks] = await Promise.all([
      SharedLink.countDocuments(query),
      SharedLink.find(query)
        .sort({ updatedAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize)
        .select('-_id -__v -user')
        .lean(),
    ]);

    const totalPages = Math.ceil((totalConvos || 1) / pageSize);

    return {
      sharedLinks,
      pages: totalPages,
      pageNumber,
      pageSize,
    };
  } catch (error) {
    logger.error('[getShareByPage] Error getting shares', error);
    throw new Error('Error getting shares');
  }
}

/**
 * Creates a new shared link
 * @param {string} user - The user ID
 * @param {object} shareData - The share data
 * @param {string} shareData.conversationId - The conversation ID
 * @returns {Promise<object>} The created shared link
 */
async function createSharedLink(user, { conversationId, ...shareData }) {
  try {
    const share = await SharedLink.findOne({ conversationId }).select('-_id -__v -user').lean();
    if (share) {
      const newConvoId = anonymizeConvoId();
      const sharedConvo = anonymizeConvo(share);
      return Object.assign(sharedConvo, {
        conversationId: newConvoId,
        messages: anonymizeMessages(share.messages, newConvoId),
      });
    }

    const shareId = nanoid();
    const messages = await getMessages({ conversationId });
    const update = { ...shareData, shareId, messages, user };
    const newShare = await SharedLink.findOneAndUpdate({ conversationId, user }, update, {
      new: true,
      upsert: true,
    }).lean();

    const newConvoId = anonymizeConvoId();
    const sharedConvo = anonymizeConvo(newShare);
    return Object.assign(sharedConvo, {
      conversationId: newConvoId,
      messages: anonymizeMessages(newShare.messages, newConvoId),
    });
  } catch (error) {
    logger.error('[createSharedLink] Error creating shared link', error);
    throw new Error('Error creating shared link');
  }
}

/**
 * Updates an existing shared link
 * @param {string} user - The user ID
 * @param {object} shareData - The share data to update
 * @param {string} shareData.conversationId - The conversation ID
 * @returns {Promise<object>} The updated shared link
 */
async function updateSharedLink(user, { conversationId, ...shareData }) {
  try {
    const share = await SharedLink.findOne({ conversationId }).select('-_id -__v -user').lean();
    if (!share) {
      return { message: 'Share not found' };
    }

    const messages = await getMessages({ conversationId });
    const update = { ...shareData, messages, user };
    const updatedShare = await SharedLink.findOneAndUpdate({ conversationId, user }, update, {
      new: true,
      upsert: false,
    }).lean();

    const newConvoId = anonymizeConvoId();
    const sharedConvo = anonymizeConvo(updatedShare);
    return Object.assign(sharedConvo, {
      conversationId: newConvoId,
      messages: anonymizeMessages(updatedShare.messages, newConvoId),
    });
  } catch (error) {
    logger.error('[updateSharedLink] Error updating shared link', error);
    throw new Error('Error updating shared link');
  }
}

/**
 * Deletes a shared link
 * @param {string} user - The user ID
 * @param {object} params - The deletion parameters
 * @param {string} params.shareId - The share ID to delete
 * @returns {Promise<object>} The result of the deletion
 */
async function deleteSharedLink(user, { shareId }) {
  try {
    const result = await SharedLink.findOneAndDelete({ shareId, user });
    return result ? { message: 'Share deleted successfully' } : { message: 'Share not found' };
  } catch (error) {
    logger.error('[deleteSharedLink] Error deleting shared link', error);
    throw new Error('Error deleting shared link');
  }
}

/**
 * Deletes all shared links for a specific user
 * @param {string} user - The user ID
 * @returns {Promise<object>} The result of the deletion
 */
async function deleteAllSharedLinks(user) {
  try {
    const result = await SharedLink.deleteMany({ user });
    return {
      message: 'All shared links have been deleted successfully',
      deletedCount: result.deletedCount,
    };
  } catch (error) {
    logger.error('[deleteAllSharedLinks] Error deleting shared links', error);
    throw new Error('Error deleting shared links');
  }
}

module.exports = {
  SharedLink,
  getSharedLinks,
  createSharedLink,
  updateSharedLink,
  deleteSharedLink,
  getSharedMessages,
  deleteAllSharedLinks,
};
