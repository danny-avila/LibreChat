# E2B Agent 架构与问题解决文档

## 📋 目录
1. [问题回顾与解决方案](#1-问题回顾与解决方案)
2. [Agent 架构详解](#2-agent-架构详解)
3. [与 Azure Assistant 的对比](#3-与-azure-assistant-的对比)
4. [优化方向](#4-优化方向)

---

## 1. 问题回顾与解决方案

### 1.1 图片路径双重嵌套问题

**问题表现**：
```
/images/userId/timestamp-/images/userId/timestamp-plot-0.png
```

**根本原因**：
- LLM 在多轮对话中会引用之前生成的图片路径
- 路径替换逻辑会匹配到已经正确的路径中的 `plot-0.png` 子串
- 导致对已经正确的路径再次进行替换，造成嵌套

**解决方案**：
```javascript
// 方案1: 复杂的过滤逻辑（已放弃）
const validPatterns = Object.keys(imageUrlMap).filter(pattern => 
  !pattern.startsWith('/images/') && pattern !== actualPath
);

// 方案2: 完全移除路径替换（最终采用）
// 在 tools.js 中直接提供正确的路径给 LLM
observation.image_paths = persistedFiles.map(f => f.filepath);
observation.images_markdown = persistedFiles.map((f, i) => 
  `![Plot ${i}](${f.filepath})`
).join('\n');

// 在 index.js 中不再进行任何替换
const processedText = finalContent; // 直接使用，不替换
```

**关键改进**：
- 移除 `api/server/services/Agents/e2bAgent/index.js` 中的 `replaceImagePaths()` 逻辑
- 在 `api/server/services/Agents/e2bAgent/tools.js` 的 `execute_code` 返回中直接提供正确路径
- 在 system prompt 中明确指示 LLM 使用提供的路径

---

### 1.2 无限重试循环问题

**问题表现**：
```
iteration 1: execute_code -> fetch failed
iteration 2-10: 重复执行相同代码
最终: Reached max iterations (10)
```

**根本原因**：
- 代码执行失败时返回的 observation 格式不一致
- 成功时：`{ success: true, stdout, stderr, has_plots, plot_count, ... }`
- 失败时：`{ success: false, error }` ⚠️ 缺少关键字段
- LLM 无法正确理解错误，导致不断重试相同操作

**解决方案**：
```javascript
// 文件: api/server/services/Agents/e2bAgent/tools.js
// 统一错误时的 observation 格式
return {
  success: false,
  error: error.message,
  stdout: '',
  stderr: error.message,  // 将错误信息放到 stderr
  has_plots: false,
  plot_count: 0,
  image_paths: [],
  images_markdown: '',
  plot_info: ''
};
```

**关键改进**：
- 确保成功和失败时返回的 observation 结构一致
- LLM 能够从 `stderr` 中读取错误信息
- 避免因为字段缺失导致 LLM confused

---

### 1.3 `download_file` 工具错误

**问题表现**：
```
Error: response[parseAs] is not a function
```

**根本原因**：
- E2B SDK v2.x 的 `files.read()` 返回的是 Response 对象
- 需要调用 `.arrayBuffer()` 或 `.text()` 方法解析内容
- 代码直接使用了返回值，导致方法调用失败

**解决方案**：
```javascript
// 文件: api/server/services/Endpoints/e2bAssistants/initialize.js
// 修复前
const content = await sandboxData.sandbox.files.read(path, { format });

// 修复后
const response = await sandboxData.sandbox.files.read(path, { format });
let content;
if (format === 'buffer') {
  const arrayBuffer = await response.arrayBuffer();
  content = Buffer.from(arrayBuffer);
} else {
  content = await response.text();
}
```

**最终决策**：
- 修复了 API 调用问题后，发现 `download_file` 工具是**冗余的**
- `execute_code` 已经自动持久化所有生成的图片
- 移除该工具简化了系统，避免 LLM 混淆

---

## 2. Agent 架构详解

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        User Interface                        │
│                  (LibreChat Frontend)                        │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Express.js Backend                        │
│  /api/assistants/:assistantId/chat (POST)                   │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              E2B Assistant Controller                        │
│  api/server/controllers/assistants/e2b.js                   │
│  - 初始化 E2BAgent                                           │
│  - 处理流式响应                                              │
│  - 调用 sendMessage()                                        │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      E2BAgent                                │
│  api/server/services/Agents/e2bAgent/index.js               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Core Loop (max 10 iterations)                      │    │
│  │  1. Call LLM with messages + tool definitions       │    │
│  │  2. LLM responds: text or tool_calls                │    │
│  │  3. Execute tools (if tool_calls exist)             │    │
│  │  4. Add tool results to messages                    │    │
│  │  5. Repeat until LLM stops or max iterations        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Components:                                                 │
│  - Message Management (历史消息)                            │
│  - Tool Execution (工具调用)                                │
│  - Streaming Handler (流式输出)                             │
│  - Sandbox Management (沙箱生命周期)                        │
└────────────┬──────────────────────┬─────────────────────────┘
             │                      │
             ▼                      ▼
┌────────────────────┐    ┌────────────────────────────┐
│   LLM Provider     │    │   E2B Sandbox Manager      │
│   (Anthropic)      │    │   (e2bClientManager)       │
│                    │    │                            │
│ - Claude 3.5       │    │ - Sandbox 创建/复用        │
│ - Tool calling     │    │ - 代码执行                 │
│ - Streaming        │    │ - 文件上传/下载            │
└────────────────────┘    └────────┬───────────────────┘
                                   │
                                   ▼
                        ┌────────────────────────┐
                        │   E2B Cloud Sandbox    │
                        │   (Python Runtime)     │
                        │                        │
                        │ - matplotlib           │
                        │ - pandas               │
                        │ - numpy                │
                        │ - scikit-learn         │
                        └────────────────────────┘
```

---

### 2.2 核心组件详解

#### 2.2.1 E2BAgent (`index.js`)

**职责**：
- 协调 LLM 和工具之间的交互
- 管理对话历史和工具调用记录
- 处理流式响应
- 控制迭代次数防止无限循环

**核心方法**：
```javascript
class E2BAgent {
  async sendMessage(userMessage, options) {
    // 1. 构建初始消息数组
    const messages = this._buildMessages(userMessage);
    
    // 2. 迭代循环
    while (iteration <= this.maxIterations) {
      // 3. 调用 LLM
      const response = await this.llmProvider.complete(messages, {
        tools: this.tools,
        stream: true
      });
      
      // 4. 处理响应
      if (response.stop_reason === 'tool_use') {
        // 执行工具
        const toolResults = await this._executeTools(response.content);
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResults });
      } else {
        // LLM 结束，返回最终内容
        return response.content;
      }
    }
  }
}
```

**关键特性**：
- **流式处理**：通过 `onToken` 回调实时返回 LLM 生成的文本
- **工具编排**：自动检测工具调用并执行
- **错误恢复**：捕获工具执行错误并返回给 LLM
- **沙箱管理**：跨轮对话复用同一个沙箱

---

#### 2.2.2 Tools (`tools.js`)

**当前可用工具**：

##### 1. `execute_code`
```javascript
{
  name: 'execute_code',
  description: 'Execute Python code in a sandboxed environment...',
  input_schema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Python code to execute' }
    },
    required: ['code']
  }
}
```

**功能**：
- 在 E2B 沙箱中执行 Python 代码
- 自动捕获 stdout/stderr
- 自动提取并持久化图片（matplotlib 等）
- 返回执行结果和图片路径

**返回格式**：
```javascript
{
  success: true,
  stdout: "执行输出...",
  stderr: "",
  has_plots: true,
  plot_count: 2,
  image_paths: [
    "/images/userId/timestamp-plot-0.png",
    "/images/userId/timestamp-plot-1.png"
  ],
  images_markdown: "![Plot 0](/images/.../plot-0.png)\n![Plot 1](...)",
  plot_info: "Generated 2 plot(s). Use the following paths to display them..."
}
```

##### 2. `list_files`
```javascript
{
  name: 'list_files',
  description: 'List files in the sandbox directory',
  input_schema: {
    properties: {
      path: { type: 'string', default: '/home/user' }
    }
  }
}
```

**功能**：
- 列出沙箱中指定目录的文件
- 用于检查数据文件、生成的文件等

---

#### 2.2.3 E2B Sandbox Manager (`initialize.js`)

**职责**：
- 管理沙箱的生命周期（创建、复用、清理）
- 提供代码执行接口
- 处理文件操作（上传、下载、列表）

**核心特性**：

##### 沙箱复用策略
```javascript
class E2BClientManager {
  async getSandbox(userId, conversationId) {
    const key = `${userId}:${conversationId}`;
    
    // 1. 检查是否已存在
    if (this.sandboxes.has(key)) {
      const sandbox = this.sandboxes.get(key);
      if (await sandbox.isAlive()) {
        return sandbox; // 复用
      }
    }
    
    // 2. 创建新沙箱
    const newSandbox = await Sandbox.create({
      template: this.templateId,
      timeoutMs: 5 * 60 * 1000 // 5分钟
    });
    
    this.sandboxes.set(key, newSandbox);
    return newSandbox;
  }
}
```

**好处**：
- 同一对话中文件和变量持久化
- 减少沙箱创建开销
- 支持多轮交互式分析

---

#### 2.2.4 Code Executor (`codeExecutor.js`)

**职责**：
- 代码安全验证
- 调用 E2B 执行代码
- 提取和格式化图片
- 统一返回格式

**安全验证**：
```javascript
validateCode(code) {
  const issues = [];
  
  // 检查危险函数
  const critical = ['exec(', 'eval(', 'compile(', '__import__'];
  for (const func of critical) {
    if (code.includes(func)) {
      issues.push({ level: 'critical', message: `Restricted: ${func}` });
    }
  }
  
  // 检查敏感导入
  const warnings = ['import os', 'import sys', 'import subprocess'];
  for (const lib of warnings) {
    if (code.includes(lib)) {
      issues.push({ level: 'warning', message: `Sensitive: ${lib}` });
    }
  }
  
  return {
    valid: issues.filter(i => i.level === 'critical').length === 0,
    issues
  };
}
```

---

#### 2.2.5 File Handler (`fileHandler.js`)

**职责**：
- 持久化沙箱中的 artifacts（图片、数据文件等）
- 同步用户上传的文件到沙箱
- 生成唯一的文件路径（timestamp + filename）

**持久化流程**：
```javascript
async persistArtifact(userId, sandboxId, filename, content) {
  // 1. 生成唯一路径
  const timestamp = Date.now();
  const filepath = `/images/${userId}/${timestamp}-${filename}`;
  
  // 2. 保存到本地存储
  await fs.writeFile(filepath, content);
  
  // 3. 返回可访问的 URL
  return { filepath, filename, size: content.length };
}
```

---

### 2.3 数据流详解

#### 完整的请求-响应流程

```
1. 用户发送消息
   └─> POST /api/assistants/:id/chat
       Body: {
         message: "对 titanic.csv 进行分析",
         files: [{ file_id: "xxx" }]
       }

