const { logger } = require('@librechat/data-schemas');
const { FileSources, FileContext } = require('librechat-data-provider');
const { findFileById, createFile } = require('~/models/File');
const { getStrategyFunctions } = require('../Files/strategies');
const { getFileStrategy } = require('~/server/utils/getFileStrategy');
const codeExecutor = require('./codeExecutor');

class FileHandler {
  /**
   * Syncs a list of files from LibreChat storage (Local/S3/Azure) to the E2B sandbox.
   * 
   * @param {Object} params
   * @param {ServerRequest} params.req - The express request object (required for Local strategy config).
   * @param {string} params.userId - The user ID.
   * @param {string} params.conversationId - The conversation ID.
   * @param {Array<string>} params.fileIds - List of file IDs to sync.
   * @param {Object} [params.openai] - Initialized OpenAI client (required for OpenAI/Azure sources).
   * @returns {Promise<Array<Object>>} List of uploaded file info.
   */
  async syncFilesToSandbox({ req, userId, conversationId, fileIds, openai }) {
    if (!fileIds || fileIds.length === 0) {
      return [];
    }

    logger.info(`[FileHandler] Syncing ${fileIds.length} files to sandbox for user ${userId}`);

    const processFile = async (fileId) => {
      try {
        const fileDoc = await findFileById(fileId);
        if (!fileDoc) {
          logger.warn(`[FileHandler] File not found in DB: ${fileId}`);
          return null;
        }

        const source = fileDoc.source || FileSources.local;
        const strategy = getStrategyFunctions(source);
        
        if (!strategy.getDownloadStream) {
          logger.warn(`[FileHandler] Source ${source} does not support download stream for file ${fileId}`);
          return null;
        }

        let stream;
        // Handle different strategy signatures
        if (source === FileSources.openai || source === FileSources.azure) {
          if (!openai) {
            logger.warn(`[FileHandler] OpenAI client missing for file ${fileId} (source: ${source})`);
            return null;
          }
          // OpenAI strategy: getDownloadStream(file_id, openai)
          stream = await strategy.getDownloadStream(fileDoc.file_id, openai);
        } else {
          // Local/S3/others: getDownloadStream(req, filepath)
          // req is needed for Local strategy to access appConfig
          stream = await strategy.getDownloadStream(req, fileDoc.filepath);
        }
        
        // Convert stream to buffer for E2B upload
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const fileContent = Buffer.concat(chunks);
        
        const filename = fileDoc.filename;
        const remotePath = `/home/user/${filename}`;

        const result = await codeExecutor.uploadFile(userId, conversationId, fileContent, remotePath);
        
        if (result.success) {
          logger.debug(`[FileHandler] Successfully synced ${filename} to E2B`);
          return {
            fileId,
            filename,
            remotePath,
            size: fileContent.length
          };
        }
        return null;
      } catch (error) {
        logger.error(`[FileHandler] Error syncing file ${fileId}:`, error);
        return null;
      }
    };

    // Process files concurrently
    const results = await Promise.allSettled(fileIds.map(processFile));
    
    // Filter successful uploads
    return results
      .filter(r => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value);
  }

  /**
   * Persists artifacts generated in the sandbox back to LibreChat storage.
   * 
   * @param {Object} params
   * @param {ServerRequest} params.req - Express request object.
   * @param {string} params.userId 
   * @param {string} params.conversationId 
   * @param {Array<Object>} params.artifacts - List of artifacts { name, path, format }
   * @returns {Promise<Array<Object>>} List of created File documents.
   */
  async persistArtifacts({ req, userId, conversationId, artifacts }) {
    const savedFiles = [];
    const appConfig = req.config;

    const processArtifact = async (artifact) => {
      try {
        logger.info(`[FileHandler] Persisting artifact ${artifact.path} from sandbox`);
        
        // 1. Download artifact from sandbox
        const content = await codeExecutor.downloadFile(userId, conversationId, artifact.path, 'buffer');
        
        // 2. Determine storage strategy (Local/S3/Azure)
        const isImage = artifact.path.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i);
        const source = getFileStrategy(appConfig, { isImage: !!isImage });
        const strategy = getStrategyFunctions(source);

        if (!strategy.saveBuffer) {
          throw new Error(`Strategy ${source} does not support saveBuffer`);
        }

        // 3. Save to storage
        const fileName = `${Date.now()}-${artifact.name}`;
        const filepath = await strategy.saveBuffer({ userId, fileName, buffer: content });

        // 4. Create DB record
        const fileDoc = await createFile({
          user: userId,
          file_id: require('uuid').v4(),
          bytes: content.length,
          filepath,
          filename: artifact.name,
          source,
          type: artifact.type || (isImage ? `image/${artifact.name.split('.').pop()}` : 'application/octet-stream'),
          context: FileContext.assistants_output,
        }, true);

        logger.info(`[FileHandler] Artifact ${artifact.name} persisted to ${source} at ${filepath}`);
        return fileDoc;
      } catch (error) {
        logger.error(`[FileHandler] Error persisting artifact ${artifact.name}:`, error);
        return null;
      }
    };

    // Process artifacts concurrently
    const results = await Promise.allSettled(artifacts.map(processArtifact));
    
    return results
      .filter(r => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value);
  }
}

module.exports = new FileHandler();
