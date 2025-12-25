const e2bClientManager = require('../Endpoints/e2bAssistants/initialize');
const { logger } = require('@librechat/data-schemas');

/**
 * E2B Code Executor Service - 适配 v2.8.4
 * 负责在E2B沙箱中执行代码、提取图表并进行安全校验
 */
class CodeExecutor {
  /**
   * 核心执行方法：执行Python代码并处理结果
   * @param {string} userId
   * @param {string} conversationId
   * @param {string} code
   * @param {Object} options
   */
  async execute(userId, conversationId, code, options = {}) {
    try {
      logger.info(`[CodeExecutor] Executing code for user ${userId}, conversation ${conversationId}`);
      
      const validation = this.validateCode(code);
      if (!validation.valid) {
        throw new Error(`Security validation failed: ${validation.issues.map(i => i.message).join(', ')}`);
      }

      // 1. 调用适配了 v2.8.4 的管理器
      const result = await e2bClientManager.executeCode(userId, conversationId, code, options);
      
      // 2. 提取图表数据 (E2B v2 特性：图片直接在 results 数组中)
      const images = [];
      if (result.results && Array.isArray(result.results)) {
        for (const [index, r] of result.results.entries()) {
          if (r.png) {
            images.push({
                format: 'png', 
                base64: r.png, 
                mime: 'image/png',
                name: `plot-${index}.png`
            });
          } else if (r.jpeg) {
            images.push({
                format: 'jpeg', 
                base64: r.jpeg, 
                mime: 'image/jpeg',
                name: `plot-${index}.jpeg`
            });
          } else if (r.svg) {
            images.push({
                format: 'svg', 
                base64: r.svg, 
                mime: 'image/svg+xml',
                name: `plot-${index}.svg`
            });
          }
        }
      }
      
      // 3. 构建标准响应对象
      const response = {
        success: !result.error,
        stdout: this._formatOutput(result.stdout),
        stderr: this._formatOutput(result.stderr),
        error: result.error ? result.error : null,
        exitCode: result.exitCode || 0,
        runtime: result.runtime || 0,
        images: images, 
        hasVisualization: images.length > 0,
      };
      
      if (images.length > 0) {
        logger.info(`[CodeExecutor] Execution finished. Images found: ${images.length}`);
      }
      return response;
    } catch (error) {
      logger.error('[CodeExecutor] Error executing code:', error);
      throw error;
    }
  }

  /**
   * 批量执行多条代码语句
   */
  async executeBatch(userId, conversationId, codeBlocks, options = {}) {
    const results = [];
    for (let i = 0; i < codeBlocks.length; i++) {
      try {
        const result = await this.execute(userId, conversationId, codeBlocks[i], options);
        results.push({ index: i, ...result });
        if (!result.success) break; 
      } catch (error) {
        results.push({ index: i, success: false, error: error.message });
        break;
      }
    }
    return results;
  }

  /**
   * 验证代码安全性
   */
  validateCode(code) {
    const issues = [];
    
    // 1. 检查危险函数 (Critical)
    const critical = ['exec(', 'eval(', 'compile(', '__import__(', 'os.system(', 'subprocess.'];
    for (const func of critical) {
      if (code.includes(func)) {
        issues.push({ type: 'security', level: 'critical', message: `Restricted function call: ${func}` });
      }
    }
    
    // 2. 检查敏感导入 (Warning)
    const warnings = ['import os', 'import sys', 'import shutil', 'import subprocess'];
    for (const lib of warnings) {
      if (code.includes(lib)) {
        issues.push({ type: 'security', level: 'warning', message: `Sensitive library import: ${lib}` });
      }
    }

    // 3. 检查死循环风险
    if (code.includes('while True:') || code.includes('while 1:')) {
      issues.push({ type: 'security', level: 'warning', message: 'Potential infinite loop detected' });
    }

    return {
      valid: issues.filter(i => i.level === 'critical').length === 0,
      issues,
    };
  }

  /**
   * 格式化输出：将 E2B 的日志对象/数组转为字符串
   */
  _formatOutput(output) {
    if (!output) return '';
    if (Array.isArray(output)) {
      return output.map(item => (typeof item === 'object' ? item.line || item.message : item)).join('\n');
    }
    return String(output);
  }

  // --- 转发方法 (直接调用管理器) ---
  async uploadFile(userId, conversationId, content, path) {
    return await e2bClientManager.uploadFile(userId, conversationId, content, path);
  }

  async downloadFile(userId, conversationId, path, format = 'text') {
    return await e2bClientManager.downloadFile(userId, conversationId, path, format);
  }

  async listFiles(userId, conversationId, path = '/home/user') {
    return await e2bClientManager.listFiles(userId, conversationId, path);
  }
}

module.exports = new CodeExecutor();
