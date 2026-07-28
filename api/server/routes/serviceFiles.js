/**
 * Service-to-Service File Upload Endpoint
 * 
 * This endpoint allows MCP servers to upload files on behalf of authenticated users.
 * It uses a service token for authentication and accepts the user ID via headers.
 * 
 * Security:
 * - Service token validation (shared secret between LibreChat and MCP servers)
 * - User ID must be provided and validated against the database
 * - Files are stored using the configured file strategy
 */

const express = require('express');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { logger } = require('@librechat/data-schemas');
const { FileSources, FileContext } = require('librechat-data-provider');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { sanitizeFilename, getStorageMetadata } = require('@librechat/api');
const { getAppConfig } = require('~/server/services/Config');
const db = require('~/models');

const router = express.Router();

/**
 * Service token validation middleware
 * Validates the X-Service-Token header against MCP_SERVICE_TOKEN env var
 */
const validateServiceToken = (req, res, next) => {
  const serviceToken = req.headers['x-service-token'];
  const expectedToken = process.env.MCP_SERVICE_TOKEN;

  if (!expectedToken) {
    logger.error('[ServiceFiles] MCP_SERVICE_TOKEN environment variable not configured');
    return res.status(500).json({ 
      success: false,
      error: 'Service not configured',
      message: 'MCP_SERVICE_TOKEN is not set on the server'
    });
  }

  if (!serviceToken) {
    logger.warn('[ServiceFiles] Missing X-Service-Token header');
    return res.status(401).json({ 
      success: false,
      error: 'Unauthorized',
      message: 'X-Service-Token header is required'
    });
  }

  if (serviceToken !== expectedToken) {
    logger.warn('[ServiceFiles] Invalid service token attempt');
    return res.status(401).json({ 
      success: false,
      error: 'Unauthorized',
      message: 'Invalid service token'
    });
  }

  next();
};

// Configure multer for file uploads
// Files are temporarily stored before being processed by the file strategy
const uploadDir = '/tmp/service-uploads/';

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: { 
    fileSize: 100 * 1024 * 1024, // 100MB max file size
    files: 1 // Only one file at a time
  },
});

/**
 * POST /api/service/files
 * 
 * Service-to-service file upload endpoint for MCP servers.
 * Allows MCP servers to upload files that will be associated with a specific user.
 * 
 * Required Headers:
 * - X-Service-Token: The service authentication token
 * - X-User-Id: The LibreChat user ID to associate the file with
 * 
 * Optional Headers:
 * - X-User-Email: User's email (for logging purposes)
 * - X-Conversation-Id: Associate file with a conversation
 * - X-Message-Id: Associate file with a message
 * 
 * Request Body:
 * - file: The file to upload (multipart/form-data)
 * 
 * Response:
 * {
 *   success: true,
 *   file: {
 *     file_id: "uuid",
 *     filename: "document.docx",
 *     filepath: "/path/to/file",
 *     type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
 *     bytes: 12345
 *   }
 * }
 */
