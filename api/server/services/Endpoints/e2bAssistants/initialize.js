const { logger } = require('@librechat/data-schemas');
const { Sandbox } = require('@e2b/code-interpreter');

/**
 * E2B Client Manager - 使用E2B SDK v2
 * 管理E2B沙箱的生命周期
 * 
 * SDK参考: https://e2b.dev/docs/sdk-reference/code-interpreter-js-sdk/v2/sandbox
 */

class E2BClientManager {
  constructor() {
    this.apiKey = process.env.E2B_API_KEY;
    this.sandboxes = new Map(); // key: `${userId}:${conversationId}`
    
    // 配置默认值
    this.defaultConfig = {
      template: process.env.E2B_SANDBOX_TEMPLATE || 'python3-data-analysis',
      timeoutMs: parseInt(process.env.E2B_DEFAULT_TIMEOUT_MS) || 300000, // 5分钟
      maxMemoryMB: parseInt(process.env.E2B_DEFAULT_MAX_MEMORY_MB) || 2048,
      maxCpuPercent: parseInt(process.env.E2B_DEFAULT_MAX_CPU_PERCENT) || 80,
    };
  }

  /**
   * 创建新的沙箱实例
   * 使用E2B Code Interpreter SDK v2
   * 参考：https://e2b.dev/docs/sdk-reference/code-interpreter-js-sdk/v2/sandbox
   * @param {string} template - 沙箱模板名称
   * @param {string} userId - 用户ID
   * @param {string} conversationId - 对话ID
   * @param {Object} assistantConfig - Assistant配置（包含E2B特有字段）
   * @returns {Promise<Object>} 沙箱实例
   */
  async createSandbox(template, userId, conversationId, assistantConfig = {}) {
    try {
      logger.info(`[E2B] Creating sandbox for user ${userId}, conversation ${conversationId}, template: ${template}`);
      
      // 根据E2B Code Interpreter SDK文档构建配置
      // Sandbox.create() 接受的参数：apiKey, template, timeoutMs, metadata
      const apiOpts = {
        apiKey: this.apiKey,
        template: template || this.defaultConfig.template,
        timeoutMs: assistantConfig.timeout_ms || this.defaultConfig.timeoutMs,
      };
      
      // 添加网络访问配置
      if (assistantConfig.has_internet_access) {
        // 注意：网络访问在模板级别配置，这里只是记录
        logger.info(`[E2B] Internet access enabled for this sandbox`);
      }
      
      // E2B Code Interpreter SDK v2.3.3 正确用法
      const sandbox = await Sandbox.create(apiOpts);
      
      const key = `${userId}:${conversationId}`;
      this.sandboxes.set(key, {
        id: sandbox.sandboxID,
        template,
        sandbox,
        userId,
        conversationId,
        createdAt: new Date(),
        config: assistantConfig,
      });
      
      logger.info(`[E2B] Sandbox created successfully: ${sandbox.sandboxID}`);
      return sandbox;
    } catch (error) {
      logger.error('[E2B] Error creating sandbox:', error);
      throw new Error(`Failed to create E2B sandbox: ${error.message}`);
    }
  }

  /**
   * 获取已存在的沙箱
   * @param {string} userId 
   * @param {string} conversationId 
   * @returns {Object|undefined}
   */
  async getSandbox(userId, conversationId) {
    const key = `${userId}:${conversationId}`;
    return this.sandboxes.get(key);
  }

  /**
   * 终止并移除沙箱
   * @param {string} userId 
   * @param {string} conversationId 
   */
  async killSandbox(userId, conversationId) {
    const key = `${userId}:${conversationId}`;
    const sandboxData = this.sandboxes.get(key);
    
    if (sandboxData && sandboxData.sandbox) {
      try {
        logger.info(`[E2B] Killing sandbox: ${sandboxData.id}`);
        await sandboxData.sandbox.kill();
        this.sandboxes.delete(key);
        logger.info(`[E2B] Sandbox killed successfully: ${sandboxData.id}`);
      } catch (error) {
        logger.error(`[E2B] Error killing sandbox ${sandboxData.id}:`, error);
        // 即使失败也从map中移除
        this.sandboxes.delete(key);
        throw error;
      }
    }
  }

