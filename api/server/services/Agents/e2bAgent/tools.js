const codeExecutor = require('~/server/services/Sandbox/codeExecutor');
const fileHandler = require('~/server/services/Sandbox/fileHandler');
const { logger } = require('@librechat/data-schemas');

/**
 * 为 E2B Data Analyst Agent 提供工具函数实现。
 * 
 * @param {string} userId - 用户 ID。
 * @param {string} conversationId - 对话 ID。
 * @param {ServerRequest} req - Express 请求对象，用于获取存储配置。
 * @returns {Object} 包含工具函数实现的对象。
 */
const getToolFunctions = (userId, conversationId, req) => {
  return {
    /**
     * 在沙箱中执行 Python 代码。
     */
    execute_code: async ({ code }) => {
      try {
        logger.debug(`[E2BAgent Tools] Executing code for user ${userId}`);
        const result = await codeExecutor.execute(userId, conversationId, code);
        
        const observation = {
          success: result.success,
          stdout: result.stdout,
          stderr: result.stderr,
          error: result.error,
          has_plots: result.hasVisualization,
        };

        if (result.hasVisualization) {
          observation.plot_count = result.images.length;
          observation.plot_names = result.images.map(img => img.name);
          
          const persistedFiles = await fileHandler.persistArtifacts({
            req,
            userId,
            conversationId,
            artifacts: result.images.map(img => ({
              name: img.name,
              path: img.name, 
              type: img.mime,
              content: img.base64,
            }))
          });
          
          observation.persisted_files = persistedFiles.map(f => ({
            filename: f.filename,
            file_id: f.file_id,
            filepath: f.filepath
          }));
          
          // IMPORTANT: Provide ready-to-use image paths for LLM
          // This eliminates the need for complex path replacement logic
          observation.image_paths = persistedFiles.map(f => f.filepath);
          observation.images_markdown = persistedFiles.map((f, idx) => 
            `![Plot ${idx}](${f.filepath})`
          ).join('\n');
          
          // Add a helper message for LLM
          observation.plot_info = `Generated ${result.images.length} plot(s). Use the following paths to display them:\n${observation.images_markdown}`;
          
          // Keep the URL map for backward compatibility (but simplified)
          observation.image_url_map = {};
          result.images.forEach((img, index) => {
            if (persistedFiles[index]) {
              const actualPath = persistedFiles[index].filepath;
              const actualFilename = persistedFiles[index].filename;
              
              // Only map incorrect patterns to correct paths
              // Do NOT map correct paths to themselves
              observation.image_url_map[img.name] = actualPath;
              observation.image_url_map[actualFilename] = actualPath;
              observation.image_url_map[`sandbox:/${img.name}`] = actualPath;
              observation.image_url_map[`sandbox://${img.name}`] = actualPath;
              observation.image_url_map[`sandbox:///home/user/${img.name}`] = actualPath;
              observation.image_url_map[`/home/user/${img.name}`] = actualPath;
              observation.image_url_map[`/tmp/${img.name}`] = actualPath;
            }
          });
          
          // Also store for later replacement in case LLM references images in text
          observation.image_names = result.images.map(img => img.name);
          observation.image_actual_paths = persistedFiles.map(f => f.filepath);
          observation.image_actual_filenames = persistedFiles.map(f => f.filename); // With timestamps
          
          logger.info(`[E2BAgent Tools] Created image URL map with ${Object.keys(observation.image_url_map).length} mappings`);
          logger.info(`[E2BAgent Tools] Returning ${observation.image_paths.length} image paths to LLM:`);
          observation.image_paths.forEach((path, idx) => {
            logger.info(`[E2BAgent Tools]   Image ${idx}: ${path}`);
          });
          logger.debug(`[E2BAgent Tools] Full observation:`, JSON.stringify(observation, null, 2));
          logger.debug(`[E2BAgent Tools] plot_info: ${observation.plot_info}`);
        }

        return observation;
      } catch (error) {
        logger.error(`[E2BAgent Tools] Error in execute_code:`, error);
        // Return consistent format even on error
        const errorObservation = {
          success: false,
          error: error.message,
          stdout: '',
          stderr: error.message || 'Unknown error occurred',
          has_plots: false,
          plot_count: 0,
        };
        logger.debug(`[E2BAgent Tools] Error observation:`, JSON.stringify(errorObservation, null, 2));
        return errorObservation;
      }
    },

    /**
     * 将文件从 LibreChat 上传到沙箱。
     */
    upload_file: async ({ file_id }) => {
      try {
        logger.info(`[E2BAgent Tools] Syncing file ${file_id} to sandbox`);
        
        const synced = await fileHandler.syncFilesToSandbox({
          req,
          userId,
          conversationId,
          fileIds: [file_id],
        });

        if (synced.length > 0) {
          return {
            success: true,
            message: `File ${synced[0].filename} uploaded to sandbox at ${synced[0].remotePath}`,
            remote_path: synced[0].remotePath
          };
        }
        return { success: false, error: 'File sync failed or file not found' };
      } catch (error) {
        logger.error(`[E2BAgent Tools] Error in upload_file:`, error);
        return { success: false, error: error.message };
      }
    },
  };
};

module.exports = {
  getToolFunctions,
};