router.post('/', validateServiceToken, upload.single('file'), async (req, res) => {
  const tempFilePath = req.file?.path;
  
  try {
    // Extract user context from headers
    const userId = req.headers['x-user-id'];
    const userEmail = req.headers['x-user-email'];
    const conversationId = req.headers['x-conversation-id'];
    const messageId = req.headers['x-message-id'];

    // Validate required headers
    if (!userId) {
      logger.warn('[ServiceFiles] Missing X-User-Id header');
      return res.status(400).json({ 
        success: false,
        error: 'Bad Request',
        message: 'X-User-Id header is required'
      });
    }

    if (!req.file) {
      logger.warn('[ServiceFiles] No file provided in request');
      return res.status(400).json({ 
        success: false,
        error: 'Bad Request',
        message: 'No file provided'
      });
    }

    logger.info(`[ServiceFiles] Processing file upload for user: ${userId}, email: ${userEmail || 'N/A'}`);
    logger.debug(`[ServiceFiles] File: ${req.file.originalname}, size: ${req.file.size}, type: ${req.file.mimetype}`);

    // Get app config for file strategy
    const appConfig = await getAppConfig();
    const fileStrategy = appConfig?.fileStrategy || FileSources.local;

    logger.debug(`[ServiceFiles] Using file strategy: ${fileStrategy}`);

    // Generate unique file ID
    const file_id = uuidv4();
    const sanitizedFilename = sanitizeFilename(req.file.originalname);

    // Get upload function for configured strategy
    const { handleFileUpload } = getStrategyFunctions(fileStrategy);

    if (!handleFileUpload) {
      throw new Error(`No upload handler found for strategy: ${fileStrategy}`);
    }

    // Create a mock request object for the upload function
    // This mimics what the regular file upload route provides
    const mockReq = {
      user: { id: userId },
      config: appConfig,
    };

    // Prepare file object matching what multer provides
    const fileObject = {
      path: tempFilePath,
      originalname: sanitizedFilename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      buffer: fs.readFileSync(tempFilePath),
    };

    // Upload file using configured strategy
    logger.debug(`[ServiceFiles] Uploading file using ${fileStrategy} strategy`);
    
    const uploadResult = await handleFileUpload({
      req: mockReq,
      file: fileObject,
      file_id,
    });

    logger.debug(`[ServiceFiles] Upload result:`, uploadResult);

    // Get storage metadata for the file
    const storageMetadata = getStorageMetadata({
      filepath: uploadResult.filepath,
      source: fileStrategy,
      storageKey: uploadResult.storageKey,
      storageRegion: uploadResult.storageRegion,
    });

    // Create file record in database
    const fileRecord = await db.createFile(
      {
        user: userId,
        file_id: uploadResult.id || file_id,
        bytes: uploadResult.bytes || req.file.size,
        filepath: uploadResult.filepath,
        ...storageMetadata,
        filename: sanitizedFilename,
        source: fileStrategy,
        type: req.file.mimetype,
        context: FileContext.message_attachment,
        // Optional: associate with conversation/message if provided
        ...(conversationId && { conversationId }),
        ...(messageId && { messageId }),
      },
      true, // disableTTL - don't auto-expire service-uploaded files
    );

    logger.info(`[ServiceFiles] File uploaded successfully: ${fileRecord.file_id} for user: ${userId}`);

    // If conversationId is provided, add file to conversation.files array
    if (conversationId) {
      try {
        const Conversation = mongoose.models.Conversation;
        if (Conversation) {
          const updateResult = await Conversation.updateOne(
            { conversationId, user: userId },
            { $addToSet: { files: fileRecord.file_id } }
          );
          
          if (updateResult.matchedCount > 0) {
            logger.info(`[ServiceFiles] Added file ${fileRecord.file_id} to conversation ${conversationId}`);
          } else {
            logger.warn(`[ServiceFiles] Conversation ${conversationId} not found for user ${userId}`);
          }
        } else {
          logger.warn('[ServiceFiles] Conversation model not available');
        }
      } catch (convError) {
        // Log but don't fail the request - file was uploaded successfully
        logger.error('[ServiceFiles] Error adding file to conversation:', convError);
      }
    }

    // Return success response
    res.status(200).json({
      success: true,
      file: {
        file_id: fileRecord.file_id,
        filename: fileRecord.filename,
        filepath: fileRecord.filepath,
        type: fileRecord.type,
        bytes: fileRecord.bytes,
        source: fileRecord.source,
      },
      user_id: userId,
    });

  } catch (error) {
    logger.error('[ServiceFiles] Upload error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Upload Failed',
      message: error.message || 'An error occurred during file upload'
    });
  } finally {
    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        logger.debug(`[ServiceFiles] Cleaned up temp file: ${tempFilePath}`);
      } catch (cleanupErr) {
        logger.warn(`[ServiceFiles] Failed to clean up temp file: ${tempFilePath}`, cleanupErr);
      }
    }
  }
});

/**
 * GET /api/service/files/health
 * 
 * Health check endpoint for the service files API.
 * Can be used by MCP servers to verify connectivity.
 */
router.get('/health', (req, res) => {
  const hasServiceToken = !!process.env.MCP_SERVICE_TOKEN;
  
  res.status(200).json({
    status: 'ok',
    service: 'service-files',
    configured: hasServiceToken,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