  /**
   * 在沙箱中执行Python代码
   * 使用E2B SDK v2 runCode API
   * @param {string} userId 
   * @param {string} conversationId 
   * @param {string} code - Python代码
   * @param {Object} options - 执行选项（如环境变量）
   * @returns {Promise<Object>} 执行结果
   */
  async executeCode(userId, conversationId, code, options = {}) {
    const sandboxData = await this.getSandbox(userId, conversationId);
    
    if (!sandboxData || !sandboxData.sandbox) {
      throw new Error('Sandbox not found for this conversation');
    }
    
    try {
      logger.info(`[E2B] Executing code in sandbox ${sandboxData.id}`);
      
      // 合并Assistant配置的环境变量和执行时的环境变量
      const envVars = {
        ...(sandboxData.config?.env_vars instanceof Map ? Object.fromEntries(sandboxData.config.env_vars) : {}),
        ...(options.envVars || {}),
      };
      
      // E2B SDK v2 正确用法 - 使用 runCode
      const result = await sandboxData.sandbox.runCode(code, {
        language: 'python',
        envs: Object.keys(envVars).length > 0 ? envVars : undefined,
        onStdout: (output) => {
          logger.debug(`[E2B] stdout: ${output.message}`);
        },
        onStderr: (output) => {
          logger.debug(`[E2B] stderr: ${output.message}`);
        },
        onResult: (result) => {
          logger.info(`[E2B] Code execution result in sandbox ${sandboxData.id}`);
        },
        onError: (error) => {
          logger.error(`[E2B] Code execution error in sandbox ${sandboxData.id}:`, error);
        },
        timeoutMs: options.timeoutMs || sandboxData.config?.timeout_ms || this.defaultConfig.timeoutMs,
      });
      
      logger.info(`[E2B] Code execution completed in sandbox ${sandboxData.id}`);
      
      // 格式化返回结果
      return {
        success: !result.error,
        stdout: result.stdout || [],
        stderr: result.stderr || [],
        results: result.results || [],
        error: result.error ? result.error.message : null,
        logs: result.logs || [],
        exitCode: result.exitCode || 0,
        runtime: result.runtime || 0,
      };
    } catch (error) {
      logger.error(`[E2B] Error executing code in sandbox ${sandboxData.id}:`, error);
      throw new Error(`Code execution failed: ${error.message}`);
    }
  }

  /**
   * 上传文件到沙箱
   * 使用E2B SDK v2.8.4 filesystem API
   * 支持多种数据格式：string, ArrayBuffer, Blob, ReadableStream
   * @param {string} userId 
   * @param {string} conversationId 
   * @param {string|Buffer|ArrayBuffer|Blob|ReadableStream} content - 文件内容
   * @param {string} path - 文件路径
   * @returns {Promise<Object>} 上传结果
   */
  async uploadFile(userId, conversationId, content, path) {
    const sandboxData = await this.getSandbox(userId, conversationId);
    
    if (!sandboxData || !sandboxData.sandbox) {
      throw new Error('Sandbox not found for this conversation');
    }
    
    try {
      logger.info(`[E2B] Uploading file ${path} to sandbox ${sandboxData.id}`);
      
      // E2B SDK v2.8.4 正确用法 - 使用 filesystem.write
      // 支持多种格式：string, ArrayBuffer, Blob, ReadableStream
      const writeInfo = await sandboxData.sandbox.filesystem.write(path, content);
      
      logger.info(`[E2B] File uploaded successfully to sandbox ${sandboxData.id}`);
      return {
        path,
        success: true,
        size: writeInfo.size || 0,
      };
    } catch (error) {
      logger.error(`[E2B] Error uploading file to sandbox ${sandboxData.id}:`, error);
      throw new Error(`File upload failed: ${error.message}`);
    }
  }

