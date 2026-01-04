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
          
          // Create URL mapping for sandbox: paths to actual storage paths
          // Map both the image name and common sandbox path patterns
          observation.image_url_map = {};
          result.images.forEach((img, index) => {
            if (persistedFiles[index]) {
              const actualPath = persistedFiles[index].filepath;
              // Map by image name (e.g., "plot-0.png")
              observation.image_url_map[img.name] = actualPath;
              // Map all common sandbox path patterns
              observation.image_url_map[`sandbox:/${img.name}`] = actualPath;
              observation.image_url_map[`sandbox://${img.name}`] = actualPath;
              observation.image_url_map[`sandbox:/images/${userId}/${img.name}`] = actualPath;
              observation.image_url_map[`sandbox:///home/user/${img.name}`] = actualPath;
              observation.image_url_map[`/home/user/${img.name}`] = actualPath;
              observation.image_url_map[`/tmp/${img.name}`] = actualPath;
            }
          });
          
          // Also store for later replacement in case LLM references images in text
          observation.image_names = result.images.map(img => img.name);
          observation.image_actual_paths = persistedFiles.map(f => f.filepath);
          
          logger.info(`[E2BAgent Tools] Created image URL map with ${Object.keys(observation.image_url_map).length} mappings`);
        }

        return observation;
      } catch (error) {
        logger.error(`[E2BAgent Tools] Error in execute_code:`, error);
        return { success: false, error: error.message };
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

    /**
     * 从沙箱下载文件并持久化。
     */
    download_file: async ({ path }) => {
      try {
        logger.info(`[E2BAgent Tools] Downloading file ${path} from sandbox`);
        const filename = path.split('/').pop();
        
        const persistedFiles = await fileHandler.persistArtifacts({
          req,
          userId,
          conversationId,
          artifacts: [{ name: filename, path }]
        });

        if (persistedFiles.length > 0) {
          return {
            success: true,
            file_id: persistedFiles[0].file_id,
            filepath: persistedFiles[0].filepath,
            filename: persistedFiles[0].filename
          };
        }
        return { success: false, error: 'Failed to download or persist file' };
      } catch (error) {
        logger.error(`[E2BAgent Tools] Error in download_file:`, error);
        return { success: false, error: error.message };
      }
    },
  };
};

module.exports = {
  getToolFunctions,
};
