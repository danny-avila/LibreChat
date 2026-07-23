/**
 * Pending Attachments Registry
 * 
 * This module manages pending file attachments that need to be added to messages
 * after the message is created. MCP tools execute before the message exists in
 * the database, so we store attachment data here and apply it when the message
 * is saved.
 * 
 * Flow:
 * 1. MCP tool executes and creates file artifact
 * 2. MCP.js stores pending attachment via addPendingAttachment()
 * 3. Message is created and saved to MongoDB
 * 4. Post-save hook or explicit call retrieves and applies pending attachments
 * 5. Attachments are cleared from registry after successful application
 */

const { logger } = require('@librechat/data-schemas');

// In-memory store for pending attachments
// Key: messageId, Value: Array of attachment objects
const pendingAttachmentsMap = new Map();

// TTL for pending attachments (5 minutes)
const PENDING_ATTACHMENT_TTL_MS = 5 * 60 * 1000;

/**
 * Add a pending attachment for a message that doesn't exist yet.
 * @param {string} messageId - The message ID to attach to
 * @param {Object} attachment - The attachment data
 * @returns {void}
 */
function addPendingAttachment(messageId, attachment) {
  if (!messageId || !attachment?.file_id) {
    logger.warn('[PendingAttachments] Invalid messageId or attachment:', { messageId, attachment });
    return;
  }

  if (!pendingAttachmentsMap.has(messageId)) {
    pendingAttachmentsMap.set(messageId, []);
  }

  const attachments = pendingAttachmentsMap.get(messageId);
  
  // Avoid duplicates
  const exists = attachments.some(a => a.file_id === attachment.file_id);
  if (!exists) {
    attachments.push({
      ...attachment,
      _addedAt: Date.now(),
    });
    logger.info(`[PendingAttachments] Added pending attachment ${attachment.file_id} for message ${messageId}`);
  }

  // Schedule cleanup after TTL
  setTimeout(() => {
    cleanupPendingAttachment(messageId, attachment.file_id);
  }, PENDING_ATTACHMENT_TTL_MS);
}

/**
 * Get and remove pending attachments for a message.
 * @param {string} messageId - The message ID
 * @returns {Array} Array of pending attachments, or empty array
 */
function getPendingAttachments(messageId) {
  if (!messageId || !pendingAttachmentsMap.has(messageId)) {
    return [];
  }

  const attachments = pendingAttachmentsMap.get(messageId);
  pendingAttachmentsMap.delete(messageId);
  
  logger.info(`[PendingAttachments] Retrieved ${attachments.length} pending attachments for message ${messageId}`);
  return attachments;
}

/**
 * Check if there are pending attachments for a message without removing them.
 * @param {string} messageId - The message ID
 * @returns {boolean}
 */
function hasPendingAttachments(messageId) {
  return pendingAttachmentsMap.has(messageId) && pendingAttachmentsMap.get(messageId).length > 0;
}

/**
 * Remove a specific pending attachment.
 * @param {string} messageId - The message ID
 * @param {string} fileId - The file ID to remove
 */
function cleanupPendingAttachment(messageId, fileId) {
  if (!pendingAttachmentsMap.has(messageId)) {
    return;
  }

  const attachments = pendingAttachmentsMap.get(messageId);
  const index = attachments.findIndex(a => a.file_id === fileId);
  
  if (index !== -1) {
    attachments.splice(index, 1);
    logger.debug(`[PendingAttachments] Cleaned up expired attachment ${fileId} for message ${messageId}`);
  }

  if (attachments.length === 0) {
    pendingAttachmentsMap.delete(messageId);
  }
}

/**
 * Apply pending attachments to a message in MongoDB.
 * @param {string} userId - User ID for authorization
 * @param {string} messageId - Message ID to update
 * @returns {Promise<number>} Number of attachments applied
 */
async function applyPendingAttachments(userId, messageId) {
  const attachments = getPendingAttachments(messageId);
  
  if (attachments.length === 0) {
    return 0;
  }

  try {
    const mongoose = require('mongoose');
    const Message = mongoose.models.Message;
    if (!Message) {
      logger.error('[PendingAttachments] Message model not available');
      return 0;
    }

    // Clean up internal fields before saving
    const cleanedAttachments = attachments.map(({ _addedAt, ...rest }) => rest);

    const result = await Message.findOneAndUpdate(
      { messageId: messageId, user: userId },
      { $push: { attachments: { $each: cleanedAttachments } } },
      { new: true }
    );

    if (result) {
      logger.info(`[PendingAttachments] Applied ${cleanedAttachments.length} attachments to message ${messageId}`);
      return cleanedAttachments.length;
    } else {
      logger.warn(`[PendingAttachments] Message ${messageId} not found when applying attachments`);
      return 0;
    }
  } catch (error) {
    logger.error(`[PendingAttachments] Error applying attachments to message ${messageId}:`, error);
    return 0;
  }
}

/**
 * Get registry stats for debugging.
 * @returns {Object}
 */
function getStats() {
  let totalAttachments = 0;
  for (const attachments of pendingAttachmentsMap.values()) {
    totalAttachments += attachments.length;
  }
  return {
    pendingMessages: pendingAttachmentsMap.size,
    totalAttachments,
  };
}

module.exports = {
  addPendingAttachment,
  getPendingAttachments,
  hasPendingAttachments,
  applyPendingAttachments,
  getStats,
};