2. Controller 初始化 E2BAgent
   └─> new E2BAgent({
         userId,
         conversationId,
         assistantId,
         llmProvider,
         tools: [execute_code, list_files]
       })

3. Agent 同步文件到沙箱
   └─> fileHandler.syncFilesToSandbox(files)
       ├─> 下载文件内容
       ├─> 上传到 E2B sandbox:/home/user/titanic.csv
       └─> 记录文件映射

4. Agent 开始迭代循环
   Iteration 1:
   ├─> LLM 调用 (messages: [user: "分析 titanic.csv"])
   ├─> LLM 响应: tool_use(execute_code)
   │   code: "import pandas as pd\ndf = pd.read_csv('titanic.csv')..."
   │
   ├─> 执行工具
   │   ├─> codeExecutor.execute(code)
   │   ├─> E2B sandbox 执行 Python 代码
   │   ├─> 提取图片: [plot-0.png, plot-1.png]
   │   ├─> 持久化图片到 /images/userId/timestamp-plot-X.png
   │   └─> 返回 observation
   │
   └─> 将 tool result 添加到 messages

   Iteration 2:
   ├─> LLM 调用 (messages: [..., tool_result])
   ├─> LLM 响应: text + stop
   │   "这是对 Titanic 数据集的分析结果：\n
   │    ![Age Distribution](/images/.../plot-0.png)..."
   │
   └─> 流式返回最终文本

