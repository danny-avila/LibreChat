const codeExecutor = require('~/server/services/Sandbox/codeExecutor');
const fileHandler = require('~/server/services/Sandbox/fileHandler');
const { logger } = require('@librechat/data-schemas');

/**
 * 为 E2B Data Analyst Agent 提供工具函数实现。
 * 
 * @param {string} userId - 用户 ID。
 * @param {string} conversationId - 对话 ID。
 * @param {ServerRequest} req - Express 请求对象，用于获取存储配置。
 * @param {ContextManager} contextManager - Context Manager实例，用于追踪状态。
 * @returns {Object} 包含工具函数实现的对象。
 */
const getToolFunctions = (userId, conversationId, req, contextManager) => {
  return {
    /**
     * 在沙箱中执行 Python 代码。
     * 支持自动恢复：如果sandbox失效，会自动重建并恢复文件状态
     */
    execute_code: async ({ code }, context = {}) => {
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
        
        // Log execution results for debugging
        if (!result.success) {
          logger.error(`[E2BAgent Tools] Code execution FAILED:`);
          logger.error(`[E2BAgent Tools]   Error Type: ${result.errorName || 'Unknown'}`);
          logger.error(`[E2BAgent Tools]   Error: ${result.error}`);
          if (result.traceback) {
            logger.error(`[E2BAgent Tools]   Traceback: ${result.traceback.substring(0, 500)}...`);
          }
          
          // ✨ 向 LLM 传递完整的错误信息（让 LLM 自己分析和修复）
          observation.error_type = result.errorName;
          observation.error_message = result.error;
          observation.traceback = result.traceback;
          // Note: No specific debug hints - LLM should analyze the traceback independently
        } else if (!result.stdout && !result.hasVisualization) {
          logger.info(`[E2BAgent Tools] Code executed successfully (empty stdout - likely assignment statement)`);
        } else {
          logger.info(`[E2BAgent Tools] Code executed successfully with ${result.stdout ? result.stdout.length : 0} chars output, ${result.hasVisualization ? result.images.length : 0} plots`);
        }
        
        // Use Context Manager for error recovery guidance
        if (!result.success && result.error) {
          const recoveryGuidance = contextManager.generateErrorRecoveryContext(result.error);
          observation.recovery_guidance = recoveryGuidance;
          logger.debug('[E2BAgent Tools] Added error recovery guidance');
        }

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
          
          // IMPORTANT: Only provide essential information to LLM
          // Do NOT expose file_id or internal database details
          observation.image_paths = persistedFiles.map(f => f.filepath);
          observation.images_markdown = persistedFiles.map((f, idx) => 
            `![Plot ${idx}](${f.filepath})`
          ).join('\n');
          
          // Add a helper message for LLM
          observation.plot_info = `Generated ${result.images.length} plot(s). Use the following markdown to display them:\n${observation.images_markdown}`;
          
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
          
          // Track generated artifacts in Context Manager
          persistedFiles.forEach((file, idx) => {
            contextManager.addGeneratedArtifact({
              type: 'image',
              name: file.filename,
              path: file.filepath,
              description: `Plot ${idx} generated from code execution`
            });
          });
          logger.debug(`[E2BAgent Tools] Tracked ${persistedFiles.length} artifacts in Context Manager`);
          
          logger.debug(`[E2BAgent Tools] Full observation:`, JSON.stringify(observation, null, 2));
          logger.debug(`[E2BAgent Tools] plot_info: ${observation.plot_info}`);
        }

        return observation;
      } catch (error) {
        logger.error(`[E2BAgent Tools] Error in execute_code:`, error);
        
        // 检测sandbox失效错误并自动恢复
        if (error.message?.includes('Sandbox expired') || 
            error.message?.includes('sandbox was not found')) {
          logger.warn(`[E2BAgent Tools] Sandbox expired, attempting automatic recovery...`);
          
          try {
            // 获取E2B client manager
            const e2bClientManager = require('~/server/services/Endpoints/e2bAssistants/initialize').e2bClientManager;
            
            // 从传入的context获取assistant配置
            const assistantConfig = context.assistant_config || {};
            const assistant = context.assistant;
            const currentFiles = context.files || [];
            
            // 重新创建sandbox
            logger.info(`[E2BAgent Tools] Recreating sandbox for conversation ${conversationId}`);
            await e2bClientManager.createSandbox(
              assistantConfig.e2b_sandbox_template,
              userId,
              conversationId,
              assistantConfig
            );
            
            // 恢复文件状态 - 优先使用当前请求的文件列表
            let fileIdsToRestore = [];
            
            // 1. 从当前请求的 files 参数获取（最准确）
            if (currentFiles && currentFiles.length > 0) {
              fileIdsToRestore = currentFiles.map(f => f.file_id || f.fileId).filter(id => id);
              logger.info(`[E2BAgent Tools] Found ${fileIdsToRestore.length} files from current request`);
            }
            
            // 2. 降级方案：从 Context Manager 获取（可能为空）
            if (fileIdsToRestore.length === 0) {
              const uploadedFiles = contextManager.sessionState.uploadedFiles;
              if (uploadedFiles && uploadedFiles.length > 0) {
                fileIdsToRestore = uploadedFiles.map(f => f.file_id).filter(id => id);
                logger.info(`[E2BAgent Tools] Found ${fileIdsToRestore.length} files from Context Manager`);
              }
            }
            
            // 恢复文件
            if (fileIdsToRestore.length > 0) {
              logger.info(`[E2BAgent Tools] Restoring ${fileIdsToRestore.length} files to new sandbox`);
              
              const resyncedFiles = await fileHandler.syncFilesToSandbox({
                req,
                userId,
                conversationId,
                fileIds: fileIdsToRestore
              });
              
              logger.info(`[E2BAgent Tools] Successfully restored ${resyncedFiles.length} files`);
            } else {
              logger.warn(`[E2BAgent Tools] No files found to restore after sandbox recovery`);
            }
            
            // 重新执行代码
            logger.info(`[E2BAgent Tools] Retrying code execution after sandbox recovery`);
            const result = await codeExecutor.execute(userId, conversationId, code);
            
            const observation = {
              success: result.success,
              stdout: result.stdout,
              stderr: result.stderr,
              error: result.error,
              has_plots: result.hasVisualization,
              _recovery_note: 'Sandbox was automatically recreated due to timeout'
            };
            
            // Handle visualization results (same as above)
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
              
              observation.image_paths = persistedFiles.map(f => f.filepath);
              observation.images_markdown = persistedFiles.map((f, idx) => 
                `![Plot ${idx}](${f.filepath})`
              ).join('\n');
              
              persistedFiles.forEach((file, idx) => {
                contextManager.addGeneratedArtifact({
                  type: 'image',
                  name: file.filename,
                  path: file.filepath,
                  description: `Plot ${idx} generated from code execution`
                });
              });
            }
            
            logger.info(`[E2BAgent Tools] ✓ Sandbox recovery successful`);
            return observation;
            
          } catch (recoveryError) {
            logger.error(`[E2BAgent Tools] Failed to recover from sandbox expiration:`, recoveryError);
            return {
              success: false,
              error: `Sandbox expired and automatic recovery failed: ${recoveryError.message}. Please try again.`,
              stdout: '',
              stderr: recoveryError.message,
              has_plots: false,
              plot_count: 0,
            };
          }
        }
        
        // 其他错误，正常返回
        const errorObservation = {
          success: false,
          error: error.message,
          stdout: '',
          stderr: error.message || 'Unknown error occurred',
          has_plots: false,
          plot_count: 0,
          image_paths: [],
          images_markdown: '',
          plot_info: '',
          // 明确指导：不要重试相同代码
          recovery_hint: '❌ Code execution failed. DO NOT retry the same code. Analyze the error and try a DIFFERENT approach or ask the user for clarification.'
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

    /**
     * 列出沙箱中的文件。
     */
    list_files: async ({ path = '/home/user' }) => {
      try {
        logger.info(`[E2BAgent Tools] Listing files in ${path}`);
        const files = await codeExecutor.listFiles(userId, conversationId, path);
        
        return {
          success: true,
          path: path,
          files: files,
          count: files.length,
          message: `Found ${files.length} files in ${path}`
        };
      } catch (error) {
        logger.error(`[E2BAgent Tools] Error in list_files:`, error);
        return { 
          success: false, 
          error: error.message,
          files: [],
          count: 0
        };
      }
    },

    /**
     * 完成任务并提供最终总结。
     * LLM应在完成所有计划步骤后调用此工具。
     */
    complete_task: async ({ summary }) => {
      logger.info(`[E2BAgent Tools] Task completion requested`);
      logger.info(`[E2BAgent Tools] Summary: ${summary?.substring(0, 100)}...`);
      
      // 自动附加本次对话生成的所有图片
      const artifacts = contextManager.sessionState.generatedArtifacts || [];
      const images = artifacts.filter(a => a.type === 'image');
      
      let fullSummary = summary || 'All planned steps have been executed.';
      
      if (images.length > 0) {
        logger.info(`[E2BAgent Tools] Appending ${images.length} generated images to summary`);
        fullSummary += '\n\n## 生成的可视化图表\n\n';
        images.forEach((img, index) => {
          fullSummary += `![图表 ${index + 1}](${img.path})\n\n`;
        });
      }
      
      return {
        success: true,
        completed: true,
        message: 'Task completed successfully',
        summary: fullSummary
      };
    },
  };
};

module.exports = {
  getToolFunctions,
};
