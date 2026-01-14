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
- **E2B Code Interpreter SDK**: `@e2b/code-interpreter` (v2.8.4+)
- **OpenAI API**: `openai` (v4.x) - 用于 LLM 推理（GPT-4, GPT-4o 等模型）
- **MongoDB**: 存储 Assistant 配置、对话历史、文件元数据
- **Node.js/Express.js**: 后端框架（v18+）

### 3.2 LLM 说明
本项目使用 **OpenAI API** 进行推理，支持的模型包括：
- GPT-4 / GPT-4-turbo
- GPT-4o / GPT-4o-mini
- 或任何兼容 OpenAI API 的模型（如通过代理访问的其他模型）

---

## 4. 目录结构规划

```
LibreChat/
├── api/
│   ├── models/
│   │   └── E2BAssistant.js              # [已实现] E2B Assistant数据模型
│   ├── server/
│   │   ├── services/
│   │   │   ├── Agents/
│   │   │   │   └── e2bAgent/
│   │   │   │       ├── index.js           # [已实现] 446行 - ReAct循环Agent核心
│   │   │   │       ├── contextManager.js  # [已实现] 387行 - 上下文管理器 
│   │   │   │       ├── prompts.js         # [已实现] 154行 - 系统提示词
│   │   │   │       └── tools.js           # [已实现] 266行 - 工具定义与执行
│   │   │   ├── Endpoints/
│   │   │   │   └── e2bAssistants/
│   │   │   │       ├── index.js           # [已实现] 端点入口
│   │   │   │       ├── initialize.js      # [已实现] 748行 - E2B沙箱生命周期管理
│   │   │   │       └── buildOptions.js    # [已实现] 选项构建
│   │   │   ├── Sandbox/
│   │   │   │   ├── codeExecutor.js        # [已实现] 163行 - Python代码执行
│   │   │   │   └── fileHandler.js         # [已实现] 172行 - 文件同步与持久化
│   │   └── routes/
│   │       └── e2bAssistants/
│   │           ├── index.js               # [已实现] 路由注册
│   │           └── controller.js          # [已实现] 619行 - HTTP/SSE控制器
│   └── tests/
│       └── e2b/
│           ├── codeExecutor.test.js       # [已实现] CodeExecutor单元测试
│           ├── fileHandler.test.js        # [已实现] FileHandler单元测试
│           ├── real_integration.js        # [已实现] 真实环境端到端测试
│           └── debug_sandbox.js           # [已实现] 沙箱调试脚本
├── packages/
│   └── data-schemas/
│       ├── src/
│       │   ├── schema/
│       │   │   └── e2bAssistant.ts        # [已实现] E2B Assistant Schema
│       │   ├── models/
│       │   │   └── e2bAssistant.ts        # [已实现] E2B Assistant Model
│       │   └── types/
│       │       └── e2bAssistant.ts        # [已实现] TypeScript类型定义
├── docs/
│   ├── E2B_AGENT_ARCHITECTURE.md          # [已实现] 系统架构文档
│   ├── E2B_AGENT_FIXES.md                 # [已实现] 问题解决文档
│   ├── E2B_DATA_ANALYST_AGENT_DEVELOPMENT.md # [本文档] 开发文档
│   └── E2B_AGENT_TEST_CASES.md            # [已实现] 测试用例
```

---

## 5. 核心模块实现详情

### 5.1 Context Manager (`contextManager.js`) 
- **功能**: 上下文管理的 Single Source of Truth
- **代码**: 387 行
- **职责**:
  - **内部/外部ID分离**: 存储带UUID的 file_id，对外只暴露干净文件名
  - **上下文生成**: 为 LLM 生成结构化上下文（文件列表、对话历史、工件信息）
  - **错误恢复**: 提供分层错误建议（关键错误 + 通用调试）
  - **conversationId追踪**: 防止跨对话混淆
- **关键方法**:
  - `getContextForIteration()`: 生成当前迭代的完整上下文
  - `updateFileContext()`: 更新文件映射
  - `generateErrorGuidance()`: 生成错误恢复建议