  /**
   * 从沙箱下载文件
   * 使用E2B SDK v2.8.4 filesystem API
   * @param {string} userId 
   * @param {string} conversationId 
   * @param {string} path - 文件路径
   * @param {string} format - 返回格式：'text', 'bytes', 'blob', 'stream'
   * @returns {Promise<string|Buffer|Blob|ReadableStream>} 文件内容
   */
  async downloadFile(userId, conversationId, path, format = 'text') {
    const sandboxData = await this.getSandbox(userId, conversationId);
    
    if (!sandboxData || !sandboxData.sandbox) {
      throw new Error('Sandbox not found for this conversation');
    }
    
    try {
      logger.info(`[E2B] Downloading file ${path} from sandbox ${sandboxData.id} as ${format}`);
      
      // E2B SDK v2.8.4 正确用法 - 使用 filesystem.read
      // 支持多种格式：text, bytes, blob, stream
      const content = await sandboxData.sandbox.filesystem.read(path, { format });
      
      logger.info(`[E2B] File downloaded successfully from sandbox ${sandboxData.id}`);
      return content;
    } catch (error) {
      logger.error(`[E2B] Error downloading file from sandbox ${sandboxData.id}:`, error);
      throw new Error(`File download failed: ${error.message}`);
    }
  }

  /**
   * 检查文件或目录是否存在
   * 使用E2B SDK v2.8.4 filesystem API
   * @param {string} userId 
   * @param {string} conversationId 
   * @param {string} path - 文件或目录路径
   * @returns {Promise<boolean>} 是否存在
   */
  async fileExists(userId, conversationId, path) {
    const sandboxData = await this.getSandbox(userId, conversationId);
    
    if (!sandboxData || !sandboxData.sandbox) {
      throw new Error('Sandbox not found for this conversation');
    }
    
    try {
      const exists = await sandboxData.sandbox.filesystem.exists(path);
      return exists;
    } catch (error) {
      logger.error(`[E2B] Error checking file existence ${path}:`, error);
      throw new Error(`File existence check failed: ${error.message}`);
    }
  }

  /**
   * 获取文件或目录信息
   * 使用E2B SDK v2.8.4 filesystem API
   * @param {string} userId 
   * @param {string} conversationId 
   * @param {string} path - 文件或目录路径
   * @returns {Promise<Object>} 文件信息
   */
  async getFileInfo(userId, conversationId, path) {
    const sandboxData = await this.getSandbox(userId, conversationId);
    
    if (!sandboxData || !sandboxData.sandbox) {
      throw new Error('Sandbox not found for this conversation');
    }
    
    try {
      const info = await sandboxData.sandbox.filesystem.getInfo(path);
      
      return {
        name: info.name,
        path: info.path,
        type: info.type, // 'file' or 'dir'
        size: info.size || 0,
        isDirectory: info.type === 'dir',
        modifiedAt: info.modifiedAt || null,
      };
    } catch (error) {
      logger.error(`[E2B] Error getting file info ${path}:`, error);
      throw new Error(`Failed to get file info: ${error.message}`);
    }
  }

  /**
   * 创建目录
   * 使用E2B SDK v2.8.4 filesystem API
   * @param {string} userId 
   * @param {string} conversationId 
   * @param {string} path - 目录路径
   * @returns {Promise<boolean>} 创建成功返回true
   */
  async makeDirectory(userId, conversationId, path) {
    const sandboxData = await this.getSandbox(userId, conversationId);
    
    if (!sandboxData || !sandboxData.sandbox) {
      throw new Error('Sandbox not found for this conversation');
    }
    
    try {
      logger.info(`[E2B] Creating directory ${path} in sandbox ${sandboxData.id}`);
      const created = await sandboxData.sandbox.filesystem.makeDir(path);
      
      if (created) {
        logger.info(`[E2B] Directory created successfully: ${path}`);
      }
      
      return created;
    } catch (error) {
      logger.error(`[E2B] Error creating directory ${path}:`, error);
      throw new Error(`Directory creation failed: ${error.message}`);
    }
  }