5. 返回响应给前端
   └─> SSE stream 或 完整响应
```

---

### 2.4 LLM 的角色与能力

**LLM Provider**: Anthropic Claude 3.5 Sonnet

**关键能力**：
1. **工具调用（Tool Use）**
   - 理解用户意图，决定是否需要调用工具
   - 生成符合工具 schema 的参数
   - 处理工具返回的结果

2. **代码生成**
   - 根据用户需求生成 Python 代码
   - 处理数据分析、可视化、机器学习等任务
   - 代码质量较高，通常能一次成功

3. **结果解释**
   - 解读代码执行结果（stdout/stderr）
   - 分析数据统计结果
   - 生成带图片的 markdown 响应

4. **上下文管理**
   - 记住对话历史
   - 理解文件依赖关系（如记得 titanic.csv 已上传）
   - 多轮交互中保持连贯性

**System Prompt 优化**：
```
You are a data analysis expert with access to a Python sandbox.

Available tools:
- execute_code: Run Python code. Generated plots are automatically saved.
  You will receive 'image_paths' in the result. Use these paths directly.
- list_files: Check available files in the sandbox.

Guidelines:
1. All matplotlib plots are automatically saved - DO NOT call download_file
2. Use the 'image_paths' from execute_code results for displaying images
3. Format: ![Description](image_paths[0])
4. If code fails, check stderr and adjust your approach
...
```

---

### 2.5 E2B Sandbox 的角色与能力

**E2B Sandbox**: 云端隔离的 Python 运行时环境

**技术栈**：
- **Base**: Ubuntu-based container
- **Python**: 3.11+
- **预装库**:
  - 数据处理: pandas, numpy, scipy
  - 可视化: matplotlib, seaborn, plotly
  - 机器学习: scikit-learn, xgboost
  - 深度学习: tensorflow, pytorch (可选)

**核心特性**：

1. **安全隔离**
   - 每个用户/对话有独立的沙箱
   - 无法访问宿主机系统
   - 网络访问受限（可配置）

2. **持久化存储**
   - 沙箱生命周期内文件持久化
   - 支持跨多轮对话
   - 自动清理过期沙箱

3. **资源限制**
   - CPU/内存配额
   - 超时控制（默认 5 分钟）
   - 防止资源滥用

4. **实时输出**
   - 流式 stdout/stderr
   - 支持长时间运行的任务
   - 中途终止能力

**生命周期管理**：
```javascript
// 创建沙箱
const sandbox = await Sandbox.create({ template: 'python-data-analysis' });