### 5.2 E2BDataAnalystAgent (`index.js`)
- **功能**: 基于 ReAct 循环的智能代理核心
- **代码**: 446 行
- **LLM**: 使用 **OpenAI API**（GPT-4/GPT-4o）
- **特性**:
  - **ReAct循环**: Thought → Action → Observation → 最多20次迭代
  - **沙箱复用**: 同一对话使用相同沙箱实例
  - **双层恢复**: Layer 1 (初始化) + Layer 2 (执行时)
  - **自愈能力**: 错误自动反馈给 LLM，通过通用调试策略自主修复
  - **工具调用**: `execute_code`, `upload_file`（已移除冗余的 download_file）
  - **流式输出**: 支持 SSE 逐 token 返回

### 5.3 E2B Sandbox Manager (`initialize.js`)
- **功能**: 管理 E2B 沙箱生命周期（创建、销毁、重用）
- **代码**: 748 行
- **SDK适配**: 适配了 `@e2b/code-interpreter` v2.8.4
- **关键特性**:
  - 使用 `Sandbox.create()` 和 `sandbox.kill()`
  - 文件操作：`.files.write()`, `.files.read()` 与异步流处理
  - 配置：默认 `secure: false` 以增强兼容性
  - 智能模板选择：支持自定义模板或默认模板
  - **双层文件恢复**:
    * Layer 1: processMessage 检测沙箱过期并恢复文件
    * Layer 2: tools.js 执行超时检测并重建沙箱

### 5.4 Tools (`tools.js`)
- **功能**: 工具定义与执行逻辑
- **代码**: 266 行
- **工具列表**:
  - `execute_code`: 执行 Python 代码，自动捕获图表
  - `upload_file`: 上传文件到沙箱
- **关键改进**:
  - **统一观察格式**: 成功/失败都返回完整结构（消除无限循环）
  - **Layer 2 恢复**: 捕获沙箱超时并自动重建
  - **路径简化**: 直接在 observation 中提供正确的 Web 路径

### 5.5 CodeExecutor (`codeExecutor.js`)
- **功能**: 在沙箱中执行 Python 代码，处理 `stdout`/`stderr`，并提取生成的图表
- **代码**: 163 行
- **特性**: 
  - **图表提取**: 自动从 execution results 中提取 PNG/JPEG/SVG 格式的图片
  - **安全校验**: 基础代码安全检查，拦截危险函数（如 `os.system`）
  - **批量执行**: 支持按顺序执行多个代码块
  - **错误捕获**: 完整的 traceback 传递

### 5.6 FileHandler (`fileHandler.js`)
- **功能**: 处理 LibreChat 系统存储与 E2B 沙箱之间的文件同步
- **代码**: 172 行
- **特性**:
  - **多存储支持**: 兼容 Local, S3, Azure Blob Storage
  - **Artifacts 持久化**: 将沙箱生成的图片/CSV 下载并保存到系统存储
  - **内存持久化**: 支持直接将 Buffer 保存，无需重复下载
  - **UUID剥离**: 上传到沙箱时移除文件名中的 UUID 前缀
  - **沙箱文件恢复**: 从数据库重新上传所有文件到新沙箱

### 5.7 Controller (`controller.js`)
- **功能**: HTTP/SSE 请求处理
- **代码**: 619 行
- **特性**:
  - **SSE 流式**: 创建 SSE 连接，逐 token 返回
  - **消息持久化**: 保存用户消息和 Agent 响应到 MongoDB
  - **历史加载**: 多轮对话时加载历史消息
  - **错误处理**: 统一错误响应格式

---

## 6. 系统集成点

### 6.1 端点注册
- **Enum**: 在 `packages/data-provider/src/schemas.ts` 添加了 `EModelEndpoint.e2bAssistants`。
- **Index**: 在 `api/server/services/Endpoints/index.js` 注册了初始化入口。
- **Config**: 在 `api/server/services/Config/EndpointService.js` 添加了配置生成逻辑。

### 6.2 助手逻辑集成
- **Helpers**: 在 `api/server/controllers/assistants/helpers.js` 中添加了对 `e2bAssistants` 的支持：
  - `getOpenAIClient`: 路由到 E2B 的初始化逻辑，并确保初始化 OpenAI 客户端进行 Agent 推理。
  - `fetchAssistants`: 从 `E2BAssistant` 模型获取助手列表。

