const { logger } = require('~/config');

/**
 * ActiveFileContextService - Real-time file interception for MCP access
 * 
 * This service captures file data during message processing pipeline,
 * providing immediate access to files without database timing issues.
 */
class ActiveFileContextService {
  constructor() {
    // Store active file contexts by conversation ID
    this.activeContexts = new Map();
    
    // Cleanup old contexts after 10 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Capture files from an active message request
   * @param {string} conversationId - The conversation ID
   * @param {string} userId - The user ID
   * @param {Array} files - Array of file objects from req.body.files
   * @param {Object} requestContext - Additional request context
   */
  captureFiles(conversationId, userId, files = [], requestContext = {}) {
    if (!conversationId || !userId) {
      logger.warn('[ActiveFileContextService] Missing conversationId or userId for file capture');
      return;
    }

    // Get existing context or create new one
    const existingContext = this.activeContexts.get(conversationId);
    const existingFiles = existingContext?.files || [];

    // Create map of existing files by file_id for deduplication
    const existingFileMap = new Map();
    existingFiles.forEach(file => {
      if (file.file_id) {
        existingFileMap.set(file.file_id, file);
      }
    });

    // Add new files, avoiding duplicates
    const newFiles = files.map(file => ({
      file_id: file.file_id,
      filename: file.filename,
      filepath: file.filepath,
      type: file.type,
      bytes: file.bytes,
      width: file.width,
      height: file.height,
      source: file.source,
      temp_file_id: file.temp_file_id,
      embedded: file.embedded
    }));

    // Merge files, with new files taking precedence
    newFiles.forEach(file => {
      if (file.file_id) {
        existingFileMap.set(file.file_id, file);
      }
    });

    const allFiles = Array.from(existingFileMap.values());

    const context = {
      conversationId,
      userId,
      files: allFiles,
      capturedAt: new Date(),
      requestContext: {
        endpoint: requestContext.endpoint,
        messageId: requestContext.messageId,
        parentMessageId: requestContext.parentMessageId,
        model: requestContext.model
      }
    };

    this.activeContexts.set(conversationId, context);

    console.log('[ActiveFileContextService] Captured files for conversation:', {
      conversationId,
      userId,
      totalFileCount: allFiles.length,
      newFileCount: files.length,
      existingFileCount: existingFiles.length,
      allFiles: allFiles.map(f => ({ file_id: f.file_id, filename: f.filename })),
      newFiles: files.map(f => ({ file_id: f.file_id, filename: f.filename }))
    });

    logger.info('[ActiveFileContextService] Captured files for conversation:', {
      conversationId,
      userId,
      totalFileCount: allFiles.length,
      newFileCount: files.length,
      existingFileCount: existingFiles.length
    });
  }

  /**
   * Get active files for a conversation
   * @param {string} conversationId - The conversation ID
   * @param {string} userId - The user ID for security
   * @returns {Object|null} Active file context or null
   */
  getActiveFiles(conversationId, userId) {
    if (!conversationId || !userId) {
      return null;
    }

    const context = this.activeContexts.get(conversationId);

    if (!context) {
      logger.debug('[ActiveFileContextService] No active context found for conversation:', {
        conversationId,
        userId,
        availableContexts: Array.from(this.activeContexts.keys())
      });
      return null;
    }

    // Security check - ensure user matches
    if (context.userId !== userId) {
      logger.warn('[ActiveFileContextService] User ID mismatch for conversation access:', {
        conversationId,
        requestedUserId: userId,
        contextUserId: context.userId
      });
      return null;
    }

    // Check if context is still fresh (within 30 minutes)
    const age = Date.now() - context.capturedAt.getTime();
    const maxAge = 30 * 60 * 1000; // 30 minutes

    if (age > maxAge) {
      logger.debug('[ActiveFileContextService] Context expired for conversation:', {
        conversationId,
        ageMinutes: Math.round(age / 60000)
      });
      this.activeContexts.delete(conversationId);
      return null;
    }

    logger.info('[ActiveFileContextService] Retrieved active files for conversation:', {
      conversationId,
      userId,
      fileCount: context.files.length,
      ageMinutes: Math.round(age / 60000)
    });

    return context;
  }

  /**
   * Get the most recent active files for a user (fallback when conversation ID doesn't match)
   * @param {string} userId - The user ID
   * @returns {Object|null} Most recent active file context or null
   */
  getMostRecentActiveFiles(userId) {
    if (!userId) {
      return null;
    }

    let mostRecentContext = null;
    let mostRecentTime = 0;

    for (const [conversationId, context] of this.activeContexts.entries()) {
      if (context.userId === userId && context.capturedAt.getTime() > mostRecentTime) {
        // Check if context is still fresh (within 30 minutes)
        const age = Date.now() - context.capturedAt.getTime();
        const maxAge = 30 * 60 * 1000; // 30 minutes

        if (age <= maxAge) {
          mostRecentContext = context;
          mostRecentTime = context.capturedAt.getTime();
        }
      }
    }

    if (mostRecentContext) {
      logger.info('[ActiveFileContextService] Retrieved most recent active files for user:', {
        userId,
        conversationId: mostRecentContext.conversationId,
        fileCount: mostRecentContext.files.length,
        ageMinutes: Math.round((Date.now() - mostRecentContext.capturedAt.getTime()) / 60000)
      });
    }

    return mostRecentContext;
  }

  /**
   * Clear files for a specific conversation
   * @param {string} conversationId - The conversation ID
   */
  clearFiles(conversationId) {
    if (this.activeContexts.has(conversationId)) {
      this.activeContexts.delete(conversationId);
      logger.debug('[ActiveFileContextService] Cleared files for conversation:', { conversationId });
    }
  }

  /**
   * Cleanup expired contexts
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes
    let cleanedCount = 0;

    for (const [conversationId, context] of this.activeContexts.entries()) {
      const age = now - context.capturedAt.getTime();
      if (age > maxAge) {
        this.activeContexts.delete(conversationId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('[ActiveFileContextService] Cleaned up expired contexts:', {
        cleanedCount,
        remainingCount: this.activeContexts.size
      });
    }
  }

  /**
   * Get statistics about active contexts
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      activeContexts: this.activeContexts.size,
      contexts: Array.from(this.activeContexts.entries()).map(([conversationId, context]) => ({
        conversationId,
        userId: context.userId,
        fileCount: context.files.length,
        ageMinutes: Math.round((Date.now() - context.capturedAt.getTime()) / 60000)
      }))
    };
  }

  /**
   * Shutdown the service
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.activeContexts.clear();
    logger.info('[ActiveFileContextService] Service shutdown complete');
  }
}

// Create singleton instance
const activeFileContextService = new ActiveFileContextService();

module.exports = activeFileContextService;