// 使用沙箱
await sandbox.process.start({ cmd: 'python -c "..."' });
await sandbox.files.write('/home/user/data.csv', content);
const result = await sandbox.process.start({ cmd: 'python analysis.py' });

// 沙箱自动超时销毁 (5分钟)
// 或手动销毁
await sandbox.kill();
```

---

## 3. 与 Azure Assistant 的对比

### 3.1 架构对比

| 维度 | E2B Agent (自建) | Azure OpenAI Assistant |
|------|------------------|------------------------|
| **代码执行** | E2B Cloud Sandbox (自托管) | Azure Code Interpreter (托管) |
| **LLM** | Anthropic Claude 3.5 | OpenAI GPT-4 |
| **控制力** | 完全控制（工具、流程、prompt） | 受限于 Azure API |
| **自定义工具** | 可任意添加自定义工具 | 仅支持预定义工具 |
| **成本** | E2B + Anthropic 费用 | Azure 按 token 计费 |
| **流式输出** | 完全自定义控制 | Azure 标准流式 |
| **沙箱环境** | 可自定义 template | Azure 固定环境 |
| **文件持久化** | 自行管理（本地/S3） | Azure 文件存储 |
| **调试能力** | 完全透明（日志、中间状态） | 黑盒，调试困难 |

---

### 3.2 优势分析

#### E2B Agent 的优势

✅ **更强的可控性**
- 完全控制工具定义和执行逻辑
- 可以添加任意自定义工具（如数据库查询、API 调用等）
- System prompt 完全自定义

✅ **更好的调试体验**
- 完整的日志追踪（LLM 调用、工具执行、沙箱交互）
- 可以查看每个 iteration 的中间状态
- 错误处理逻辑透明

✅ **更灵活的沙箱**
- 可以自定义 Python 环境（安装任意库）
- 可以控制资源限制和超时
- 支持更多运行时（Node.js, R, Julia 等）

✅ **更低的供应商锁定**
- 可以随时切换 LLM provider（OpenAI, Anthropic, Cohere 等）
- 可以切换沙箱服务（E2B, Modal, AWS Lambda 等）
- 不依赖单一云服务商

✅ **更好的成本控制**
- 可以精确控制 LLM 调用次数
- 可以设置更细粒度的速率限制
- 沙箱按需创建和销毁

---

#### Azure Assistant 的优势

✅ **更简单的集成**
- 开箱即用，无需管理沙箱基础设施
- Azure 统一的身份和计费系统

✅ **企业级支持**
- Azure SLA 保证
- 合规性认证（GDPR, HIPAA 等）

✅ **更快的上手**
- 不需要理解底层实现
- API 简单直接

---

### 3.3 E2B Agent 是否更优越？

**结论**: **在以下场景中 E2B Agent 更优越**

1. **需要自定义工具**
   - 如连接内部数据库、调用私有 API
   - Azure Assistant 无法做到

2. **需要特定 Python 库**
   - 如特定版本的 PyTorch、TensorFlow
   - 或公司内部的 Python 包

3. **需要深度调试**
   - 复杂的数据分析流程
   - 需要查看中间状态

4. **成本敏感**
   - 大量用户/请求
   - 需要精确控制 LLM 调用

5. **避免供应商锁定**
   - 希望保留切换 LLM 的灵活性
   - 或切换到自托管模型

**Azure Assistant 更适合**：
- 快速原型开发
- 不需要自定义功能
- 企业级合规要求
- 团队没有 DevOps 资源

---

## 4. 优化方向

### 4.1 短期优化（1-2 周）

#### 4.1.1 增强错误处理
```javascript
// 当前问题：LLM 可能陷入无限重试
// 优化：检测重复失败并提前终止

