const { logger } = require('~/config');
const { File } = require('~/db/models');
const UrlGeneratorService = require('~/server/services/Files/UrlGeneratorService');
const activeFileContextService = require('./ActiveFileContextService');

/**
 * Service for generating temporary file URLs for MCP server access
 * Handles conversation-specific file access with security and one-time use tokens
 */
class MCPFileUrlService {
  constructor() {
    this.defaultTtl = parseInt(process.env.MCP_FILE_URL_TTL) || 900; // 15 minutes default
    this.maxTtl = parseInt(process.env.MCP_FILE_URL_MAX_TTL) || 3600; // 1 hour max
    this.minTtl = parseInt(process.env.MCP_FILE_URL_MIN_TTL) || 60; // 1 minute min
  }

  /**
   * Generate temporary file URLs for current message context
   * This method gets recent files from the conversation when MCP tools are executed
   * @param {Object} options - Configuration options
   * @param {string} [options.conversationId] - The conversation ID
   * @param {string[]} [options.messageFiles] - Array of file IDs from current message (optional)
   * @param {string} options.userId - The user ID requesting access
   * @param {string} options.mcpClientId - The MCP client ID requesting access
   * @param {number} [options.ttlSeconds] - Time to live in seconds
   * @param {boolean} [options.singleUse=true] - Whether URLs are single-use
   * @param {string} [options.clientIP] - Client IP address
   * @param {string} [options.userAgent] - User agent string
   * @param {string} [options.requestId] - Request ID for tracking
   * @returns {Promise<string>} JSON string containing file URLs
   */
  async generateCurrentMessageFileUrls(options) {
    const {
      conversationId,
      messageFiles,
      userId,
      mcpClientId,
      ttlSeconds = this.defaultTtl,
      singleUse = true,
      clientIP,
      userAgent,
      requestId
    } = options;

    console.log('[MCPFileUrlService - STEP α] generateCurrentMessageFileUrls called:', {
      conversationId,
      messageFiles,
      messageFilesCount: messageFiles?.length || 0,
      userId,
      mcpClientId,
      hasMessageFiles: !!(messageFiles && messageFiles.length > 0),
      timestamp: new Date().toISOString()
    });

    try {
      // If we have specific message files, prioritize those
      if (messageFiles && messageFiles.length > 0) {
        console.log('[MCPFileUrlService - STEP β] Processing specific message files:', {
          conversationId,
          userId,
          mcpClientId,
          messageFiles,
          messageFileCount: messageFiles.length
        });

        const result = await this._generateSpecificFileUrls({
          fileIds: messageFiles,
          conversationId,
          userId,
          mcpClientId,
          ttlSeconds,
          singleUse,
          clientIP,
          userAgent,
          requestId
        });

        console.log('[MCPFileUrlService - STEP γ] Specific file URLs generated:', {
          conversationId,
          messageFileCount: messageFiles.length,
          resultLength: result?.length || 0,
          hasResult: !!result
        });

        return result;
      }

      // If we have a conversation ID, get recent files from the conversation
      if (conversationId) {
        logger.debug('Generating file URLs for conversation', {
          conversationId,
          userId,
          mcpClientId,
          requestId
        });

        return await this._generateRecentConversationFileUrls({
          conversationId,
          userId,
          mcpClientId,
          ttlSeconds,
          singleUse,
          clientIP,
          userAgent,
          requestId
        });
      }

      // No conversation context - return empty
      logger.info('No conversation context for MCP file URLs', {
        userId,
        mcpClientId,
        requestId
      });

      return JSON.stringify({
        files: [],
        message: 'No conversation context available',
        generatedAt: new Date().toISOString()
      });

    } catch (error) {
      console.error('[MCPFileUrlService] Error in generateCurrentMessageFileUrls:', {
        conversationId,
        messageFiles,
        userId,
        mcpClientId,
        error: error.message,
        stack: error.stack
      });

      logger.error('Failed to generate current message file URLs', {
        conversationId,
        messageFiles,
        userId,
        mcpClientId,
        error: error.message,
        stack: error.stack
      });

      return JSON.stringify({
        files: [],
        error: `Failed to generate file URLs: ${error.message}`,
        generatedAt: new Date().toISOString()
      });
    }
  }

