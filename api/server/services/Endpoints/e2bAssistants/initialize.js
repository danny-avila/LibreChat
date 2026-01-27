const { logger, decryptV2 } = require('@librechat/data-schemas');
const { Sandbox } = require('@e2b/code-interpreter');
const OpenAI = require('openai');
const { ProxyAgent } = require('undici');

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
    // 注意：CPU 和内存限制在构建模板时设定（build.dev.ts），不在运行时设定
    this.defaultConfig = {
      // 默认使用官方基础模板，避免 404
      template: process.env.E2B_SANDBOX_TEMPLATE || 'code-interpreter', 
      timeoutMs: parseInt(process.env.E2B_DEFAULT_TIMEOUT_MS) || 3600000, // 1小时
    };
  }

  /**
   * Helper: Prepare data source environment variables with decryption
   */
  async _prepareDataSourceEnvs(dataSources) {
    const envs = {};
    if (!dataSources || !Array.isArray(dataSources)) return envs;

    for (const source of dataSources) {
      if (!source.name || !source.config) continue;
      
      const normalizedName = source.name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      const prefix = `DB_${normalizedName}`;
      
      let password = source.config.password;
      if (password) {
        try {
          password = await decryptV2(password);
        } catch (e) {
          // Ignore decryption errors, assume plaintext
        }
      }

      envs[`${prefix}_TYPE`] = source.type;
      envs[`${prefix}_HOST`] = source.config.host;
      envs[`${prefix}_PORT`] = String(source.config.port);
      envs[`${prefix}_USER`] = source.config.user;
      envs[`${prefix}_PASSWORD`] = password;
      envs[`${prefix}_NAME`] = source.config.database;
    }
    return envs;
  }

  /**
   * 创建新的沙箱实例
   * 使用E2B Code Interpreter SDK v2
   * 参考：https://e2b.dev/docs/sdk-reference/code-interpreter-js-sdk/v2/sandbox
   * @param {string} template - 沙箱模板名称 (如果不传，将使用默认配置)
   * @param {string} userId - 用户ID
   * @param {string} conversationId - 对话ID
   * @param {Object} assistantConfig - Assistant配置（包含E2B特有字段）
   * @returns {Promise<Object>} 沙箱实例
   */
  async createSandbox(template, userId, conversationId, assistantConfig = {}) {
    try {
      // 优先使用传入的 template，其次是 assistantConfig 中的配置，最后是默认值
      const templateToUse = template || assistantConfig.e2b_sandbox_template || this.defaultConfig.template;
      
      logger.info(`[E2B] Creating sandbox for user ${userId}, conversation ${conversationId}, template: ${templateToUse}`);
      
      // 添加网络访问配置
      if (assistantConfig.has_internet_access) {
        logger.info(`[E2B] Internet access enabled for this sandbox`);
      }

      // 提取并转换数据源配置为环境变量
      const envs = await this._prepareDataSourceEnvs(assistantConfig.data_sources);
      
      const sandboxOpts = {
        apiKey: this.apiKey,
        timeoutMs: assistantConfig.timeout_ms || this.defaultConfig.timeoutMs, // 1小时
        // 兼容性设置：如果 API Key 开启了 Secure Access 但模板不支持，需要设为 false
        // 使用 V2 构建的模板通常不需要此设置，但为了稳健性保留
        secure: false,
        envs: envs, // 注入环境变量
      };
      
      logger.info(`[E2B] Sandbox configuration: template=${templateToUse}, timeout=${sandboxOpts.timeoutMs}ms (${sandboxOpts.timeoutMs/60000} min)`);
      
      const sandbox = await Sandbox.create(templateToUse, sandboxOpts);
      
      const key = `${userId}:${conversationId}`;
      this.sandboxes.set(key, {
        id: sandbox.sandboxId, // 修正：使用正确的属性名（小写d）
        template,
        sandbox,
        userId,
        conversationId,
        createdAt: new Date(),
        config: assistantConfig,
      });
      
      logger.info(`[E2B] Sandbox created successfully: ${sandbox.sandboxId}`);
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
      
      const assistantConfig = sandboxData.config || {};
      
      // 提取并转换数据源配置为环境变量 (用于代码执行上下文)
      const dbEnvs = await this._prepareDataSourceEnvs(assistantConfig.data_sources);

      // 合并所有环境变量源
      const envVars = {
        ...(assistantConfig.env_vars instanceof Map ? Object.fromEntries(assistantConfig.env_vars) : {}),
        ...dbEnvs,
        ...(options.envVars || {}),
      };
      
      // 🛡️ SECURITY: Collect sensitive values for redaction
      // We identify sensitive keys and ensure we don't accidentally redact short common words
      const sensitiveValues = Object.entries(envVars)
        .filter(([key, val]) => {
          const k = key.toUpperCase();
          return (k.includes('PASSWORD') || k.includes('KEY') || k.includes('SECRET') || k.includes('TOKEN')) &&
                 val && val.length > 3; // Only redact values longer than 3 chars to avoid false positives
        })
        .map(([_, val]) => val);
      
      // 🔍 DEBUG: 打印环境变量
      logger.info(`[E2B] 🔧 Environment variables being injected (count: ${Object.keys(envVars).length})`);
      if (Object.keys(dbEnvs).length > 0) {
        logger.info(`[E2B] 📊 Database env vars: ${Object.keys(dbEnvs).join(', ')}`);
      }
      
      // Helper to redact logs
      const redactLogs = (text) => {
        if (!text || typeof text !== 'string') return text;
        let cleaned = text;
        sensitiveValues.forEach(secret => {
          // Global replacement of the secret
          if (secret) {
            cleaned = cleaned.split(secret).join('[REDACTED]');
          }
        });
        return cleaned;
      };

      // E2B SDK v2.8.4 正确用法 - 使用 runCode
      const result = await sandboxData.sandbox.runCode(code, {
        language: 'python',
        envs: Object.keys(envVars).length > 0 ? envVars : undefined,
        onStdout: (output) => {
          logger.debug(`[E2B] stdout: ${redactLogs(output.message)}`);
        },
        onStderr: (output) => {
          logger.debug(`[E2B] stderr: ${redactLogs(output.message)}`);
        },
        onResult: (result) => {
          logger.info(`[E2B] Code execution result in sandbox ${sandboxData.id}`);
        },
        onError: (error) => {
          const errorDetails = {
            message: error?.message || String(error),
            name: error?.name,
            stack: error?.stack
          };
          logger.error(`[E2B] Code execution error in sandbox ${sandboxData.id}: ${JSON.stringify(errorDetails, null, 2)}`);
        },
        timeoutMs: options.timeoutMs || assistantConfig.timeout_ms || this.defaultConfig.timeoutMs,
      });
      
      
      logger.info(`[E2B] Code execution completed in sandbox ${sandboxData.id}`);
      
      // 如果有错误，记录详细信息
      let hasError = false;
      let errorMessage = null;
      let errorName = null;
      let errorTraceback = null;
      
      if (result.error) {
        hasError = true;
        errorName = result.error.name;
        errorMessage = redactLogs(result.error.message || result.error.value || String(result.error));
        errorTraceback = redactLogs(result.error.traceback);
        
        const pythonError = {
          name: errorName,
          message: errorMessage,
          traceback: errorTraceback
        };
        logger.error(`[E2B] Execution result contains error: ${JSON.stringify(pythonError, null, 2)}`);
      }
      
      // Process logs with redaction
      const stdoutLogs = (result.logs?.stdout || []).map(log => redactLogs(log));
      const stderrLogs = (result.logs?.stderr || []).map(log => redactLogs(log));

      // 修正：根据E2B v2结构，stdout和stderr在logs对象中
      return {
        success: !hasError,
        stdout: stdoutLogs,
        stderr: stderrLogs,
        results: result.results || [],
        error: hasError ? errorMessage : null,
        errorName: hasError ? errorName : null,
        traceback: hasError ? errorTraceback : null,
        logs: { stdout: stdoutLogs, stderr: stderrLogs }, // Provide redacted logs object
        exitCode: result.exitCode || 0,
        runtime: result.runtime || 0,
      };
    } catch (error) {
      const exceptionDetails = {
        message: error.message,
        name: error.name,
        code: error.code,
        stack: error.stack
      };
      logger.error(`[E2B] Error executing code in sandbox ${sandboxData.id}: ${JSON.stringify(exceptionDetails, null, 2)}`);
      
      // 如果是超时或sandbox不存在错误,清理并重新抛出带提示的错误
      if (error.message?.includes('sandbox was not found') || 
          error.message?.includes('timeout') || 
          error.code === 502) {
        logger.warn(`[E2B] Sandbox ${sandboxData.id} expired or timed out, cleaning up local reference`);
        const key = `${userId}:${conversationId}`;
        this.sandboxes.delete(key);
        throw new Error('Sandbox expired due to inactivity. Please try again - a new sandbox will be created.');
      }
      
      throw new Error(`Code execution failed: ${error.message}`);
    }
  }

  /**
   * 上传文件到沙箱
   * 使用E2B SDK v2.8.4 files API
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
      
      // 修正：使用 sandbox.files 而不是 sandbox.filesystem
      const writeInfo = await sandboxData.sandbox.files.write(path, content);
      
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
   * 使用E2B SDK v2.8.4 files API
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
      
      // E2B files.read() returns a Response object
      const response = await sandboxData.sandbox.files.read(path);
      
      // Parse response based on format
      let content;
      if (format === 'buffer' || format === 'bytes') {
        const arrayBuffer = await response.arrayBuffer();
        content = Buffer.from(arrayBuffer);
      } else {
        // Default to text format
        content = await response.text();
      }
      
      logger.info(`[E2B] File downloaded successfully from sandbox ${sandboxData.id}`);
      return content;
    } catch (error) {
      logger.error(`[E2B] Error downloading file from sandbox ${sandboxData.id}:`, error);
      throw new Error(`File download failed: ${error.message}`);
    }
  }

  /**
   * 检查文件或目录是否存在
   * 使用E2B SDK v2.8.4 files API
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
      // 修正：使用 sandbox.files
      const exists = await sandboxData.sandbox.files.exists(path);
      return exists;
    } catch (error) {
      logger.error(`[E2B] Error checking file existence ${path}:`, error);
      throw new Error(`File existence check failed: ${error.message}`);
    }
  }

  /**
   * 获取文件或目录信息
   * 使用E2B SDK v2.8.4 files API
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
      // 修正：使用 sandbox.files
      const info = await sandboxData.sandbox.files.getInfo(path);
      
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
   * 使用E2B SDK v2.8.4 files API
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
      
      // 修正：使用 sandbox.files
      const created = await sandboxData.sandbox.files.makeDir(path);
      
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
   * 使用E2B SDK v2.8.4 files API
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
      
      // 修正：使用 sandbox.files
      await sandboxData.sandbox.files.remove(path);
      
      logger.info(`[E2B] File/directory deleted successfully: ${path}`);
    } catch (error) {
      logger.error(`[E2B] Error deleting ${path} from sandbox ${sandboxData.id}:`, error);
      throw new Error(`File deletion failed: ${error.message}`);
    }
  }

  /**
   * 列出沙箱中的文件
   * 使用E2B SDK v2.8.4 files API
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
      
      // 修正：使用 sandbox.files
      const files = await sandboxData.sandbox.files.list(path);
      
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
   * 获取沙箱信息
   * 使用E2B SDK v2.8.4 getInfo API
   * @param {string} userId 
   * @param {string} conversationId 
   * @returns {Promise<Object>} 沙箱信息
   */
  async getSandboxInfo(userId, conversationId) {
    const sandboxData = await this.getSandbox(userId, conversationId);
    
    if (!sandboxData || !sandboxData.sandbox) {
      throw new Error('Sandbox not found for this conversation');
    }
    
    try {
      logger.info(`[E2B] Getting sandbox info for ${sandboxData.id}`);
      
      const info = await sandboxData.sandbox.getInfo();
      
      return {
        sandboxId: sandboxData.id,
        sandboxDomain: sandboxData.sandbox.sandboxDomain,
        template: sandboxData.template,
        isRunning: await sandboxData.sandbox.isRunning(),
        createdAt: sandboxData.createdAt,
      };
    } catch (error) {
      logger.error(`[E2B] Error getting sandbox info ${sandboxData.id}:`, error);
      throw new Error(`Failed to get sandbox info: ${error.message}`);
    }
  }

  /**
   * 获取沙箱指标
   * 使用E2B SDK v2.8.4 getMetrics API
   * @param {string} userId 
   * @param {string} conversationId 
   * @returns {Promise<Array>} 指标列表
   */
  async getSandboxMetrics(userId, conversationId) {
    const sandboxData = await this.getSandbox(userId, conversationId);
    
    if (!sandboxData || !sandboxData.sandbox) {
      throw new Error('Sandbox not found for this conversation');
    }
    
    try {
      logger.info(`[E2B] Getting sandbox metrics for ${sandboxData.id}`);
      
      const metrics = await sandboxData.sandbox.getMetrics();
      
      return metrics;
    } catch (error) {
      logger.error(`[E2B] Error getting sandbox metrics ${sandboxData.id}:`, error);
      throw new Error(`Failed to get sandbox metrics: ${error.message}`);
    }
  }

  /**
   * 检查沙箱是否运行
   * 使用E2B SDK v2.8.4 isRunning API
   * @param {string} userId 
   * @param {string} conversationId 
   * @returns {Promise<boolean>} 是否运行
   */
  async isSandboxRunning(userId, conversationId) {
    const sandboxData = await this.getSandbox(userId, conversationId);
    
    if (!sandboxData || !sandboxData.sandbox) {
      return false;
    }
    
    try {
      return await sandboxData.sandbox.isRunning();
    } catch (error) {
      logger.error(`[E2B] Error checking sandbox running status ${sandboxData.id}:`, error);
      return false;
    }
  }

  /**
   * 设置沙箱超时
   * 使用E2B SDK v2.8.4 setTimeout API
   * @param {string} userId 
   * @param {string} conversationId 
   * @param {number} timeoutMs - 超时时间（毫秒）
   * @returns {Promise<void>}
   */
  async setSandboxTimeout(userId, conversationId, timeoutMs) {
    const sandboxData = await this.getSandbox(userId, conversationId);
    
    if (!sandboxData || !sandboxData.sandbox) {
      throw new Error('Sandbox not found for this conversation');
    }
    
    try {
      logger.info(`[E2B] Setting sandbox timeout to ${timeoutMs}ms (${timeoutMs / 1000}s)`);
      await sandboxData.sandbox.setTimeout(timeoutMs);
    } catch (error) {
      logger.error(`[E2B] Error setting sandbox timeout ${sandboxData.id}:`, error);
      throw new Error(`Failed to set sandbox timeout: ${error.message}`);
    }
  }

  /**
   * 获取文件上传URL
   * 使用E2B SDK v2.8.4 uploadUrl API
   * @param {string} userId 
   * @param {string} conversationId 
   * @param {string} path - 文件路径（可选）
   * @returns {Promise<string>} 上传URL
   */
  async getUploadUrl(userId, conversationId, path = undefined) {
    const sandboxData = await this.getSandbox(userId, conversationId);
    
    if (!sandboxData || !sandboxData.sandbox) {
      throw new Error('Sandbox not found for this conversation');
    }
    
    try {
      logger.info(`[E2B] Getting upload URL for ${sandboxData.id}`);
      const url = await sandboxData.sandbox.uploadUrl(path);
      return url;
    } catch (error) {
      logger.error(`[E2B] Error getting upload URL ${sandboxData.id}:`, error);
      throw new Error(`Failed to get upload URL: ${error.message}`);
    }
  }

  /**
   * 获取文件下载URL
   * 使用E2B SDK v2.8.4 downloadUrl API
   * @param {string} userId 
   * @param {string} conversationId 
   * @param {string} path - 文件路径
   * @returns {Promise<string>} 下载URL
   */
  async getDownloadUrl(userId, conversationId, path) {
    const sandboxData = await this.getSandbox(userId, conversationId);
    
    if (!sandboxData || !sandboxData.sandbox) {
      throw new Error('Sandbox not found for this conversation');
    }
    
    try {
      logger.info(`[E2B] Getting download URL for ${path} from sandbox ${sandboxData.id}`);
      const url = await sandboxData.sandbox.downloadUrl(path);
      return url;
    } catch (error) {
      logger.error(`[E2B] Error getting download URL ${sandboxData.id}:`, error);
      throw new Error(`Failed to get download URL: ${error.message}`);
    }
  }

  /**
   * 获取沙箱主机地址（用于从外部访问沙箱服务）
   * 使用E2B SDK v2.8.4 getHost API
   * @param {string} userId 
   * @param {string} conversationId 
   * @param {number} port - 端口号
   * @returns {Promise<string>} 主机地址
   */
  async getSandboxHost(userId, conversationId, port) {
    const sandboxData = await this.getSandbox(userId, conversationId);
    
    if (!sandboxData || !sandboxData.sandbox) {
      throw new Error('Sandbox not found for this conversation');
    }
    
    try {
      logger.info(`[E2B] Getting host address for sandbox ${sandboxData.id} on port ${port}`);
      const host = sandboxData.sandbox.getHost(port);
      return host;
    } catch (error) {
      logger.error(`[E2B] Error getting sandbox host ${sandboxData.id}:`, error);
      throw new Error(`Failed to get sandbox host: ${error.message}`);
    }
  }

  /**
   * 获取MCP Token（如果启用了MCP）
   * 使用E2B SDK v2.8.4 betaGetMcpToken API
   * @param {string} userId 
   * @param {string} conversationId 
   * @returns {Promise<string|undefined>} MCP Token
   */
  async getMcpToken(userId, conversationId) {
    const sandboxData = await this.getSandbox(userId, conversationId);
    
    if (!sandboxData || !sandboxData.sandbox) {
      throw new Error('Sandbox not found for this conversation');
    }
    
    try {
      // 修正：使用 betaGetMcpToken
      const token = await sandboxData.sandbox.betaGetMcpToken();
      if (token) {
        logger.info(`[E2B] MCP token found for sandbox ${sandboxData.id}`);
      }
      return token;
    } catch (error) {
      logger.error(`[E2B] Error getting MCP token ${sandboxData.id}:`, error);
      return undefined;
    }
  }

  /**
   * 获取MCP URL
   * 使用E2B SDK v2.8.4 betaGetMcpUrl API
   * @param {string} userId 
   * @param {string} conversationId 
   * @returns {string>} MCP URL
   */
  async getMcpUrl(userId, conversationId) {
    const sandboxData = await this.getSandbox(userId, conversationId);
    
    if (!sandboxData || !sandboxData.sandbox) {
      throw new Error('Sandbox not found for this conversation');
    }
    
    try {
      // 修正：使用 betaGetMcpUrl
      logger.info(`[E2B] Getting MCP URL for sandbox ${sandboxData.id}`);
      return sandboxData.sandbox.betaGetMcpUrl();
    } catch (error) {
      logger.error(`[E2B] Error getting MCP URL ${sandboxData.id}:`, error);
      throw new Error(`Failed to get MCP URL: ${error.message}`);
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

/**
 * 标准初始化函数 - 适配 LibreChat 端点架构
 * 同时初始化 E2B Client 和 OpenAI Client (支持 Azure OpenAI)
 * @param {Object} params
 * @param {ServerRequest} params.req
 * @param {ServerResponse} params.res
 * @returns {Promise<Object>} 初始化后的客户端环境
 */
const initializeClient = async ({ req, res }) => {
  // 从环境变量中读取 OpenAI/Azure OpenAI 配置
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
  const azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview';
  const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
  
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const PROXY = process.env.PROXY;

  let openai;

  // 优先使用 Azure OpenAI
  if (azureEndpoint && azureApiKey && azureApiKey !== 'user_provided') {
    logger.info('[E2B] Initializing Azure OpenAI client for E2B Agent');
    logger.info(`[E2B] Azure Endpoint: ${azureEndpoint}`);
    logger.info(`[E2B] Azure Deployment: ${azureDeployment}`);
    logger.info(`[E2B] Azure API Version: ${azureApiVersion}`);

    const opts = {
      apiKey: azureApiKey,
      baseURL: `${azureEndpoint}/openai/deployments/${azureDeployment}`,
      defaultQuery: { 'api-version': azureApiVersion },
      defaultHeaders: { 'api-key': azureApiKey },
    };

    if (PROXY) {
      const proxyAgent = new ProxyAgent(PROXY);
      opts.fetchOptions = {
        dispatcher: proxyAgent,
      };
    }

    openai = new OpenAI(opts);
    openai.locals = { 
      azureOptions: {
        azureOpenAIApiDeploymentName: azureDeployment,
        azureOpenAIApiVersion: azureApiVersion,
      }
    };
    // Store deployment name for E2B Agent to use as model parameter
    openai.azureDeployment = azureDeployment;
    
  } else if (openaiApiKey && openaiApiKey !== 'user_provided') {
    // 使用标准 OpenAI API
    logger.info('[E2B] Initializing OpenAI client for E2B Agent');
    
    const opts = {
      apiKey: openaiApiKey,
    };

    if (PROXY) {
      const proxyAgent = new ProxyAgent(PROXY);
      opts.fetchOptions = {
        dispatcher: proxyAgent,
      };
    }

    openai = new OpenAI(opts);
  } else {
    throw new Error('[E2B] No valid API key found. Please set AZURE_OPENAI_API_KEY or OPENAI_API_KEY in .env file');
  }

  openai.req = req;
  openai.res = res;

  // 返回管理器和 OpenAI 客户端
  // 如果使用 Azure，返回 Azure key；否则返回标准 OpenAI key
  const apiKeyToReturn = azureApiKey || openaiApiKey;
  
  return {
    e2bClient: e2bClientManager,
    openai,
    openAIApiKey: apiKeyToReturn,
  };
};

// 优雅关闭处理
process.on('SIGTERM', async () => {
  logger.info('[E2B] SIGTERM received, cleaning up sandboxes...');
  await e2bClientManager.cleanup();
});

process.on('SIGINT', async () => {
  logger.info('[E2B] SIGINT received, cleaning up sandboxes...');
  await e2bClientManager.cleanup();
});

module.exports = {
  initializeClient,
  e2bClientManager,
};