class E2BAgent {
  constructor() {
    this.failureTracker = new Map(); // 跟踪失败的工具调用
  }

  async _executeTools(toolCalls) {
    for (const toolCall of toolCalls) {
      const key = `${toolCall.name}:${hash(toolCall.input)}`;
      
      // 检查是否重复失败
      if (this.failureTracker.get(key) >= 2) {
        return {
          error: 'This operation has failed multiple times. Please try a different approach.',
          success: false
        };
      }
      
      try {
        const result = await this.tools[toolCall.name](toolCall.input);
        this.failureTracker.delete(key); // 成功则清除
        return result;
      } catch (error) {
        this.failureTracker.set(key, (this.failureTracker.get(key) || 0) + 1);
        throw error;
      }
    }
  }
}
```

---

#### 4.1.2 添加代码缓存
```javascript
// 避免重复执行相同代码
class CodeExecutor {
  constructor() {
    this.cache = new LRU({ max: 100, ttl: 60 * 60 * 1000 }); // 1小时
  }

  async execute(userId, conversationId, code, options) {
    const cacheKey = `${conversationId}:${hash(code)}`;
    
    // 检查缓存
    if (this.cache.has(cacheKey) && !options.forceExecute) {
      logger.info('[CodeExecutor] Using cached result');
      return this.cache.get(cacheKey);
    }
    
    // 执行并缓存
    const result = await this._executeInternal(code);
    this.cache.set(cacheKey, result);
    return result;
  }
}
```

---

#### 4.1.3 改进 Prompt Engineering
```javascript
// system prompt 中添加更明确的指引
const IMPROVED_SYSTEM_PROMPT = `
You are a data analysis expert. Follow these guidelines strictly:

1. CODE EXECUTION:
   - Write clean, well-commented code
   - Handle missing data explicitly
   - Use try-except blocks for error-prone operations

2. ERROR HANDLING:
   - If code fails with an error, DO NOT retry the exact same code
   - Analyze the error message and adjust your approach
   - If stuck after 2 attempts, explain the issue to the user

3. VISUALIZATION:
   - All matplotlib plots are automatically saved
   - You will receive 'image_paths' array in the tool result
   - Use these paths directly: ![Description](image_paths[0])
   - DO NOT try to save or download plots manually

4. DATA FILES:
   - Files uploaded by user are in /home/user/
   - List files first if unsure about availability
   - Remember file names across conversation turns

5. MEMORY:
   - Remember previous analysis results
   - Avoid redundant calculations
   - Reference earlier findings when relevant
`;
```

---

### 4.2 中期优化（1-2 月）

#### 4.2.1 添加数据库连接工具
```javascript
// 新工具: query_database
{
  name: 'query_database',
  description: 'Execute SQL query on connected databases',
  input_schema: {
    type: 'object',
    properties: {
      database: {
        type: 'string',
        enum: ['postgres', 'mysql', 'mongodb'],
        description: 'Database type'
      },
      query: {
        type: 'string',
        description: 'SQL query or MongoDB aggregation pipeline'
      },
      connection_id: {
        type: 'string',
        description: 'User\'s database connection ID'
      }
    },
    required: ['database', 'query', 'connection_id']
  }
}

