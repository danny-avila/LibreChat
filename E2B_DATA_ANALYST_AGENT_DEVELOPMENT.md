# E2B Data Analyst Agent 开发文档

## 1. 项目概述

### 1.1 目标
在LibreChat项目中开发基于E2B沙箱的数据分析Agent模块，与Azure Assistants**并行**运行，用于处理Azure Assistants无法解决的场景（如长时间运行的代码执行、XGBoost等密集型工作负载）。

### 1.2 架构定位
```
┌─────────────────────────────────────────────────────────┐
│                    LibreChat Frontend                    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  API Layer (Express.js)                  │
│  ┌──────────────────┐  ┌──────────────────┐              │
│  │ Azure Assistants │  │  E2B Assistants  │              │
│  │  (现有)          │  │  (新增)          │              │
│  └──────────────────┘  └──────────────────┘              │
│         │                        │                       │
│         ▼                        ▼                       │
│  ┌──────────────────┐  ┌──────────────────┐              │
│  │ Azure OpenAI API │  │  E2B + LLM API   │              │
│  └──────────────────┘  └──────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

**重要说明**：
- **不删除**现有的Azure Assistants模块
- 两者并行运行，根据使用场景选择
- E2B Agent专门用于需要长时间代码执行、复杂计算的场景
- 访问控制（私有/公共Assistant）由协作人员实现

---

## 2. 职责分工

| 模块 | 负责人 | 说明 |
|------|--------|------|
| E2B客户端集成 | **当前开发** | E2B SDK集成、沙箱管理 |
| Code Execution服务 | **当前开发** | 代码执行、结果捕获 |
| Data Analyst Agent | **当前开发** | Agent核心逻辑、LLM集成 |
| 文件处理 | **当前开发** | 文件上传、数据集加载 |
| 访问控制 | **协作人员** | 私有/公共Assistant权限管理 |
| 前端UI | **协作人员** | E2B Assistant界面展示 |
| 配置管理 | **协作人员** | 环境变量、配置文件 |

---

## 3. 技术栈

### 3.1 核心依赖
- **E2B Code Interpreter SDK**: `@e2b/code-interpreter`
- **OpenAI API**: `openai` (用于LLM)
- **MongoDB**: 存储Assistant配置
- **Node.js/Express.js**: 后端框架

### 3.2 E2B沙箱模板
- **python3-data-analysis**: 预装Python数据分析库的标准模板
- 自定义库：pandas, numpy, matplotlib, seaborn, scikit-learn, xgboost

---

## 4. 目录结构规划

```
LibreChat/
├── api/
│   ├── models/
│   │   └── E2BAssistant.js              # [新增] E2B Assistant数据模型
│   ├── server/
│   │   ├── services/
│   │   │   ├── Agents/
│   │   │   │   └── e2bAgent/
│   │   │   │       ├── index.js        # [新增] Data Analyst Agent核心
│   │   │   │       ├── prompts.js     # [新增] 系统提示词
│   │   │   │       └── tools.js       # [新增] 工具定义
│   │   │   ├── Endpoints/
│   │   │   │   └── e2bAssistants/
│   │   │   │       ├── initialize.js  # [新增] E2B客户端初始化
│   │   │   │       └── sandboxManager.js # [新增] 沙箱生命周期管理
│   │   │   ├── Sandbox/
│   │   │   │   ├── codeExecutor.js    # [新增] 代码执行服务
│   │   │   │   └── fileHandler.js     # [新增] 文件处理服务
│   │   │   └── Config/
│   │   │       └── loadE2BConfig.js   # [新增] E2B配置加载
│   │   └── routes/
│   │       └── e2bAssistants/
│   │           ├── index.js           # [新增] 路由注册
│   │           └── controller.js      # [新增] 控制器逻辑
│   └── tests/
│       └── e2b/
│           ├── client.test.js         # [新增] E2B客户端测试
│           ├── agent.test.js          # [新增] Agent测试
│           └── sandbox.test.js        # [新增] 沙箱测试
├── packages/
│   └── data-schemas/
│       ├── src/
│       │   ├── schema/
│       │   │   └── e2bAssistant.ts    # [新增] E2B Assistant Schema
│       │   ├── models/
│       │   │   └── e2bAssistant.ts    # [新增] E2B Assistant Model
│       │   └── types/
│       │       └── e2bAssistant.ts    # [新增] TypeScript类型定义
└── docs/
    └── E2B_INTEGRATION.md             # [新增] 集成文档
```

---

## 5. 数据库设计

### 5.1 E2BAssistant Schema

```typescript
// packages/data-schemas/src/schema/e2bAssistant.ts
import { Schema } from 'mongoose';
import type { IE2BAssistant } from '~/types';