  /**
   * 删除文件或目录
   * 使用E2B SDK v2.8.4 filesystem API
   * @param {string} userId 
   * @param {string} conversationId 
   * @param {string} path - 文件或目录路径
   * @returns {Promise<void>}
   */
  async deleteFile(userId, conversationId, path) {
    const sandboxData = await this.getSandbox(userId, conversationId);
    
    if (!sandboxData || !sandboxData.sandbox) {
      throw new Error('Sandbox not found for this conversation');
    }
    
    try {
      logger.info(`[E2B] Deleting file/directory ${path} from sandbox ${sandboxData.id}`);
      await sandboxData.sandbox.filesystem.remove(path);
      
      logger.info(`[E2B] File/directory deleted successfully: ${path}`);
    } catch (error) {
      logger.error(`[E2B] Error deleting ${path} from sandbox ${sandboxData.id}:`, error);
      throw new Error(`File deletion failed: ${error.message}`);
    }
  }

  /**
   * 列出沙箱中的文件
   * 使用E2B SDK v2.8.4 filesystem API
   * @param {string} userId 
   * @param {string} conversationId 
   * @param {string} path - 目录路径
   * @returns {Promise<Array>} 文件列表
   */
  async listFiles(userId, conversationId, path = '/home/user') {
    const sandboxData = await this.getSandbox(userId, conversationId);
    
    if (!sandboxData || !sandboxData.sandbox) {
      throw new Error('Sandbox not found for this conversation');
    }
    
    try {
      logger.info(`[E2B] Listing files in sandbox ${sandboxData.id} at path ${path}`);
      
      // E2B SDK v2.8.4 正确用法 - 使用 filesystem.list
      const files = await sandboxData.sandbox.filesystem.list(path);
      
      // 格式化文件列表
      const fileList = files.map(file => ({
        name: file.name,
        path: file.path,
        type: file.type, // 'file' or 'dir'
        size: file.size || 0,
        isDirectory: file.type === 'dir',
        modifiedAt: file.modifiedAt || null,
      }));
      
      logger.info(`[E2B] Listed ${fileList.length} items in sandbox ${sandboxData.id}`);
      return fileList;
    } catch (error) {
      logger.error(`[E2B] Error listing files in sandbox ${sandboxData.id}:`, error);
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }

  /**
   * 清理所有沙箱（用于服务器关闭时）
   */
  async cleanup() {
    logger.info(`[E2B] Cleaning up ${this.sandboxes.size} sandboxes`);
    
    const cleanupPromises = [];
    
    for (const [key, sandboxData] of this.sandboxes) {
      cleanupPromises.push(
        (async () => {
          try {
            await sandboxData.sandbox.kill();
            logger.info(`[E2B] Cleanup: Killed sandbox ${sandboxData.id}`);
          } catch (error) {
            logger.error(`[E2B] Cleanup: Error killing sandbox ${key}:`, error);
          }
        })()
      );
    }
    
    await Promise.allSettled(cleanupPromises);
    this.sandboxes.clear();
    logger.info('[E2B] Cleanup completed');
  }

  /**
   * 获取活跃沙箱数量
   */
  getActiveSandboxCount() {
    return this.sandboxes.size;
  }

  /**
   * 获取所有活跃沙箱的信息
   */
  getActiveSandboxes() {
    return Array.from(this.sandboxes.values()).map(data => ({
      id: data.id,
      userId: data.userId,
      conversationId: data.conversationId,
      template: data.template,
      createdAt: data.createdAt,
      config: data.config || {},
    }));
  }
}

// 单例模式
const e2bClientManager = new E2BClientManager();

// 优雅关闭处理
process.on('SIGTERM', async () => {
  logger.info('[E2B] SIGTERM received, cleaning up sandboxes...');
  await e2bClientManager.cleanup();
});

process.on('SIGINT', async () => {
  logger.info('[E2B] SIGINT received, cleaning up sandboxes...');
  await e2bClientManager.cleanup();
});

module.exports = e2bClientManager;
