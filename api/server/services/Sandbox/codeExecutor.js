const e2bClientManager = require('../Endpoints/e2bAssistants/initialize');
const { logger } = require('@librechat/data-schemas');

/**
 * E2B Code Executor Service
 * 负责在E2B沙箱中执行代码并处理结果
 * 
 * 优化项：
 * - 支持环境变量注入
 * - 支持多种文件格式（text, bytes, blob, stream）
 * - 增强的错误处理和日志
 * - 支持图表检测和输出
 */

class CodeExecutor {
  /**
   * 执行Python代码并返回结果
   * @param {string} userId 
   * @param {string} conversationId 
   * @param {string} code - Python代码
   * @param {Object} options - 执行选项（环境变量、超时等）
   * @returns {Promise<Object>} 执行结果
   */
  async execute(userId, conversationId, code, options = {}) {
    try {
      logger.info(`[CodeExecutor] Executing code for user ${userId}, conversation ${conversationId}`);
      
      const result = await e2bClientManager.executeCode(userId, conversationId, code, options);
      
      // 解析E2B执行结果
      const response = {
        success: !result.error,
        stdout: this._formatOutput(result.stdout),
        stderr: this._formatOutput(result.stderr),
        exitCode: result.exitCode || 0,
        runtime: result.runtime || 0,
        error: result.error || null,
      };
      
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
   * @param {Object} options - 执行选项
   * @returns {Promise<Array>} 执行结果数组
   */
  async executeBatch(userId, conversationId, codeBlocks, options = {}) {
    const results = [];
    
    for (let i = 0; i < codeBlocks.length; i++) {
      const code = codeBlocks[i];
      try {
        const result = await this.execute(userId, conversationId, code, options);
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
      
      // 尝试提取图表文件
      try {
        const plotFiles = await this._findPlotFiles(userId, conversationId);
        if (plotFiles.length > 0) {
          result.visualizations = plotFiles;
        }
      } catch (error) {
        logger.warn('[CodeExecutor] Failed to find plot files:', error);
      }
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
      'plt.show',
      'plt.savefig',
      'plt.savefig',
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
      'os.system',
      'subprocess.run',
      'subprocess.call',
      'subprocess.popen',
      'open',
    ];
    
    for (const func of dangerousFunctions) {
      if (code.includes(func + '(')) {
        issues.push({
          type: 'security',
          level: 'critical',
          message: `Dangerous function detected: ${func}`,
        });
      }
    }
    
    // 检查导入语句
    const importRegex = /^import\s+/gm;
    const fromRegex = /^from\s+/gm;
    const imports = code.match(importRegex) || [];
    const fromImports = code.match(fromRegex) || [];
    
    if (imports.length > 0 || fromImports.length > 0) {
      const restrictedLibraries = ['os', 'subprocess', 'sys', 'pickle', 'shutil', 'tempfile'];
      const allImports = [...imports, ...fromImports];
      
      for (const imp of allImports) {
        for (const lib of restrictedLibraries) {
          if (imp.includes(`import ${lib}`) || imp.includes(`from ${lib}`)) {
            issues.push({
              type: 'security',
              level: 'warning',
              message: `Restricted library import detected: ${lib}`,
            });
          }
        }
      }
    }
    
    // 检查无限循环风险
    if (code.includes('while True:') || code.includes('while 1:')) {
      issues.push({
        type: 'security',
        level: 'warning',
        message: 'Potential infinite loop detected',
      });
    }
    
    // 检查文件操作
    if (code.includes('open(') || code.includes('open("')) {
      issues.push({
        type: 'security',
        level: 'warning',
        message: 'File opening operation detected',
      });
    }
    
    return {
      valid: issues.filter(i => i.level === 'critical').length === 0,
      issues,
    };
  }

  /**
   * 上传文件到沙箱
   * @param {string} userId
   * @param {string} conversationId
   * @param {string|Buffer|ArrayBuffer} content - 文件内容
   * @param {string} path - 文件路径
   * @returns {Promise<Object>}
   */
  async uploadFile(userId, conversationId, content, path) {
    try {
      logger.info(`[CodeExecutor] Uploading file ${path} to sandbox`);
      const result = await e2bClientManager.uploadFile(userId, conversationId, content, path);
      
      return {
        success: true,
        ...result,
      };
    } catch (error) {
      logger.error('[CodeExecutor] Error uploading file:', error);
      throw error;
    }
  }

  /**
   * 从沙箱下载文件
   * @param {string} userId
   * @param {string} conversationId
   * @param {string} path - 文件路径
   * @param {string} format - 返回格式（'text', 'bytes', 'blob', 'stream'）
   * @returns {Promise<string|Buffer>}
   */
  async downloadFile(userId, conversationId, path, format = 'text') {
    try {
      logger.info(`[CodeExecutor] Downloading file ${path} from sandbox`);
      const content = await e2bClientManager.downloadFile(userId, conversationId, path, format);
      
      return content;
    } catch (error) {
      logger.error('[CodeExecutor] Error downloading file:', error);
      throw error;
    }
  }

  /**
   * 列出沙箱中的文件
   * @param {string} userId
   * @param {string} conversationId
   * @param {string} path - 目录路径
   * @returns {Promise<Array>}
   */
  async listFiles(userId, conversationId, path = '/home/user') {
    try {
      logger.info(`[CodeExecutor] Listing files in sandbox at ${path}`);
      const files = await e2bClientManager.listFiles(userId, conversationId, path);
      
      return files;
    } catch (error) {
      logger.error('[CodeExecutor] Error listing files:', error);
      throw error;
    }
  }

  /**
   * 查找图表文件
   * @private
   */
  async _findPlotFiles(userId, conversationId, path = '/home/user') {
    try {
      const files = await e2bClientManager.listFiles(userId, conversationId, path);
      const plotExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.pdf', '.gif'];
      
      return files
        .filter(file => !file.isDirectory && plotExtensions.some(ext => file.name.endsWith(ext)))
        .map(file => ({
          name: file.name,
          path: file.path,
          type: file.name.split('.').pop(),
          size: file.size,
        }));
    } catch (error) {
      logger.warn(`[CodeExecutor] Failed to find plot files: ${error.message}`);
      return [];
    }
  }

  /**
   * 格式化输出
   * @private
   */
  _formatOutput(output) {
    if (!output) return '';
    
    if (Array.isArray(output)) {
      return output.map(item => item.message || item.line || item).join('\n');
    }
    
    return String(output);
  }
}

// 导出单例
const codeExecutor = new CodeExecutor();

module.exports = codeExecutor;