const e2bAssistantSchema = new Schema<IE2BAssistant>(
  {
    id: {
      type: String,
      index: true,
      unique: true,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    instructions: {
      type: String,
      required: true,
    },
    avatar: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    
    // E2B特定配置
    e2b_sandbox_template: {
      type: String,
      default: 'python3-data-analysis',
    },
    e2b_config: {
      timeout_ms: { 
        type: Number, 
        default: 300000 // 5分钟
      },
      max_memory_mb: { 
        type: Number, 
        default: 2048 
      },
      max_cpu_percent: { 
        type: Number, 
        default: 80 
      },
    },
    
    // 代码执行设置
    code_execution_mode: {
      type: String,
      enum: ['interactive', 'batch'],
      default: 'interactive',
    },
    allowed_libraries: {
      type: [String],
      default: ['pandas', 'numpy', 'matplotlib', 'seaborn', 'scikit-learn', 'xgboost'],
    },
    
    // LLM配置
    provider: {
      type: String,
      required: true,
    },
    model: {
      type: String,
      required: true,
    },
    model_parameters: {
      type: Object,
      default: {},
    },
    
    // 文件和工具
    file_ids: { 
      type: [String], 
      default: [] 
    },
    tools: { 
      type: [String], 
      default: [] 
    },
    
    // 对话
    conversation_starters: {
      type: [String],
      default: [],
    },
    
    // 访问控制 - 由协作人员实现
    is_public: {
      type: Boolean,
      default: false,
    },
    access_level: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

e2bAssistantSchema.index({ updatedAt: -1, _id: 1 });

export default e2bAssistantSchema;
```

### 5.2 TypeScript类型定义

```typescript
// packages/data-schemas/src/types/e2bAssistant.ts
import { Document, Types } from 'mongoose';

export interface IE2BAssistant extends Document {
  id: string;
  name: string;
  description?: string;
  instructions: string;
  avatar?: {
    filepath: string;
    source: string;
  };
  author: Types.ObjectId;
  
  // E2B配置
  e2b_sandbox_template: string;
  e2b_config: {
    timeout_ms: number;
    max_memory_mb: number;
    max_cpu_percent: number;
  };
  
  // 代码执行
  code_execution_mode: 'interactive' | 'batch';
  allowed_libraries: string[];
  
  // LLM
  provider: string;
  model: string;
  model_parameters?: Record<string, any>;
  
  // 文件和工具
  file_ids?: string[];
  tools?: string[];
  conversation_starters?: string[];
  
  // 访问控制（协作部分）
  is_public: boolean;
  access_level: number;
  
  createdAt?: Date;
  updatedAt?: Date;
}
```

---

## 6. E2B模块开发（当前负责）

### 6.1 E2B客户端初始化

**文件**: `api/server/services/Endpoints/e2bAssistants/initialize.js`

```javascript
const { Sandbox } = require('@e2b/code-interpreter');
const { logger } = require('@librechat/data-schemas');

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
   * @returns {Promise<Sandbox>} 沙箱实例
   */
  async createSandbox(template = 'python3-data-analysis', userId, conversationId) {
    try {
      logger.info(`[E2B] Creating sandbox for user ${userId}, conversation ${conversationId}`);
      
      const sandbox = await Sandbox.create({
        template,
        apiKey: this.apiKey,
        timeoutMs: 600000, // 10分钟最大超时
      });
      
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
   * @returns {Sandbox|undefined}
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
```

---

### 6.2 代码执行服务

**文件**: `api/server/services/Sandbox/codeExecutor.js`

```javascript
const { logger } = require('@librechat/data-schemas');

class CodeExecutor {
  constructor(sandbox) {
    this.sandbox = sandbox;
  }

  /**
   * 在沙箱中执行代码
   * @param {string} code - 要执行的Python代码
   * @param {number} timeout - 超时时间（秒）
   * @returns {Promise<Object>} 执行结果
   */
  async executeCode(code, timeout = 300) {
    try {
      logger.debug(`[CodeExecutor] Executing code, timeout: ${timeout}s`);
      
      const startTime = Date.now();
      
      const execution = await this.sandbox.runCode(code, {
        timeoutMs: timeout * 1000,
        onStdout: (data) => {
          logger.debug(`[CodeExecutor] stdout: ${data.slice(0, 200)}...`);
        },
        onStderr: (data) => {
          logger.warn(`[CodeExecutor] stderr: ${data.slice(0, 200)}...`);
        },
      });
      
      const duration = Date.now() - startTime;
      
      return {
        success: true,
        output: execution.stdout || '',
        error: execution.stderr || '',
        runtimeError: execution.error || null,
        duration,
      };
    } catch (error) {
      logger.error('[CodeExecutor] Execution error:', error);
      
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 上传文件到沙箱
   * @param {string|Buffer} content - 文件内容
   * @param {string} filename - 文件名
   * @returns {Promise<string>} 文件路径
   */
  async uploadFile(content, filename) {
    const path = `/home/user/${filename}`;
    logger.info(`[CodeExecutor] Uploading file: ${path}`);
    
    await this.sandbox.filesystem.write(path, content);
    return path;
  }

  /**
   * 从沙箱下载文件
   * @param {string} path - 文件路径
   * @returns {Promise<Buffer>} 文件内容
   */
  async downloadFile(path) {
    logger.info(`[CodeExecutor] Downloading file: ${path}`);
    const content = await this.sandbox.filesystem.read(path);
    return content;
  }

  /**
   * 列出沙箱中的文件
   * @param {string} directory - 目录路径
   * @returns {Promise<Array>} 文件列表
   */
  async listFiles(directory = '/home/user') {
    logger.debug(`[CodeExecutor] Listing files in: ${directory}`);
    const files = await this.sandbox.filesystem.list(directory);
    return files;
  }

  /**
   * 执行数据集加载代码
   * @param {string} filepath - 文件路径
   * @param {string} filetype - 文件类型 (csv, excel, json)
   * @returns {Promise<Object>} 加载结果
   */
  async loadDataset(filepath, filetype = 'csv') {
    const variableName = 'df';
    let loadCode = '';

    switch (filetype) {
      case 'csv':
        loadCode = `df = pd.read_csv('${filepath}')`;
        break;
      case 'excel':
      case 'xlsx':
        loadCode = `df = pd.read_excel('${filepath}')`;
        break;
      case 'json':
        loadCode = `df = pd.read_json('${filepath}')`;
        break;
      case 'parquet':
        loadCode = `df = pd.read_parquet('${filepath}')`;
        break;
      default:
        loadCode = `df = pd.read_csv('${filepath}')`;
    }

    // 获取数据集信息
    const infoCode = `
${loadCode}
dataset_info = {
    'shape': df.shape,
    'columns': df.columns.tolist(),
    'dtypes': df.dtypes.astype(str).to_dict(),
    'head': df.head().to_dict(),
    'memory_usage': df.memory_usage(deep=True).sum()
}
print(json.dumps(dataset_info, default=str))
`;

    const result = await this.executeCode(infoCode, 30);

    if (!result.success) {
      throw new Error(`Failed to load dataset: ${result.error}`);
    }

    // 解析JSON输出
    const match = result.output.match(/\{[\s\S]*\}/);
    if (match) {
      const info = JSON.parse(match[0]);
      return {
        variableName,
        info,
      };
    }

    throw new Error('Failed to parse dataset info');
  }
}

module.exports = CodeExecutor;
```

---

### 6.3 Data Analyst Agent核心逻辑

**文件**: `api/server/services/Agents/e2bAgent/index.js`

```javascript
const { logger } = require('@librechat/data-schemas');
const CodeExecutor = require('~/server/services/Sandbox/codeExecutor');
const { getSystemPrompt, getToolsDefinitions } = require('./prompts');
const { getToolFunction } = require('./tools');

class E2BDataAnalystAgent {
  constructor(config) {
    this.llmClient = config.llmClient;
    this.e2bClientManager = config.e2bClientManager;
    this.userId = config.userId;
    this.conversationId = config.conversationId;
    this.assistant = config.assistant;
    
    // 对话上下文
    this.messages = [];
    this.sandbox = null;
    this.executor = null;
  }

  /**
   * 处理用户消息
   * @param {string} userMessage 
   * @returns {Promise<Object>} Agent响应
   */
  async processMessage(userMessage) {
    try {
      logger.info(`[E2BAgent] Processing message for user ${this.userId}`);

      // 1. 确保沙箱已初始化
      if (!this.sandbox) {
        await this.initializeSandbox();
      }

      // 2. 添加用户消息到上下文
      this.messages.push({
        role: 'user',
        content: userMessage,
      });

      // 3. 生成LLM响应（可能包含工具调用）
      const llmResponse = await this.generateLLMResponse();

      // 4. 处理工具调用（如果需要）
      if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
        const toolResults = await this.executeToolCalls(llmResponse.tool_calls);
        
        // 5. 将工具调用和结果添加到上下文
        this.messages.push({
          role: 'assistant',
          content: llmResponse.content,
          tool_calls: llmResponse.tool_calls,
        });

        for (const result of toolResults) {
          this.messages.push({
            role: 'tool',
            tool_call_id: result.tool_call_id,
            content: JSON.stringify(result.result),
          });
        }

        // 6. 基于工具结果生成最终响应
        const finalResponse = await this.generateLLMResponse();
        this.messages.push({
          role: 'assistant',
          content: finalResponse.content,
        });

        return {
          message: finalResponse.content,
          tool_calls: llmResponse.tool_calls,
          tool_results: toolResults,
        };
      }

      // 没有工具调用，直接返回
      this.messages.push({
        role: 'assistant',
        content: llmResponse.content,
      });

      return {
        message: llmResponse.content,
      };
    } catch (error) {
      logger.error('[E2BAgent] Error processing message:', error);
      throw error;
    }
  }

  /**
   * 初始化沙箱
   */
  async initializeSandbox() {
    this.sandbox = await this.e2bClientManager.createSandbox(
      this.assistant.e2b_sandbox_template,
      this.userId,
      this.conversationId
    );
    
    this.executor = new CodeExecutor(this.sandbox);
    logger.info(`[E2BAgent] Sandbox initialized: ${this.sandbox.id}`);
  }

  /**
   * 生成LLM响应
   * @returns {Promise<Object>}
   */
  async generateLLMResponse() {
    const systemPrompt = getSystemPrompt(this.assistant);
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...this.messages,
    ];

    const tools = getToolsDefinitions();

    const completion = await this.llmClient.chat.completions.create({
      model: this.assistant.model,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: this.assistant.model_parameters?.temperature || 0.7,
      max_tokens: this.assistant.model_parameters?.max_tokens || 2000,
    });

    const message = completion.choices[0].message;
    
    return {
      content: message.content,
      tool_calls: message.tool_calls,
    };
  }

  /**
   * 执行工具调用
   * @param {Array} toolCalls 
   * @returns {Promise<Array>}
   */
  async executeToolCalls(toolCalls) {
    const results = [];

    for (const toolCall of toolCalls) {
      const { id, function: func } = toolCall;
      const { name, arguments: args } = func;
      
      logger.info(`[E2BAgent] Executing tool: ${name}`);
      
      try {
        const toolFunc = getToolFunction(name);
        const toolArgs = JSON.parse(args);
        
        // 传入executor给工具函数
        const result = await toolFunc(toolArgs, this.executor);
        
        results.push({
          tool_call_id: id,
          tool_name: name,
          success: true,
          result,
        });
      } catch (error) {
        logger.error(`[E2BAgent] Tool execution error (${name}):`, error);
        
        results.push({
          tool_call_id: id,
          tool_name: name,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * 清理资源
   */
  async cleanup() {
    if (this.sandbox) {
      await this.e2bClientManager.killSandbox(
        this.userId,
        this.conversationId
      );
      this.sandbox = null;
      this.executor = null;
    }
    this.messages = [];
  }
}

module.exports = E2BDataAnalystAgent;
```

---

### 6.4 系统提示词和工具定义

**文件**: `api/server/services/Agents/e2bAgent/prompts.js`

```javascript
/**
 * 生成系统提示词
 * @param {Object} assistant - Assistant配置
 * @returns {string}
 */
function getSystemPrompt(assistant) {
  const libraries = assistant.allowed_libraries.join(', ');
  
  return `You are a Data Analyst Assistant with access to a Python code execution environment.

## Your Capabilities

You can perform data analysis tasks using these libraries:
- ${libraries}

## When You Should Write Code

You should use code execution when:
1. Analyzing or processing data (loading, cleaning, transforming)
2. Performing statistical analysis or computations
3. Creating visualizations (charts, plots, graphs)
4. Running machine learning models (scikit-learn, xgboost)
5. Any task that requires actual computation or data manipulation

## How to Use Tools

1. Use the \`execute_code\` tool to run Python code
2. Use the \`upload_file\` tool if you need to load data
3. Always display results in a clear, human-readable format
4. For visualizations, save plots and explain what they show

## Important Guidelines

- Always explain what you're going to do before writing code
- Show key results and insights, not just raw output
- If code fails, try to fix it and explain the issue
- Optimize code for performance when working with large datasets
- Be mindful of the ${assistant.e2b_config.timeout_ms / 1000} second timeout limit

## Current Configuration

- Sandbox template: ${assistant.e2b_sandbox_template}
- Code execution mode: ${assistant.code_execution_mode}
- Timeout: ${assistant.e2b_config.timeout_ms / 1000} seconds
- Available libraries: ${libraries}

Help users analyze data, find insights, and make data-driven decisions!`;
}

/**
 * 获取工具定义
 * @returns {Array}
 */
function getToolsDefinitions() {
  return [
    {
      type: 'function',
      function: {
        name: 'execute_code',
        description: 'Execute Python code in a sandboxed environment for data analysis, visualization, or computation',
        parameters: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'Python code to execute. Can use pandas, numpy, matplotlib, seaborn, scikit-learn, xgboost, etc.',
            },
          },
          required: ['code'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'upload_file',
        description: 'Upload a file to the sandbox for analysis (CSV, Excel, JSON, etc.)',
        parameters: {
          type: 'object',
          properties: {
            filename: {
              type: 'string',
              description: 'Name of the file',
            },
            content: {
              type: 'string',
              description: 'File content (base64 encoded for binary files)',
            },
          },
          required: ['filename', 'content'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'download_file',
        description: 'Download a file from the sandbox (e.g., generated plots, processed data)',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file in the sandbox',
            },
          },
          required: ['path'],
        },
      },
    },
  ];
}

module.exports = {
  getSystemPrompt,
  getToolsDefinitions,
};
```

---

**文件**: `api/server/services/Agents/e2bAgent/tools.js`

```javascript
const CodeExecutor = require('~/server/services/Sandbox/codeExecutor');

/**
 * 工具函数映射
 */
const toolFunctions = {
  /**
   * 执行Python代码
   */
  execute_code: async ({ code }, executor) => {
    if (!executor) {
      throw new Error('No active executor');
    }
    
    const result = await executor.executeCode(code, 300);
    
    if (!result.success) {
      return {
        error: result.error,
        stderr: result.error,
      };
    }
    
    return {
      stdout: result.output,
      stderr: result.error,
      duration: result.duration,
    };
  },

  /**
   * 上传文件
   */
  upload_file: async ({ filename, content }, executor) => {
    if (!executor) {
      throw new Error('No active executor');
    }
    
    // 尝试解码base64
    let fileContent;
    try {
      fileContent = Buffer.from(content, 'base64');
    } catch {
      fileContent = Buffer.from(content);
    }
    
    const path = await executor.uploadFile(fileContent, filename);
    
    return {
      path,
      filename,
      size: fileContent.length,
    };
  },

  /**
   * 下载文件
   */
  download_file: async ({ path }, executor) => {
    if (!executor) {
      throw new Error('No active executor');
    }
    
    const content = await executor.downloadFile(path);
    
    return {
      path,
      content: content.toString('base64'),
      size: content.length,
    };
  },
};

/**
 * 获取工具函数
 * @param {string} toolName 
 * @returns {Function}
 */
function getToolFunction(toolName) {
  const func = toolFunctions[toolName];
  if (!func) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  return func;
}

module.exports = {
  getToolFunction,
};
```

---

### 6.5 API控制器

**文件**: `api/server/routes/e2bAssistants/controller.js`

```javascript
const { logger } = require('@librechat/data-schemas');
const { E2BDataAnalystAgent } = require('~/server/services/Agents/e2bAgent');
const e2bClientManager = require('~/server/services/Endpoints/e2bAssistants/initialize');
const { getOpenAIClient } = require('~/server/controllers/assistants/helpers');
const { createE2BAssistantDoc, getE2BAssistantDocs, updateE2BAssistantDoc, deleteE2BAssistantDoc } = require('~/models/E2BAssistant');
const { nanoid } = require('nanoid');

/**
 * 创建E2B Assistant
 */
const createAssistant = async (req, res) => {
  try {
    const { name, description, instructions, e2b_config, model, model_parameters, ...assistantData } = req.body;
    
    logger.info(`[E2B Assistant] Creating assistant: ${name}`);
    
    const assistant = await createE2BAssistantDoc({
      id: nanoid(),
      name,
      description,
      instructions,
      author: req.user.id,
      e2b_config: e2b_config || {},
      model: model || 'gpt-4-turbo-preview',
      model_parameters: model_parameters || {},
      code_execution_mode: assistantData.code_execution_mode || 'interactive',
      e2b_sandbox_template: assistantData.e2b_sandbox_template || 'python3-data-analysis',
      allowed_libraries: assistantData.allowed_libraries || [
        'pandas', 'numpy', 'matplotlib', 'seaborn', 'scikit-learn', 'xgboost'
      ],
      conversation_starters: assistantData.conversation_starters || [],
      is_public: false, // 默认私有，由协作人员实现公共逻辑
      access_level: 0,
    });

    logger.info(`[E2B Assistant] Created assistant: ${assistant.id}`);
    res.status(201).json(assistant);
  } catch (error) {
    logger.error('[E2B Assistant] Error creating assistant:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * 获取Assistant列表（访问控制由协作人员实现）
 */
const listAssistants = async (req, res) => {
  try {
    const query = {};
    
    // TODO: 访问控制逻辑由协作人员实现
    // 现在返回当前用户创建的所有assistants
    query.author = req.user.id;
    
    const assistants = await getE2BAssistantDocs(query);
    res.json(assistants);
  } catch (error) {
    logger.error('[E2B Assistant] Error listing assistants:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * 获取单个Assistant
 */
const getAssistant = async (req, res) => {
  try {
    const { assistant_id } = req.params;
    
    const assistant = await getE2BAssistantDocs({ id: assistant_id });
    
    if (!assistant || assistant.length === 0) {
      return res.status(404).json({ error: 'Assistant not found' });
    }
    
    // TODO: 访问控制检查（协作人员）
    
    res.json(assistant[0]);
  } catch (error) {
    logger.error('[E2B Assistant] Error getting assistant:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * 更新Assistant
 */
const updateAssistant = async (req, res) => {
  try {
    const { assistant_id } = req.params;
    const updateData = { ...req.body };
    
    // 移除不允许更新的字段
    delete updateData.id;
    delete updateData.author;
    delete updateData.createdAt;
    
    const assistant = await updateE2BAssistantDoc(
      { id: assistant_id },
      updateData
    );
    
    if (!assistant) {
      return res.status(404).json({ error: 'Assistant not found' });
    }
    
    res.json(assistant);
  } catch (error) {
    logger.error('[E2B Assistant] Error updating assistant:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * 删除Assistant
 */
const deleteAssistant = async (req, res) => {
  try {
    const { assistant_id } = req.params;
    
    const result = await deleteE2BAssistantDoc({ id: assistant_id });
    
    if (!result) {
      return res.status(404).json({ error: 'Assistant not found' });
    }
    
    res.json({ message: 'Assistant deleted successfully' });
  } catch (error) {
    logger.error('[E2B Assistant] Error deleting assistant:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * 与Assistant对话
 */
const chat = async (req, res) => {
  try {
    const { assistant_id } = req.params;
    const { message, conversation_id } = req.body;
    
    logger.info(`[E2B Assistant] Chat request: assistant=${assistant_id}, conversation=${conversation_id}`);
    
    // 获取Assistant配置
    const assistants = await getE2BAssistantDocs({ id: assistant_id });
    
    if (!assistants || assistants.length === 0) {
      return res.status(404).json({ error: 'Assistant not found' });
    }
    
    const assistant = assistants[0];
    
    // TODO: 访问控制检查（协作人员）
    
    // 初始化Agent
    const agent = new E2BDataAnalystAgent({
      llmClient: await getOpenAIClient({ req, res }),
      e2bClientManager,
      userId: req.user.id,
      conversationId: conversation_id || nanoid(),
      assistant,
    });
    
    // 处理消息
    const response = await agent.processMessage(message);
    
    res.json(response);
  } catch (error) {
    logger.error('[E2B Assistant] Error in chat:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createAssistant,
  listAssistants,
  getAssistant,
  updateAssistant,
  deleteAssistant,
  chat,
};
```

---

## 7. 环境配置

### 7.1 环境变量

在 `.env` 中添加：

```bash
# E2B Configuration
E2B_API_KEY=your_e2b_api_key_here
E2B_SANDBOX_TEMPLATE=python3-data-analysis

# E2B Sandbox Defaults
E2B_DEFAULT_TIMEOUT_MS=300000
E2B_DEFAULT_MAX_MEMORY_MB=2048
E2B_DEFAULT_MAX_CPU_PERCENT=80
```

### 7.2 依赖安装

```bash
npm install @e2b/code-interpreter
```

---

## 8. 开发计划（当前负责部分）

### Phase 1: 基础设施搭建（第1周）
- [x] 创建数据库Schema和Model
- [ ] 实现E2B客户端管理器（SandboxManager）
- [ ] 实现代码执行服务（CodeExecutor）
- [ ] 编写单元测试

### Phase 2: Agent核心逻辑（第2周）
- [ ] 实现Data Analyst Agent类
- [ ] 实现系统提示词生成
- [ ] 实现工具定义和工具执行
- [ ] 集成OpenAI LLM
- [ ] 编写集成测试

### Phase 3: API层（第3周）
- [ ] 实现控制器函数
- [ ] 实现路由注册
- [ ] 实现文件上传/下载
- [ ] 编写API测试

### Phase 4: 优化和测试（第4周）
- [ ] 性能优化
- [ ] 错误处理完善
- [ ] 端到端测试
- [ ] 文档完善

---

## 9. 系统集成（关键步骤）

### 9.1 添加 E2B 端点枚举

**文件**: `packages/data-provider/src/schemas.ts`

在 `EModelEndpoint` 枚举中添加：

```typescript
export enum EModelEndpoint {
  azureOpenAI = 'azureOpenAI',
  openAI = 'openAI',
  google = 'google',
  anthropic = 'anthropic',
  assistants = 'assistants',
  azureAssistants = 'azureAssistants',
  e2bAssistants = 'e2bAssistants', // 新增
  agents = 'agents',
  custom = 'custom',
  bedrock = 'bedrock',
}
```

### 9.2 端点构建函数注册

**文件**: `api/server/middleware/buildEndpointOption.js`

```javascript
// 在文件顶部导入
const e2bAssistants = require('~/server/services/Endpoints/e2bAssistants');

// 修改 buildFunction 对象（约第14-18行）
const buildFunction = {
  [EModelEndpoint.agents]: agents.buildOptions,
  [EModelEndpoint.assistants]: assistants.buildOptions,
  [EModelEndpoint.azureAssistants]: azureAssistants.buildOptions,
  [EModelEndpoint.e2bAssistants]: e2bAssistants.buildOptions, // 新增
};
```

### 9.3 配置系统集成

**文件**: `api/server/services/Endpoints/e2bAssistants/buildOptions.js` (新建)

```javascript
/**
 * 构建E2B Assistants端点选项
 * @param {string} endpoint 
 * @param {Object} parsedBody 
 * @param {string} endpointType 
 * @returns {Promise<Object>}
 */
async function buildOptions(endpoint, parsedBody, endpointType) {
  const { assistant_id, model, instructions, ...rest } = parsedBody;
  
  return {
    ...rest,
    endpoint: EModelEndpoint.e2bAssistants,
    endpointType: EModelEndpoint.e2bAssistants,
    assistant_id,
    model: model || 'gpt-4-turbo-preview',
    instructions,
  };
}

module.exports = {
  buildOptions,
};
```

**文件**: `api/server/services/Config/getEndpointsConfig.js`

在配置加载逻辑中添加（约第80-94行之后）：

```javascript
// E2B Assistants配置
if (appConfig.endpoints?.[EModelEndpoint.e2bAssistants]) {
  const { disableBuilder, capabilities, allowedLibraries, sandboxTemplate, ..._rest } =
    appConfig.endpoints[EModelEndpoint.e2bAssistants];

  mergedConfig[EModelEndpoint.e2bAssistants] = {
    ...mergedConfig[EModelEndpoint.e2bAssistants],
    disableBuilder,
    capabilities,
    allowedLibraries,
    sandboxTemplate,
  };
}
```

### 9.4 模型配置加载

**文件**: `packages/data-provider/src/config.ts`

在 `defaultModels` 对象中添加：

```typescript
export const defaultModels = {
  [EModelEndpoint.azureAssistants]: sharedOpenAIModels,
  [EModelEndpoint.assistants]: [...sharedOpenAIModels, 'chatgpt-4o-latest'],
  [EModelEndpoint.e2bAssistants]: sharedOpenAIModels, // 新增
  [EModelEndpoint.agents]: sharedOpenAIModels,
  // ... 其他端点
};
```

在 `alternateName` 对象中添加：

```typescript
export const alternateName = {
  // ... 其他端点
  [EModelEndpoint.e2bAssistants]: 'E2B Data Analyst', // 新增
  // ... 其他端点
};
```

在 `EndpointURLs` 对象中添加：

```typescript
export const EndpointURLs = {
  // ... 其他端点
  [EModelEndpoint.e2bAssistants]: `${apiBaseUrl()}/api/e2b-assistants/chat`, // 新增
} as const;
```

在 `modularEndpoints` 集合中添加：

```typescript
export const modularEndpoints = new Set<EModelEndpoint | string>([
  // ... 其他端点
  EModelEndpoint.e2bAssistants, // 新增
]);
```

### 9.5 文件配置支持

**文件**: `packages/data-provider/src/file-config.ts`

在 `supportsFiles` 对象中添加：

```typescript
export const supportsFiles = {
  [EModelEndpoint.openAI]: true,
  [EModelEndpoint.google]: true,
  [EModelEndpoint.assistants]: true,
  [EModelEndpoint.azureAssistants]: true,
  [EModelEndpoint.e2bAssistants]: true, // 新增
  [EModelEndpoint.agents]: true,
  // ... 其他端点
};
```

在 `assistantsFileConfig` 使用的地方，确保E2B Assistants也使用相同配置。

---

## 10. 错误处理和资源管理

### 10.1 错误恢复机制

参考 `api/server/controllers/assistants/chatV1.js:102-161` 的错误处理模式：

**文件**: `api/server/routes/e2bAssistants/controller.js`

```javascript
/**
 * 增强的错误处理和恢复
 */
const chatWithErrorHandling = async (req, res) => {
  try {
    const { assistant_id } = req.params;
    const { message, conversation_id } = req.body;
    
    let agent;
    try {
      const assistants = await getE2BAssistantDocs({ id: assistant_id });
      if (!assistants || assistants.length === 0) {
        return res.status(404).json({ error: 'Assistant not found' });
      }
      
      const assistant = assistants[0];
      agent = new E2BDataAnalystAgent({
        llmClient: await getOpenAIClient({ req, res }),
        e2bClientManager,
        userId: req.user.id,
        conversationId: conversation_id || nanoid(),
        assistant,
      });
      
      const response = await agent.processMessage(message);
      res.json(response);
    } catch (error) {
      // Agent执行错误
      logger.error('[E2B Assistant] Agent execution error:', error);
      
      if (error.message.includes('timeout')) {
        return res.status(408).json({
          error: 'Code execution timeout',
          message: 'The code execution took too long. Please try a simpler task or reduce the dataset size.',
        });
      }
      
      if (error.message.includes('memory')) {
        return res.status(507).json({
          error: 'Memory limit exceeded',
          message: 'The dataset is too large for available memory. Please use a smaller dataset.',
        });
      }
      
      throw error; // 重新抛出其他错误
    }
  } catch (error) {
    logger.error('[E2B Assistant] Error in chat:', error);
    res.status(500).json({ 
      error: error.message,
      message: 'An error occurred while processing your request. Please try again.'
    });
  }
};
```

### 10.2 Graceful Shutdown处理

**文件**: `api/server/index.js` (服务器启动代码中添加)

```javascript
const e2bClientManager = require('~/server/services/Endpoints/e2bAssistants/initialize');

// 在服务器关闭处理中添加
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, cleaning up E2B sandboxes...');
  await e2bClientManager.cleanup();
  // ... 其他清理逻辑
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, cleaning up E2B sandboxes...');
  await e2bClientManager.cleanup();
  // ... 其他清理逻辑
});
```

### 10.3 监控和日志增强

**文件**: `api/server/services/Sandbox/codeExecutor.js`

```javascript
class CodeExecutor {
  constructor(sandbox, metricsCollector) {
    this.sandbox = sandbox;
    this.metricsCollector = metricsCollector || {
      recordExecution: (data) => logger.info('[Metrics]', data),
    };
  }

  async executeCode(code, timeout = 300) {
    const startTime = Date.now();
    const startMemory = await this.getMemoryUsage();
    
    try {
      const execution = await this.sandbox.runCode(code, {
        timeoutMs: timeout * 1000,
        onStdout: (data) => {
          logger.debug(`[CodeExecutor] stdout: ${data.slice(0, 200)}...`);
        },
        onStderr: (data) => {
          logger.warn(`[CodeExecutor] stderr: ${data.slice(0, 200)}...`);
        },
      });
      
      const duration = Date.now() - startTime;
      const endMemory = await this.getMemoryUsage();
      
      // 记录执行指标
      this.metricsCollector.recordExecution({
        code_length: code.length,
        duration,
        memory_used: endMemory - startMemory,
        success: true,
        timestamp: new Date().toISOString(),
      });
      
      return {
        success: true,
        output: execution.stdout || '',
        error: execution.stderr || '',
        runtimeError: execution.error || null,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // 记录失败指标
      this.metricsCollector.recordExecution({
        code_length: code.length,
        duration,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      
      return {
        success: false,
        error: error.message,
        duration,
      };
    }
  }

  async getMemoryUsage() {
    // 获取沙箱内存使用情况（如果E2B SDK支持）
    try {
      const code = 'import psutil; print(psutil.Process().memory_info().rss)';
      const result = await this.sandbox.runCode(code, { timeoutMs: 5000 });
      const match = result.stdout.match(/\d+/);
      return match ? parseInt(match[0]) : 0;
    } catch {
      return 0;
    }
  }
}
```

---

## 11. 与协作人员接口

### 9.1 访问控制接口

**协作人员需要实现**：

1. **查询过滤**：在 `listAssistants` 中添加权限过滤逻辑
   - 私有Assistant：仅作者可见
   - 公共Assistant：所有用户可见
   - Admin权限：可查看所有Assistant

2. **权限检查**：在 `getAssistant`, `updateAssistant`, `deleteAssistant`, `chat` 中添加
   - 检查用户是否有权限访问该Assistant
   - Admin可操作所有Assistant

3. **发布/取消发布**：添加新的API端点
   - `POST /e2b-assistants/:assistant_id/publish` - 发布为公共Assistant
   - `POST /e2b-assistants/:assistant_id/unpublish` - 取消发布

### 9.2 数据字段说明

当前提供的字段：

```javascript
{
  is_public: false,        // 是否为公共Assistant
  access_level: 0,        // 访问级别（由协作人员定义）
  author: ObjectId,       // 作者ID
  // ... 其他E2B特定字段
}
```

---

## 10. 测试策略

### 10.1 单元测试

- `tests/e2b/client.test.js`: E2B客户端功能测试
- `tests/e2b/executor.test.js`: 代码执行服务测试
- `tests/e2b/agent.test.js`: Agent逻辑测试

### 10.2 集成测试

- 完整的对话流程测试
- 文件上传和数据分析测试
- 沙箱生命周期测试
- 错误处理测试

### 10.3 示例测试用例

```javascript
describe('E2B Data Analyst Agent', () => {
  test('should execute Python code successfully', async () => {
    const result = await agent.processMessage('Calculate 2+2');
    expect(result).toBeDefined();
    expect(result.message).toContain('4');
  });

  test('should analyze CSV data', async () => {
    const csvData = 'name,age\nAlice,30\nBob,25';
    const result = await agent.processMessage('Analyze this CSV: ' + csvData);
    expect(result.tool_calls).toBeDefined();
  });
});
```

---

## 11. 关键注意事项

### 11.1 技术风险
- **沙箱超时**: 需要合理的超时处理和降级策略
- **资源限制**: 监控内存和CPU使用，防止资源耗尽
- **状态管理**: 管理对话状态和沙箱状态的一致性

### 11.2 安全考虑
- **代码注入**: 验证和清理用户输入
- **沙箱隔离**: 确保沙箱安全，防止逃逸
- **文件访问**: 限制沙箱内的文件系统访问
- **API密钥保护**: 安全存储E2B API密钥

### 11.3 性能考虑
- **冷启动**: 预热沙箱或使用连接池
- **延迟**: 减少LLM和沙箱之间的往返次数
- **并发**: 实现沙箱池以支持并发用户

---

## 12. 参考资料

### 12.1 E2B文档
- [E2B Code Interpreter SDK](https://github.com/e2b-dev/code-interpreter)
- [E2B Documentation](https://e2b.dev/docs)

### 12.2 Doubao数据分析师
- 分析Doubao的数据分析能力
- 参考其提示词和工具定义

### 12.3 LibreChat现有代码
- Azure Assistants实现: `api/server/services/Endpoints/azureAssistants/`
- Assistant模型: `packages/data-schemas/src/schema/assistant.ts`

---

## 13. 下一步行动

1. **确认文档**: 审阅本文档，提供反馈
2. **环境准备**: 获取E2B API密钥，配置开发环境
3. **开始开发**: 按照Phase 1开始实施
4. **持续测试**: 每个Phase完成后进行测试
5. **协作同步**: 与负责访问控制的同事保持沟通

---

**文档版本**: v1.0  
**创建日期**: 2025-12-23  
**最后更新**: 2025-12-23  
**维护者**: [待填写]