  /**
   * Generate temporary file URLs for specific message files
   * @param {Object} options - Configuration options
   * @param {string[]} options.fileIds - Array of file IDs to generate URLs for
   * @param {string} [options.conversationId] - The conversation ID
   * @param {string} [options.messageId] - The message ID
   * @param {string} options.userId - The user ID requesting access
   * @param {string} options.mcpClientId - The MCP client ID requesting access
   * @param {number} [options.ttlSeconds] - Time to live in seconds
   * @param {boolean} [options.singleUse=true] - Whether URLs are single-use
   * @param {string} [options.clientIP] - Client IP address
   * @param {string} [options.userAgent] - User agent string
   * @param {string} [options.requestId] - Request ID for tracking
   * @returns {Promise<string>} JSON string containing file URLs
   */
  async generateMessageFileUrls(options) {
    const {
      fileIds,
      conversationId,
      messageId,
      userId,
      mcpClientId,
      ttlSeconds = this.defaultTtl,
      singleUse = true,
      clientIP,
      userAgent,
      requestId
    } = options;

    try {
      // Validate inputs
      this._validateMessageFileInputs({ fileIds, userId, mcpClientId, ttlSeconds });

      if (!fileIds || fileIds.length === 0) {
        logger.info('No file IDs provided for message file URLs', {
          conversationId,
          messageId,
          userId,
          mcpClientId
        });
        return JSON.stringify({ files: [], message: 'No files provided' });
      }

      // Get specific files by their IDs
      const files = await this._getMessageFiles(fileIds, userId);

      if (!files || files.length === 0) {
        logger.info('No accessible files found for provided file IDs', {
          fileIds,
          conversationId,
          messageId,
          userId,
          mcpClientId
        });
        return JSON.stringify({ files: [], message: 'No accessible files found' });
      }

      // Generate URLs for each file
      const fileUrls = await Promise.all(
        files.map(async (file) => {
          try {
            const urlData = await UrlGeneratorService.generateDownloadUrl(file.file_id, {
              ttlSeconds,
              singleUse,
              userId,
              clientIP,
              userAgent,
              requestId,
              mcpClientId,
              metadata: {
                conversationId,
                messageId,
                filename: file.filename,
                fileType: file.type,
                fileSize: file.bytes
              }
            });

            return {
              fileId: file.file_id,
              filename: file.filename,
              type: file.type,
              size: file.bytes,
              downloadUrl: urlData.downloadUrl,
              expiresAt: urlData.expiresAt,
              singleUse: urlData.singleUse
            };
          } catch (error) {
            logger.error('Failed to generate URL for message file', {
              fileId: file.file_id,
              conversationId,
              messageId,
              userId,
              mcpClientId,
              error: error.message
            });
            return null;
          }
        })
      );

      // Filter out failed URL generations
      const validFileUrls = fileUrls.filter(url => url !== null);

      const result = {
        conversationId,
        messageId,
        files: validFileUrls,
        generatedAt: new Date().toISOString(),
        ttlSeconds,
        singleUse
      };

      logger.info('Generated message file URLs for MCP client', {
        conversationId,
        messageId,
        userId,
        mcpClientId,
        fileCount: validFileUrls.length,
        ttlSeconds,
        requestId
      });

      return JSON.stringify(result);

    } catch (error) {
      logger.error('Failed to generate message file URLs', {
        fileIds,
        conversationId,
        messageId,
        userId,
        mcpClientId,
        error: error.message,
        stack: error.stack
      });

      // Return empty result on error to prevent MCP server failures
      return JSON.stringify({
        files: [],
        error: 'Failed to generate file URLs',
        generatedAt: new Date().toISOString()
      });
    }
  }