---

## 7. 自定义模板与预装包 (重要 💡)

### 7.1 模板系统 (V2)
本项目采用 E2B 最新的 **TypeScript 模板系统**。模板定义位于 `e2b_template/data-analyst/template.ts`。这种方式比旧的 Dockerfile 更灵活，支持编程式定义环境。

### 7.2 构建与发布步骤
如果需要添加新的 Python 包（如 `lightgbm`）或系统依赖：

1.  **修改模板定义**:
    编辑 `e2b_template/data-analyst/template.ts`:
    ```typescript
    // 示例：添加新的 Python 包
    .run("pip install lightgbm")
    ```

2.  **构建模板**:
    ```bash
    cd e2b_template/data-analyst
    npm install
    # 构建开发版 (Dev)
    npm run e2b:build:dev
    # 或构建生产版 (Prod)
    # npm run e2b:build:prod
    ```

3.  **获取 Template ID**:
    构建成功后，控制台会输出 Template ID (如 `xed696qfsyzpaei3ulh5`)。

4.  **配置使用**:
    将新的 Template ID 更新到 `.env` 文件中：
    ```bash
    E2B_SANDBOX_TEMPLATE=xed696qfsyzpaei3ulh5
    ```

---

## 8. 故障排除 (Troubleshooting)

### 8.1 502: The sandbox is running but port is not open
*   **原因**：沙箱内的代码解释器进程未启动。
*   **解决方法**：
    1.  **检查 Template ID**：确保 `.env` 中的 ID 对应的是基于 `code-interpreter` 构建的模板。
    2.  **重新构建**：如果模板损坏，重新运行构建命令生成新 ID。

### 8.2 400: Template is not compatible with secured access
*   **原因**：E2B API Key 开启了“安全访问”限制。
*   **解决方法**：我们在代码中已默认设置 `secure: false`。如果问题依旧，请检查 E2B Dashboard 的 API Key 设置。

---

## 9. 前端集成状态与已知问题 (2026-01-04)

### 9.1 已完成的集成 ✅
- **图标支持**: E2B Assistants 现在使用 Sparkles (✨) 图标。
- **助手创建**: 修复了 JSON 解析错误，助手可以成功创建并保存到数据库。
- **后端路由**: 补全了 `/documents` 和 `/tools` 端点，消除了前端 404 错误。
- **助手列表**: 修复 API 响应格式，刷新后可正确显示已创建的助手。
- **文件上传**: 完整实现文件上传到 E2B 沙箱功能，支持多种存储后端（Local/S3/Azure）。
- **消息流**: SSE 消息格式完全对齐前端预期，实现 created 和 final 事件。
- **数据持久化**: 用户消息和响应消息正确保存到数据库。

### 9.2 修复的关键 Bug ✅

#### ✅ 1. 文件上传失败 (已修复)
- **问题**: `Cannot read properties of undefined (reading 'paths')`
- **原因**: E2B 路由缺少 `configMiddleware`，导致 `req.config` 未初始化
- **修复**: 在路由中添加 `configMiddleware`，确保配置正确加载

#### ✅ 2. 前端无输出 (已修复)
- **问题**: 消息发送后前端无响应，显示 "2/2" 但无内容
- **原因**: SSE 消息格式不符合前端预期，缺少必需字段
- **修复**: 
  - 实现完整的 SSE 事件流（created → final）
  - 添加 conversation, requestMessage, responseMessage
  - 使用 `sanitizeMessageForTransmit` 清理消息

#### ✅ 3. 助手列表不显示 (已修复)
- **问题**: 刷新页面后看不到已创建的助手
- **原因**: API 返回数组而非 `{ data: [...] }` 格式
- **修复**: 统一 API 响应格式，与 Azure Assistants 保持一致

#### ✅ 4. 助手配置保存问题 (已修复 - 2026-01-04)
- **问题**: 创建助手后刷新页面，部分配置字段重置（description、instructions、conversation_starters、append_current_datetime、tools等）
- **原因**: 
  - Schema缺少 `append_current_datetime`、`tools`、`tool_resources` 字段定义
  - Controller的 get/list/update 方法未映射所有字段
  - `instructions` ↔ `prompt` 字段映射不完整