// 实现
async function queryDatabase({ database, query, connection_id }) {
  // 1. 从用户配置中获取连接信息（加密存储）
  const connection = await getUserConnection(connection_id);
  
  // 2. 在沙箱中执行查询（安全隔离）
  const result = await sandbox.executeQuery(database, query, connection);
  
  // 3. 限制返回行数，避免内存溢出
  return {
    rows: result.rows.slice(0, 1000),
    total_rows: result.total,
    truncated: result.total > 1000
  };
}
```

---

#### 4.2.2 添加 Web 搜索工具
```javascript
// 新工具: web_search
{
  name: 'web_search',
  description: 'Search the web for current information',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      num_results: { type: 'number', default: 5 }
    }
  }
}

// 使用案例
// User: "2024年美国GDP增长率是多少？"
// LLM: 调用 web_search("美国2024年GDP增长率")
// 返回最新数据，然后生成回答
```

---

#### 4.2.3 支持多语言沙箱
```javascript
// 扩展 execute_code 支持多种语言
const SUPPORTED_LANGUAGES = {
  python: { template: 'python-data-analysis', ext: '.py' },
  javascript: { template: 'node-analysis', ext: '.js' },
  r: { template: 'r-statistics', ext: '.R' }
};

async function execute_code({ code, language = 'python' }) {
  const config = SUPPORTED_LANGUAGES[language];
  if (!config) {
    throw new Error(`Unsupported language: ${language}`);
  }
  
  const sandbox = await getSandbox(userId, conversationId, config.template);
  return await sandbox.execute(code);
}
```

---

### 4.3 长期优化（3-6 月）

#### 4.3.1 多 Agent 协作
```javascript
// Coordinator Agent 协调多个专业 Agent
class CoordinatorAgent {
  constructor() {
    this.agents = {
      data_analyst: new DataAnalystAgent(),
      ml_engineer: new MLEngineerAgent(),
      web_researcher: new WebResearchAgent()
    };
  }

  async process(userMessage) {
    // 1. 分析任务类型
    const taskType = await this.classifyTask(userMessage);
    
    // 2. 分配给专业 Agent
    if (taskType === 'data_analysis') {
      return await this.agents.data_analyst.handle(userMessage);
    } else if (taskType === 'ml_training') {
      return await this.agents.ml_engineer.handle(userMessage);
    }
    
    // 3. 或协调多个 Agent
    const dataResult = await this.agents.data_analyst.analyze(data);
    const insights = await this.agents.web_researcher.findContext(dataResult);
    return this.synthesize(dataResult, insights);
  }
}
```

---

#### 4.3.2 长期记忆系统
```javascript
// 使用向量数据库存储对话历史
class MemoryManager {
  constructor() {
    this.vectorDB = new PineconeClient(); // 或 Weaviate, Milvus
  }

  async storeInteraction(conversationId, interaction) {
    // 1. 生成 embedding
    const embedding = await this.embed(interaction.text);
    
    // 2. 存储到向量数据库
    await this.vectorDB.upsert({
      id: interaction.id,
      vector: embedding,
      metadata: {
        conversation_id: conversationId,
        timestamp: Date.now(),
        type: interaction.type, // 'analysis', 'visualization', etc.
        files_used: interaction.files,
        results: interaction.results
      }
    });
  }

  async recall(conversationId, query, limit = 5) {
    // 3. 语义搜索相关历史
    const queryEmbedding = await this.embed(query);
    const results = await this.vectorDB.query({
      vector: queryEmbedding,
      filter: { conversation_id: conversationId },
      topK: limit
    });
    
    return results.matches;
  }
}

