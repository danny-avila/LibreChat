const { logger } = require('~/config');
const { File } = require('~/db/models');
const UrlGeneratorService = require('./UrlGeneratorService');
const TokenStorageService = require('./TokenStorageService');
const { getStrategyFunctions } = require('./strategies');
const { FileSources, checkOpenAIStorage } = require('librechat-data-provider');
const { getOpenAIClient } = require('~/server/services/Endpoints/openAI');

/**
 * Download Service for handling temporary file downloads with token validation
 *
 * Note: This service supports both browser and command-line tool access.
 * The uaParser middleware has been removed from the public download endpoint
 * to allow tools like wget, curl, etc. to access temporary download URLs.
 * Security is maintained through token-based authentication.
 */
class DownloadService {
  /**
   * Handle a download request with token validation
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async handleDownloadRequest(req, res) {
    const { fileId } = req.params;
    const { token } = req.query;
    const clientIP = req.ip || req.connection?.remoteAddress;
    const userAgent = req.get('User-Agent');
    const requestId = req.headers['x-request-id'] || `download-${Date.now()}`;

    // Log download attempt with User-Agent for debugging command-line tool access
    logger.info('File download request received', {
      fileId,
      clientIP,
      userAgent,
      requestId,
      hasToken: !!token,
      isCommandLineTool: !userAgent || !userAgent.includes('Mozilla')
    });

    try {
      // Validate required parameters
      if (!fileId) {
        return res.status(400).json({
          error: 'File ID is required',
          code: 'MISSING_FILE_ID'
        });
      }

      if (!token) {
        return res.status(400).json({
          error: 'Download token is required',
          code: 'MISSING_TOKEN'
        });
      }

      // Validate and decode the token
      let tokenPayload;
      try {
        tokenPayload = await UrlGeneratorService.validateToken(token);
      } catch (error) {
        logger.warn('Invalid download token', {
          fileId,
          clientIP,
          userAgent,
          error: error.message,
          requestId
        });
        
        return res.status(401).json({
          error: 'Invalid or expired token',
          code: 'INVALID_TOKEN'
        });
      }

      // Verify token is for the requested file
      if (tokenPayload.fileId !== fileId) {
        logger.warn('Token file ID mismatch', {
          requestedFileId: fileId,
          tokenFileId: tokenPayload.fileId,
          clientIP,
          requestId
        });
        
        return res.status(403).json({
          error: 'Token not valid for this file',
          code: 'TOKEN_FILE_MISMATCH'
        });
      }

      // Check token usage in database
      const tokenHash = UrlGeneratorService._hashToken(token);
      const storedToken = await TokenStorageService.findValidToken(tokenHash);
      
      if (!storedToken) {
        logger.warn('Token not found or already used', {
          fileId,
          clientIP,
          userAgent,
          requestId
        });
        
        return res.status(401).json({
          error: 'Token not found or already used',
          code: 'TOKEN_NOT_FOUND'
        });
      }

      if (!storedToken.canBeUsed()) {
        logger.warn('Token cannot be used', {
          fileId,
          tokenStatus: storedToken.status,
          clientIP,
          requestId
        });
        
        return res.status(401).json({
          error: 'Token has expired or been used',
          code: 'TOKEN_UNUSABLE'
        });
      }

      // Get file information
      const file = await File.findOne({ file_id: fileId });

      console.log('[DownloadService] File information:', {
        fileId,
        found: !!file,
        filename: file?.filename,
        source: file?.source,
        filepath: file?.filepath,
        user: file?.user?.toString(),
        downloadEnabled: file?.downloadEnabled
      });

      if (!file) {
        logger.warn('File not found for download', {
          fileId,
          userId: tokenPayload.userId,
          clientIP,
          requestId
        });

        return res.status(404).json({
          error: 'File not found',
          code: 'FILE_NOT_FOUND'
        });
      }

      // Verify file ownership matches token
      if (file.user.toString() !== tokenPayload.userId) {
        logger.warn('File ownership mismatch', {
          fileId,
          fileUserId: file.user.toString(),
          tokenUserId: tokenPayload.userId,
          clientIP,
          requestId
        });
        
        return res.status(403).json({
          error: 'Access denied',
          code: 'ACCESS_DENIED'
        });
      }

      // Check if downloads are enabled for this file
      if (file.downloadEnabled === false) {
        return res.status(403).json({
          error: 'Downloads not enabled for this file',
          code: 'DOWNLOADS_DISABLED'
        });
      }

      // Mark token as used (if single-use)
      if (storedToken.singleUse) {
        await storedToken.markAsUsed();
      }

      // Set response headers
      const setHeaders = () => {
        res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
        res.setHeader('Content-Type', file.type || 'application/octet-stream');
        if (file.bytes) {
          res.setHeader('Content-Length', file.bytes);
        }
        
        // Security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      };

      // Stream the file based on storage source
      if (checkOpenAIStorage(file.source)) {
        // Handle OpenAI/Azure file downloads
        const endpointMap = {
          [FileSources.openai]: 'assistants',
          [FileSources.azure]: 'azureAssistants',
        };
        
        const mockReq = {
          body: { model: file.model },
          user: { id: tokenPayload.userId }
        };
        
        const { openai } = await getOpenAIClient({
          req: mockReq,
          res,
          overrideEndpoint: endpointMap[file.source],
        });
        
        const { getDownloadStream } = getStrategyFunctions(file.source);
        const passThrough = await getDownloadStream(fileId, openai);
        
        setHeaders();
        logger.info('File download started (OpenAI)', {
          fileId,
          filename: file.filename,
          userId: tokenPayload.userId,
          clientIP,
          requestId
        });
        
        passThrough.body.pipe(res);
      } else {
        // Handle local/S3/Firebase file downloads
        const { getDownloadStream } = getStrategyFunctions(file.source);

        if (!getDownloadStream) {
          logger.error('No download stream method for file source', {
            fileId,
            source: file.source,
            requestId
          });

          return res.status(501).json({
            error: 'Download not supported for this file type',
            code: 'DOWNLOAD_NOT_SUPPORTED'
          });
        }

        // Create a mock request object with necessary properties for file streaming
        // Use the same paths configuration as the main app
        const paths = require('~/config/paths');
        const mockReq = {
          app: {
            locals: {
              paths: paths
            }
          }
        };

        const fileStream = await getDownloadStream(mockReq, file.filepath);

        setHeaders();
        logger.info('File download started', {
          fileId,
          filename: file.filename,
          userId: tokenPayload.userId,
          source: file.source,
          filepath: file.filepath,
          clientIP,
          requestId
        });

        fileStream.pipe(res);
      }

      // Log successful download
      logger.info('File download completed', {
        fileId,
        filename: file.filename,
        userId: tokenPayload.userId,
        clientIP,
        userAgent,
        mcpClientId: tokenPayload.mcpClientId,
        requestId
      });

    } catch (error) {
      logger.error('Download request failed', {
        fileId,
        clientIP,
        userAgent,
        error: error.message,
        stack: error.stack,
        requestId,
        errorType: error.constructor.name,
        errorCode: error.code
      });

      // Log additional context for debugging
      logger.error('Download error context', {
        fileId,
        hasToken: !!token,
        tokenLength: token ? token.length : 0,
        requestMethod: req.method,
        requestUrl: req.url,
        requestId
      });

      if (!res.headersSent) {
        res.status(500).json({
          error: 'Download failed',
          code: 'DOWNLOAD_FAILED',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    }
  }
}

module.exports = DownloadService;