- **修复**:
  - 在 `e2bAssistantSchema` 中添加缺失字段（append_current_datetime、tools、tool_resources）
  - 在 `createAssistant` 中保存所有前端发送的字段
  - 在 `getAssistant`/`listAssistants` 中返回完整字段映射并设置默认值
  - 在 `updateAssistant` 中使用白名单方式处理所有可更新字段

#### ✅ 5. 对话历史丢失问题 (已修复 - 2026-01-04)
- **问题**: 同一对话中的第二条消息不记得第一条说了什么
- **原因**: `chat` 端点调用 `agent.processMessage(text)` 时未传递历史消息
- **修复**:
  - 在 `controller.js` 中添加 `getMessages` 导入
  - 在调用 `processMessage` 前使用 `getMessages` 加载对话历史
  - 将历史消息转换为 OpenAI 格式（role: user/assistant）并传递给 Agent

#### ✅ 6. 图像路径替换失败 (已修复 - 2026-01-04)
- **问题**: LLM生成的sandbox:路径无法在前端显示图像
- **原因**: 
  - `image_url_map` 中的路径模式不够全面
  - 仅使用精确匹配，无法处理LLM生成的各种路径格式
- **修复**:
  - 在 `tools.js` 中添加更多sandbox路径模式（sandbox:/、sandbox://、/tmp/等）
  - 在 `index.js` 中添加两层替换策略：
    1. 精确匹配 `image_url_map` 中的所有模式
    2. 使用正则表达式匹配任何包含图像文件名的sandbox:或文件路径
  - 存储 `image_names` 和 `image_actual_paths` 用于模式匹配

### 9.3 当前功能状态

| 功能 | 状态 | 说明 |
|------|------|------|
| 助手创建 | ✅ 完成 | 支持通过 Builder 创建助手 |
| 助手配置保存 | ✅ 完成 | 所有配置字段正确持久化 |
| 助手列表 | ✅ 完成 | 刷新后正确显示 |
| 文件上传 | ✅ 完成 | 支持 Local/S3/Azure 存储 |
| 代码执行 | ✅ 完成 | E2B 沙箱执行 Python 代码 |
| 图像生成 | ✅ 完成 | 自动提取并显示matplotlib/seaborn图表 |
| 消息显示 | ✅ 完成 | SSE 流式返回消息 |
| 数据持久化 | ✅ 完成 | 消息保存到 MongoDB |
| 历史对话 | ✅ 完成 | 多轮对话保持上下文 |
| 沙箱复用 | ✅ 完成 | 同一对话复用沙箱实例 |

### 9.4 待优化功能

- **流式响应**: 当前已实现基础流式（逐 token 输出），可进一步优化性能
- **错误重试**: 增强 LLM 工具调用失败的重试机制
- **Token 优化**: 减少系统提示词和工具定义的 Token 消耗
- **访问控制**: 实现私有/公共助手权限管理（待协作人员完成）

---

## 10. 版本历史与修复记录

为了保持本文档的简洁性，详细的架构优化记录、Bug 修复详情和历史变更已移动到以下专门文档：

- **问题解决与修复详情**: 请参阅 [E2B_AGENT_FIXES.md](./E2B_AGENT_FIXES.md)
  - 包含 2026-01-14 的关键错误检测逻辑修复
  - 包含 2026-01-07 的架构优化（图片路径、无限重试、工具精简等）
  - 包含图表显示和 SSE 流式传输的修复细节

- **每日工作日志**: 请参阅 [WORK_LOG.md](./WORK_LOG.md)
  - 包含每日详细的开发进度和决策记录

- **待办事项与规划**: 请参阅 [TODO.md](./TODO.md)

---

**创建日期**: 2025-12-23  
**最后更新**: 2026-01-14  
**当前状态**: ✅ 核心功能完成！关键 bug 修复完成（错误检测、图表显示、TOOL_CALL 事件、通用错误处理）。助手配置、历史对话、图像显示、沙箱复用、实时流式响应、错误自愈、Azure 风格输出均已正常工作。
**当前分支**: `feature/e2b-integration`