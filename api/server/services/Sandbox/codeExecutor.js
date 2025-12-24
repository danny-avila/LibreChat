const e2bClientManager = require('../Endpoints/e2bAssistants/initialize');
const { logger } = require('@librechat/data-schemas');

/**
 * E2B Code Executor Service
 * 负责在E2B沙箱中执行代码并处理结果
 */

class CodeExecutor {
  /**
   * 执行Python代码并返回结果
   * @param {string} userId 
   * @param {string} conversationId 
   * @param {string} code - Python代码
   * @returns {Promise<Object>} 执行结果
   */
  async execute(userId, conversationId, code) {
    try {
      logger.info(`[CodeExecutor] Executing code for user ${userId}, conversation ${conversationId}`);
      
      const result = await e2bClientManager.executeCode(userId, conversationId, code);
      
      // 解析E2B执行结果
      const response = {
        success: !result.error,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.exitCode || 0,
        runtime: result.runtime || 0,
      };
      
      if (result.error) {
        response.success = false;
        response.error = result.error.message || 'Execution error';
      }
      
      logger.info(`[CodeExecutor] Code execution completed. Exit code: ${response.exitCode}`);
      return response;
    } catch (error) {
      logger.error('[CodeExecutor] Error executing code:', error);
      throw error;
    }
  }

  /**
   * 执行多条代码语句
   * @param {string} userId 
   * @param {string} conversationId 
   * @param {Array<string>} codeBlocks - 代码块数组
   * @returns {Promise<Array>} 执行结果数组
   */
  async executeBatch(userId, conversationId, codeBlocks) {
    const results = [];
    
    for (let i = 0; i < codeBlocks.length; i++) {
      const code = codeBlocks[i];
      try {
        const result = await this.execute(userId, conversationId, code);
        results.push({
          index: i,
          ...result,
        });
      } catch (error) {
        results.push({
          index: i,
          success: false,
          error: error.message,
        });
      }
    }
    
    return results;
  }

  /**
   * 执行代码并捕获输出中的图表
   * @param {string} userId 
   * @param {string} conversationId 
   * @param {string} code - Python代码
   * @returns {Promise<Object>} 执行结果
   */
  async executeWithVisualization(userId, conversationId, code) {
    const result = await this.execute(userId, conversationId, code);
    
    // 尝试检测matplotlib图表
    const hasVisualization = this.detectVisualization(code);
    
    if (hasVisualization && result.success) {
      logger.info('[CodeExecutor] Visualization detected in output');
      // TODO: 提取图表图像（需要文件系统支持）
    }
    
    return {
      ...result,
      hasVisualization,
    };
  }

  /**
   * 检测代码中是否包含可视化代码
   * @param {string} code - Python代码
   * @returns {boolean}
   */
  detectVisualization(code) {
    const visualizationLibs = [
      'matplotlib.pyplot',
      'seaborn',
      'plotly',
      'sns.heatmap',
    ];
    
    return visualizationLibs.some(lib => code.includes(lib));
  }

  /**
   * 验证代码安全性
   * @param {string} code - Python代码
   * @returns {Object>} 验证结果
   */
  validateCode(code) {
    const issues = [];
    
    // 检查危险函数
    const dangerousFunctions = [
      'exec',
      'eval',
      'compile',
      '__import__',
    ];
    
    for (const func of dangerousFunctions) {
      if (code.includes(func + '(')) {
        issues.push({
          type: 'security',
          message: `Dangerous function detected: ${func}`,
        });
      }
    }
    
    // 检查导入语句
    const importRegex = /^import\s+/gm;
    const imports = code.match(importRegex);
    
    if (imports) {
      const restrictedLibraries = ['os', 'subprocess', 'sys'];
      for (const imp of imports) {
        for (const lib of restrictedLibraries) {
          if (imp.includes(`import ${lib}`)) {
            issues.push({
              type: 'security',
              message: `Restricted library import detected: ${lib}`,
            });
          }
        }
      }
    }
    
    return {
      valid: issues.length === 0,
      issues,
    };
  }
}

// 导出单例
const codeExecutor = new CodeExecutor();

module.exports = codeExecutor;