// 使用
class E2BAgent {
  async sendMessage(userMessage) {
    // 检索相关历史
    const relevantHistory = await this.memory.recall(
      this.conversationId,
      userMessage,
      3
    );
    
    // 添加到 context
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...relevantHistory.map(h => ({ role: 'assistant', content: h.text })),
      { role: 'user', content: userMessage }
    ];
    
    // 继续正常流程...
  }
}
```

---

#### 4.3.3 自动化测试和评估
```javascript
// 建立测试套件
const TEST_CASES = [
  {
    name: 'Basic data analysis',
    prompt: '对 sales.csv 进行基础统计分析',
    files: ['sales.csv'],
    expectedOutputs: {
      hasVisualization: true,
      minCharts: 2,
      mentionsStats: ['mean', 'median', 'std']
    }
  },
  {
    name: 'ML prediction',
    prompt: '使用逻辑回归预测客户流失',
    files: ['customers.csv'],
    expectedOutputs: {
      hasVisualization: true,
      mentionsMetrics: ['accuracy', 'precision', 'recall']
    }
  }
];

// 自动化评估
class AgentEvaluator {
  async evaluate(agent, testCase) {
    const result = await agent.sendMessage(testCase.prompt, {
      files: testCase.files
    });
    
    const score = {
      completed: result.success,
      hasVisualization: result.images?.length > 0,
      chartCount: result.images?.length || 0,
      mentionsExpectedTerms: this.checkTerms(result.text, testCase.expectedOutputs.mentionsStats)
    };
    
    return score;
  }

  async runSuite(agent) {
    const results = [];
    for (const testCase of TEST_CASES) {
      const score = await this.evaluate(agent, testCase);
      results.push({ testCase: testCase.name, score });
    }
    
    return this.generateReport(results);
  }
}
```

---

### 4.4 性能优化

#### 4.4.1 并行工具执行
```javascript
// 当前：顺序执行多个工具调用
// 优化：并行执行独立的工具调用

async _executeTools(toolCalls) {
  // 分析依赖关系
  const independent = toolCalls.filter(t => !this.hasDependency(t));
  const dependent = toolCalls.filter(t => this.hasDependency(t));
  
  // 并行执行独立工具
  const results = await Promise.all(
    independent.map(t => this.tools[t.name](t.input))
  );
  
  // 顺序执行依赖工具
  for (const toolCall of dependent) {
    const result = await this.tools[toolCall.name](toolCall.input);
    results.push(result);
  }
  
  return results;
}
```

---

#### 4.4.2 沙箱预热
```javascript
// 在用户发起请求前预热沙箱
class SandboxPrewarmer {
  constructor() {
    this.pool = new Set();
    this.targetSize = 3;
  }

  async maintain() {
    setInterval(async () => {
      while (this.pool.size < this.targetSize) {
        const sandbox = await Sandbox.create({ template: 'python-data-analysis' });
        this.pool.add(sandbox);
      }
    }, 30000); // 每30秒检查一次
  }

  async getSandbox() {
    if (this.pool.size > 0) {
      const sandbox = this.pool.values().next().value;
      this.pool.delete(sandbox);
      this.maintain(); // 异步补充
      return sandbox;
    }
    
    return await Sandbox.create({ template: 'python-data-analysis' });
  }
}
```

---

## 5. 总结

### 5.1 当前系统的优势
✅ **完全可控**: 工具、prompt、执行流程完全自定义  
✅ **高度透明**: 完整的日志和调试能力  
✅ **灵活扩展**: 可以轻松添加新工具和能力  
✅ **成本优化**: 精确控制 LLM 调用和资源使用  
✅ **供应商独立**: 可以随时切换 LLM 或沙箱服务  

### 5.2 当前系统的局限
⚠️ **复杂性**: 需要管理更多基础设施  
⚠️ **维护成本**: 需要持续优化和监控  
⚠️ **学习曲线**: 团队需要理解整个系统架构  

### 5.3 适用场景
- ✅ 需要自定义工具和数据源
- ✅ 需要特定 Python 环境或库
- ✅ 需要深度调试和日志追踪
- ✅ 大规模部署，需要成本控制
- ✅ 希望避免供应商锁定

---

**文档版本**: v1.0  
**最后更新**: 2026-01-07  
**维护者**: LibreChat E2B Agent Team