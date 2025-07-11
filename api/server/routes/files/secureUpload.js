const express = require('express');
const { logger } = require('~/config');
const { processSecureFileUpload } = require('~/server/services/Files/process');

const router = express.Router();

/**
 * Secure file upload endpoint that generates one-time download links
 * POST /api/files/secure-upload
 */
router.post('/', async (req, res) => {
  let cleanup = true;
  const fs = require('fs').promises;

  try {
    // Validate file upload
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        code: 'NO_FILE'
      });
    }

    // File filtering is handled by the secure multer instance

    // Extract metadata from request body
    const metadata = {
      file_id: req.file_id,
      temp_file_id: req.file_id,
      endpoint: req.body.endpoint || 'default',
      conversationId: req.body.conversationId,
      messageId: req.body.messageId,
      generateDownloadLink: true, // Flag to indicate we want a download link
      ttlSeconds: parseInt(req.body.ttlSeconds) || 900, // Default 15 minutes
      singleUse: req.body.singleUse !== 'false' // Default true
    };

    logger.info('Processing secure file upload', {
      fileId: metadata.file_id,
      userId: req.user.id,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

    // Process the file upload and generate download link
    const result = await processSecureFileUpload({ req, res, metadata });
    
    cleanup = false; // File processed successfully, don't delete
    
    res.status(200).json({
      message: 'File uploaded successfully with secure download link',
      ...result
    });

  } catch (error) {
    logger.error('[/files/secure-upload] Error processing file:', error);
    
    let message = 'Error processing file upload';
    let statusCode = 500;
    
    if (error.message?.includes('Invalid file format')) {
      message = error.message;
      statusCode = 400;
    } else if (error.message?.includes('File too large')) {
      message = error.message;
      statusCode = 413;
    } else if (error.message?.includes('Unsupported file type')) {
      message = error.message;
      statusCode = 400;
    }

    // Clean up uploaded file on error
    if (cleanup && req.file?.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        logger.error('[/files/secure-upload] Error deleting file:', unlinkError);
      }
    }

    res.status(statusCode).json({
      error: message,
      code: 'UPLOAD_FAILED'
    });
  }
});

module.exports = router;