  /**
   * Generate temporary file URLs for all files in a conversation
   * @param {Object} options - Configuration options
   * @param {string} options.conversationId - The conversation ID
   * @param {string} options.userId - The user ID requesting access
   * @param {string} options.mcpClientId - The MCP client ID requesting access
   * @param {number} [options.ttlSeconds] - Time to live in seconds
   * @param {boolean} [options.singleUse=true] - Whether URLs are single-use
   * @param {string} [options.clientIP] - Client IP address
   * @param {string} [options.userAgent] - User agent string
   * @param {string} [options.requestId] - Request ID for tracking
   * @returns {Promise<string>} JSON string containing file URLs
   */
  async generateConversationFileUrls(options) {
    const {
      conversationId,
      userId,
      mcpClientId,
      ttlSeconds = this.defaultTtl,
      singleUse = true,
      clientIP,
      userAgent,
      requestId
    } = options;

    try {
      // Validate inputs
      this._validateInputs({ conversationId, userId, mcpClientId, ttlSeconds });

      // Get all files for the conversation
      const files = await this._getConversationFiles(conversationId, userId);

      if (!files || files.length === 0) {
        logger.info('No files found for conversation', {
          conversationId,
          userId,
          mcpClientId
        });
        return JSON.stringify({ files: [] });
      }

      // Generate URLs for each file
      const fileUrls = await Promise.all(
        files.map(async (file) => {
          try {
            const urlData = await UrlGeneratorService.generateDownloadUrl(file.file_id, {
              ttlSeconds,
              singleUse,
              userId,
              clientIP,
              userAgent,
              requestId,
              mcpClientId,
              metadata: {
                conversationId,
                filename: file.filename,
                fileType: file.type,
                fileSize: file.bytes
              }
            });

            return {
              fileId: file.file_id,
              filename: file.filename,
              type: file.type,
              size: file.bytes,
              downloadUrl: urlData.downloadUrl,
              expiresAt: urlData.expiresAt,
              singleUse: urlData.singleUse
            };
          } catch (error) {
            logger.error('Failed to generate URL for file', {
              fileId: file.file_id,
              conversationId,
              userId,
              mcpClientId,
              error: error.message
            });
            return null;
          }
        })
      );

      // Filter out failed URL generations
      const validFileUrls = fileUrls.filter(url => url !== null);

      const result = {
        conversationId,
        files: validFileUrls,
        generatedAt: new Date().toISOString(),
        ttlSeconds,
        singleUse
      };

      logger.info('Generated file URLs for MCP client', {
        conversationId,
        userId,
        mcpClientId,
        fileCount: validFileUrls.length,
        ttlSeconds,
        requestId
      });

      return JSON.stringify(result);

    } catch (error) {
      logger.error('Failed to generate conversation file URLs', {
        conversationId,
        userId,
        mcpClientId,
        error: error.message,
        stack: error.stack
      });
      
      // Return empty result on error to prevent MCP server failures
      return JSON.stringify({ 
        files: [], 
        error: 'Failed to generate file URLs',
        generatedAt: new Date().toISOString()
      });
    }
  }

