const { logger } = require('@librechat/data-schemas');
const { Sandbox } = require('@e2b/code-interpreter');

/**
 * E2B Client Manager
 * 管理E2B沙箱的生命周期
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
   * @param {string} template - 沙箱模板名称
   * @param {string} userId - 用户ID
   * @param {string} conversationId - 对话ID
   * @returns {Promise<Object>} 沙箱实例
   */
  async createSandbox(template = this.defaultConfig.template, userId, conversationId) {
    try {
      logger.info(`[E2B] Creating sandbox for user ${userId}, conversation ${conversationId}`);
      
      const sandbox = await Sandbox.create({
        template,
        apiKey: this.apiKey,
        timeoutMs: this.defaultConfig.timeoutMs,
        // 环境变量配置
        env: {
          MAX_MEMORY_MB: this.defaultConfig.maxMemoryMB.toString(),
          MAX_CPU_PERCENT: this.defaultConfig.maxCpuPercent.toString(),
        },
      });
      
      const key = `${userId}:${conversationId}`;
      this.sandboxes.set(key, {
        id: sandbox.id,
        template,
        sandbox,
        userId,
        conversationId,
        createdAt: new Date(),
      });
      
      logger.info(`[E2B] Sandbox created successfully: ${sandbox.id}`);
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
   * @param {string} userId 
   * @param {string} conversationId 
   * @param {string} code - Python代码
   * @returns {Promise<Object>} 执行结果
   */
  async executeCode(userId, conversationId, code) {
    const sandboxData = await this.getSandbox(userId, conversationId);
    
    if (!sandboxData || !sandboxData.sandbox) {
      throw new Error('Sandbox not found for this conversation');
    }
    
    try {
      logger.info(`[E2B] Executing code in sandbox ${sandboxData.id}`);
      const result = await sandboxData.sandbox.runCode(code, 'python');
      logger.info(`[E2B] Code execution completed in sandbox ${sandboxData.id}`);
      return result;
    } catch (error) {
      logger.error(`[E2B] Error executing code in sandbox ${sandboxData.id}:`, error);
      throw new Error(`Code execution failed: ${error.message}`);
    }
  }

  /**
   * 上传文件到沙箱
   * @param {string} userId 
   * @param {string} conversationId 
   * @param {string} content - 文件内容
   * @param {string} filename - 文件名
   * @returns {Promise<Object>} 上传结果
   */
  async uploadFile(userId, conversationId, content, filename) {
    const sandboxData = await this.getSandbox(userId, conversationId);
    
    if (!sandboxData || !sandboxData.sandbox) {
      throw new Error('Sandbox not found for this conversation');
    }
    
    try {
      logger.info(`[E2B] Uploading file ${filename} to sandbox ${sandboxData.id}`);
      const result = await sandboxData.sandbox.writeFile(content, filename);
      logger.info(`[E2B] File uploaded successfully to sandbox ${sandboxData.id}`);
      return result;
    } catch (error) {
      logger.error(`[E2B] Error uploading file to sandbox ${sandboxData.id}:`, error);
      throw new Error(`File upload failed: ${error.message}`);
    }
  }

  /**
   * 从沙箱下载文件
   * @param {string} userId 
   * @param {string} conversationId 
   * @param {string} filename - 文件名
   * @returns {Promise<Object>} 文件内容
   */
  async downloadFile(userId, conversationId, filename) {
    const sandboxData = await this.getSandbox(userId, conversationId);
    
    if (!sandboxData || !sandboxData.sandbox) {
      throw new Error('Sandbox not found for this conversation');
    }
    
    try {
      logger.info(`[E2B] Downloading file ${filename} from sandbox ${sandboxData.id}`);
      const content = await sandboxData.sandbox.readFile(filename);
      logger.info(`[E2B] File downloaded successfully from sandbox ${sandboxData.id}`);
      return content;
    } catch (error) {
      logger.error(`[E2B] Error downloading file from sandbox ${sandboxData.id}:`, error);
      throw new Error(`File download failed: ${error.message}`);
    }
  }

  /**
   * 列出沙箱中的文件
   * @param {string} userId 
   * @param {string} conversationId 
   * @param {string} path - 目录路径
   * @returns {Promise<Array>} 文件列表
   */
  async listFiles(userId, conversationId, path = '/') {
    const sandboxData = await this.getSandbox(userId, conversationId);
    
    if (!sandboxData || !sandboxData.sandbox) {
      throw new Error('Sandbox not found for this conversation');
    }
    
    try {
      logger.info(`[E2B] Listing files in sandbox ${sandboxData.id} at path ${path}`);
      const files = await sandboxData.sandbox.listFiles(path);
      logger.info(`[E2B] Listed ${files.length} files in sandbox ${sandboxData.id}`);
      return files;
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
