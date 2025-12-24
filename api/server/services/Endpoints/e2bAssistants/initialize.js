const { logger } = require('@librechat/data-schemas');

/**
 * E2B Client Manager
 * 管理E2B沙箱的生命周期
 */
class E2BClientManager {
  constructor() {
    this.apiKey = process.env.E2B_API_KEY;
    this.sandboxes = new Map(); // key: `${userId}:${conversationId}`
  }

  /**
   * 创建新的沙箱实例
   * @param {string} template - 沙箱模板名称
   * @param {string} userId - 用户ID
   * @param {string} conversationId - 对话ID
   * @returns {Promise<Object>} 沙箱实例
   */
  async createSandbox(template = 'python3-data-analysis', userId, conversationId) {
    try {
      logger.info(`[E2B] Creating sandbox for user ${userId}, conversation ${conversationId}`);
      
      // TODO: 这里将在下一步集成实际的E2B SDK
      // const { Sandbox } = require('@e2b/code-interpreter');
      // const sandbox = await Sandbox.create({
      //   template,
      //   apiKey: this.apiKey,
      //   timeoutMs: 600000,
      // });
      
      // 临时返回模拟对象
      const sandbox = {
        id: `sandbox_${Date.now()}`,
        template,
        kill: async () => {
          logger.info(`[E2B] Killing sandbox: ${sandbox.id}`);
        },
      };
      
      const key = `${userId}:${conversationId}`;
      this.sandboxes.set(key, sandbox);
      
      logger.info(`[E2B] Sandbox created successfully: ${sandbox.id}`);
      return sandbox;
    } catch (error) {
      logger.error('[E2B] Error creating sandbox:', error);
      throw error;
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
    const sandbox = this.sandboxes.get(key);
    
    if (sandbox) {
      logger.info(`[E2B] Killing sandbox: ${sandbox.id}`);
      await sandbox.kill();
      this.sandboxes.delete(key);
    }
  }

  /**
   * 清理所有沙箱（用于服务器关闭时）
   */
  async cleanup() {
    logger.info(`[E2B] Cleaning up ${this.sandboxes.size} sandboxes`);
    
    for (const [key, sandbox] of this.sandboxes) {
      try {
        await sandbox.kill();
      } catch (error) {
        logger.error(`[E2B] Error killing sandbox ${key}:`, error);
      }
    }
    
    this.sandboxes.clear();
  }

  /**
   * 获取活跃沙箱数量
   */
  getActiveSandboxCount() {
    return this.sandboxes.size;
  }
}

// 单例模式
const e2bClientManager = new E2BClientManager();

module.exports = e2bClientManager;