  /**
   * Get specific files by their IDs that the user has access to
   * @param {string[]} fileIds - Array of file IDs
   * @param {string} userId - The user ID
   * @returns {Promise<Array>} Array of file documents
   * @private
   */
  async _getMessageFiles(fileIds, userId) {
    try {
      const files = await File.find({
        file_id: { $in: fileIds },
        user: userId,
        downloadEnabled: { $ne: false } // Only include files where downloads are enabled
      }).select('file_id filename type bytes filepath source createdAt updatedAt');

      return files;
    } catch (error) {
      logger.error('Failed to fetch message files', {
        fileIds,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate file URLs for specific file IDs
   * @param {Object} options - Configuration options
   * @private
   */
  async _generateSpecificFileUrls(options) {
    const {
      fileIds,
      conversationId,
      userId,
      mcpClientId,
      ttlSeconds,
      singleUse,
      clientIP,
      userAgent,
      requestId
    } = options;

    try {
      console.log('[MCPFileUrlService - STEP δ] Generating URLs for specific files:', {
        fileIds,
        fileIdsCount: fileIds?.length || 0,
        conversationId,
        userId,
        mcpClientId,
        timestamp: new Date().toISOString()
      });

      // Try to get files from active context first
      const activeContext = activeFileContextService.getActiveFiles(conversationId, userId);
      let files = [];
      let source = 'no_files';

      if (activeContext && activeContext.files.length > 0) {
        // Filter active context files to only include the requested file IDs
        files = activeContext.files.filter(file => fileIds.includes(file.file_id));
        source = 'active_context';

        console.log('[MCPFileUrlService] Filtered files from active context:', {
          requestedFileIds: fileIds,
          availableFiles: activeContext.files.map(f => ({ file_id: f.file_id, filename: f.filename })),
          filteredFiles: files.map(f => ({ file_id: f.file_id, filename: f.filename })),
          filteredCount: files.length
        });
      }

      // If we didn't find all files in active context, query database for missing ones
      if (files.length < fileIds.length) {
        const foundFileIds = files.map(f => f.file_id);
        const missingFileIds = fileIds.filter(id => !foundFileIds.includes(id));

        console.log('[MCPFileUrlService] Querying database for missing files:', {
          missingFileIds,
          foundInActiveContext: foundFileIds.length
        });

        const dbFiles = await File.find({
          file_id: { $in: missingFileIds },
          user: userId,
          downloadEnabled: { $ne: false }
        }).lean();

        if (dbFiles.length > 0) {
          files = files.concat(dbFiles);
          source = files.length === fileIds.length ? 'mixed_sources' : 'partial_sources';

          console.log('[MCPFileUrlService] Added files from database:', {
            dbFileCount: dbFiles.length,
            totalFileCount: files.length,
            requestedCount: fileIds.length
          });
        }
      }

      if (files.length === 0) {
        console.log('[MCPFileUrlService] No files found for specific file IDs:', {
          fileIds,
          conversationId,
          userId
        });

        return JSON.stringify({
          files: [],
          message: 'No accessible files found for the specified file IDs',
          generatedAt: new Date().toISOString(),
          source: 'no_files'
        });
      }

      // Generate URLs for each file
      const fileUrls = await Promise.all(
        files.map(async (file) => {
          try {
            const urlData = await UrlGeneratorService.generateDownloadUrl(file.file_id, {
              ttlSeconds,
              singleUse,
              userId,
              clientIP,
              userAgent,
              requestId,
              mcpClientId,
              metadata: {
                conversationId,
                filename: file.filename,
                fileType: file.type,
                fileSize: file.bytes,
                source: source
              }
            });

            return {
              fileId: file.file_id,
              filename: file.filename,
              type: file.type,
              size: file.bytes,
              downloadUrl: urlData.downloadUrl,
              expiresAt: urlData.expiresAt,
              singleUse: urlData.singleUse,
              source: source
            };
          } catch (error) {
            logger.error('Failed to generate URL for specific file', {
              fileId: file.file_id,
              conversationId,
              userId,
              mcpClientId,
              error: error.message
            });
            return null;
          }
        })
      );

      // Filter out failed URL generations
      const validFileUrls = fileUrls.filter(url => url !== null);

      const result = {
        conversationId,
        files: validFileUrls,
        source: source,
        generatedAt: new Date().toISOString(),
        ttlSeconds,
        singleUse
      };

      console.log('[MCPFileUrlService] Generated specific file URLs:', {
        conversationId,
        userId,
        mcpClientId,
        requestedFileCount: fileIds.length,
        generatedUrlCount: validFileUrls.length,
        source: source
      });

      logger.info('Generated specific file URLs for MCP access', {
        conversationId,
        userId,
        mcpClientId,
        requestedFileCount: fileIds.length,
        generatedUrlCount: validFileUrls.length,
        source: source
      });

      return JSON.stringify(result);

    } catch (error) {
      console.error('[MCPFileUrlService] Error in _generateSpecificFileUrls:', {
        fileIds,
        conversationId,
        userId,
        mcpClientId,
        error: error.message,
        stack: error.stack
      });

      logger.error('Failed to generate specific file URLs', {
        fileIds,
        conversationId,
        userId,
        mcpClientId,
        error: error.message,
        stack: error.stack
      });

      return JSON.stringify({
        files: [],
        error: `Failed to generate file URLs: ${error.message}`,
        generatedAt: new Date().toISOString()
      });
    }
  }

  /**
   * Generate file URLs for recent files in a conversation (fallback method)
   * @param {Object} options - Configuration options
   * @private
   */
  async _generateRecentConversationFileUrls(options) {
    const {
      conversationId,
      userId,
      mcpClientId,
      ttlSeconds,
      singleUse,
      clientIP,
      userAgent,
      requestId
    } = options;

    try {
      console.log('[MCPFileUrlService] Querying for conversation files:', {
        conversationId,
        userId,
        mcpClientId,
        timestamp: new Date().toISOString()
      });

      // Try to get files from active context first (real-time approach)
      const activeContext = activeFileContextService.getActiveFiles(conversationId, userId);

      // Also get service stats for debugging
      const serviceStats = activeFileContextService.getStats();

      console.log('[MCPFileUrlService] Active file context:', {
        conversationId,
        userId,
        hasActiveContext: !!activeContext,
        activeFileCount: activeContext?.files?.length || 0,
        capturedAt: activeContext?.capturedAt
      });

      console.log('[MCPFileUrlService] Service stats:', {
        totalActiveContexts: serviceStats.activeContexts,
        allContexts: serviceStats.contexts
      });

      let files = [];
      let source = 'no_files';

      if (activeContext && activeContext.files.length > 0) {
        // Use files from active context (real-time)
        files = activeContext.files;
        source = 'active_context';

        console.log('[MCPFileUrlService] Using files from active context:', {
          conversationId,
          userId,
          fileCount: files.length,
          files: files.map(f => ({ file_id: f.file_id, filename: f.filename }))
        });
      } else {
        // Try to get most recent active files for this user (conversation ID mismatch fallback)
        console.log('[MCPFileUrlService] No active context for conversation, trying most recent active files...');

        const recentActiveContext = activeFileContextService.getMostRecentActiveFiles(userId);

        if (recentActiveContext && recentActiveContext.files.length > 0) {
          files = recentActiveContext.files;
          source = 'recent_active_context';

          console.log('[MCPFileUrlService] Using files from recent active context:', {
            requestedConversationId: conversationId,
            actualConversationId: recentActiveContext.conversationId,
            userId,
            fileCount: files.length,
            files: files.map(f => ({ file_id: f.file_id, filename: f.filename }))
          });
        } else {
          // Final fallback to recent user files from database
          console.log('[MCPFileUrlService] No recent active context, falling back to database files...');

          files = await File.find({
            user: userId,
            $or: [
              { downloadEnabled: { $ne: false } },
              { downloadEnabled: { $exists: false } }
            ]
          })
          .sort({ createdAt: -1 })
          .limit(5)
          .select('file_id filename type bytes filepath source createdAt updatedAt');

          source = 'recent_user_files';

          console.log('[MCPFileUrlService] Database fallback found files:', {
            userId,
            fileCount: files?.length || 0,
            files: files?.map(f => ({ file_id: f.file_id, filename: f.filename, createdAt: f.createdAt })) || []
          });
        }
      }



      console.log('[MCPFileUrlService] Found files with query criteria:', {
        conversationId,
        userId,
        fileCount: files?.length || 0,
        files: files?.map(f => ({ file_id: f.file_id, filename: f.filename })) || []
      });

      if (!files || files.length === 0) {
        return JSON.stringify({
          files: [],
          message: 'No recent files found for user',
          generatedAt: new Date().toISOString()
        });
      }

      // Generate URLs for each file
      const fileUrls = await Promise.all(
        files.map(async (file) => {
          try {
            const urlData = await UrlGeneratorService.generateDownloadUrl(file.file_id, {
              ttlSeconds,
              singleUse,
              userId,
              clientIP,
              userAgent,
              requestId,
              mcpClientId,
              metadata: {
                conversationId,
                filename: file.filename,
                fileType: file.type,
                fileSize: file.bytes,
                source: source
              }
            });

            return {
              fileId: file.file_id,
              filename: file.filename,
              type: file.type,
              size: file.bytes,
              downloadUrl: urlData.downloadUrl,
              expiresAt: urlData.expiresAt,
              singleUse: urlData.singleUse,
              source: source
            };
          } catch (error) {
            logger.error('Failed to generate URL for recent conversation file', {
              fileId: file.file_id,
              conversationId,
              userId,
              mcpClientId,
              error: error.message
            });
            return null;
          }
        })
      );

      // Filter out failed URL generations
      const validFileUrls = fileUrls.filter(url => url !== null);



      const result = {
        conversationId,
        files: validFileUrls,
        source,
        generatedAt: new Date().toISOString(),
        ttlSeconds,
        singleUse
      };

      logger.info('Generated recent conversation file URLs for MCP client', {
        conversationId,
        userId,
        mcpClientId,
        fileCount: validFileUrls.length,
        ttlSeconds,
        requestId
      });

      return JSON.stringify(result);

    } catch (error) {
      console.error('[MCPFileUrlService] Error in _generateRecentConversationFileUrls:', {
        conversationId,
        userId,
        mcpClientId,
        error: error.message,
        stack: error.stack
      });

      logger.error('Failed to generate recent conversation file URLs', {
        conversationId,
        userId,
        mcpClientId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * DEPRECATED: Get all files associated with a conversation that the user has access to
   * This method is no longer used by the real-time file access system.
   * @param {string} conversationId - The conversation ID
   * @param {string} userId - The user ID
   * @returns {Promise<Array>} Array of file documents
   * @private
   * @deprecated Use ActiveFileContextService instead
   */
  async _getConversationFiles(conversationId, userId) {
    try {
      const files = await File.find({
        conversationId,
        user: userId,
        downloadEnabled: { $ne: false } // Only include files where downloads are enabled
      }).select('file_id filename type bytes filepath source createdAt updatedAt');

      return files;
    } catch (error) {
      logger.error('Failed to fetch conversation files', {
        conversationId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate input parameters for message file URLs
   * @param {Object} params - Parameters to validate
   * @private
   */
  _validateMessageFileInputs({ fileIds, userId, mcpClientId, ttlSeconds }) {
    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      throw new Error('Valid file IDs array is required');
    }

    if (!userId || typeof userId !== 'string') {
      throw new Error('Valid user ID is required');
    }

    if (!mcpClientId || typeof mcpClientId !== 'string') {
      throw new Error('Valid MCP client ID is required');
    }

    if (ttlSeconds < this.minTtl || ttlSeconds > this.maxTtl) {
      throw new Error(`TTL must be between ${this.minTtl} and ${this.maxTtl} seconds`);
    }
  }

  /**
   * Validate input parameters for conversation file URLs
   * @param {Object} params - Parameters to validate
   * @private
   */
  _validateInputs({ conversationId, userId, mcpClientId, ttlSeconds }) {
    if (!conversationId || typeof conversationId !== 'string') {
      throw new Error('Valid conversation ID is required');
    }

    if (!userId || typeof userId !== 'string') {
      throw new Error('Valid user ID is required');
    }

    if (!mcpClientId || typeof mcpClientId !== 'string') {
      throw new Error('Valid MCP client ID is required');
    }

    if (ttlSeconds < this.minTtl || ttlSeconds > this.maxTtl) {
      throw new Error(`TTL must be between ${this.minTtl} and ${this.maxTtl} seconds`);
    }
  }

  /**
   * Generate a single file URL for MCP access
   * @param {Object} options - Configuration options
   * @param {string} options.fileId - The file ID
   * @param {string} options.userId - The user ID requesting access
   * @param {string} options.mcpClientId - The MCP client ID requesting access
   * @param {number} [options.ttlSeconds] - Time to live in seconds
   * @param {boolean} [options.singleUse=true] - Whether URL is single-use
   * @param {string} [options.clientIP] - Client IP address
   * @param {string} [options.userAgent] - User agent string
   * @param {string} [options.requestId] - Request ID for tracking
   * @returns {Promise<string>} The download URL
   */
  async generateSingleFileUrl(options) {
    const {
      fileId,
      userId,
      mcpClientId,
      ttlSeconds = this.defaultTtl,
      singleUse = true,
      clientIP,
      userAgent,
      requestId
    } = options;

    try {
      // Validate file exists and user has access
      const file = await File.findOne({
        file_id: fileId,
        user: userId,
        downloadEnabled: { $ne: false }
      });

      if (!file) {
        throw new Error('File not found or access denied');
      }

      const urlData = await UrlGeneratorService.generateDownloadUrl(fileId, {
        ttlSeconds,
        singleUse,
        userId,
        clientIP,
        userAgent,
        requestId,
        mcpClientId,
        metadata: {
          filename: file.filename,
          fileType: file.type,
          fileSize: file.bytes
        }
      });

      logger.info('Generated single file URL for MCP client', {
        fileId,
        userId,
        mcpClientId,
        ttlSeconds,
        requestId
      });

      return urlData.downloadUrl;

    } catch (error) {
      logger.error('Failed to generate single file URL', {
        fileId,
        userId,
        mcpClientId,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new MCPFileUrlService();
