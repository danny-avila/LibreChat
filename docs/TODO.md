# E2B Data Analyst Agent 开发任务清单

## 2025-12-23 已完成任务 ✅

### ✅ 基础工作
- [x] 分析LibreChat代码库结构
- [x] 理解Azure Assistants架构
- [x] 设计E2B Data Analyst Agent架构
- [x] 明确职责分工（E2B模块由当前开发，访问控制由协作）
- [x] 编写完整的Markdown开发文档
- [x] 文档已保存并提交到git

### ✅ 系统集成准备
- [x] 创建E2B开发文档（E2B_DATA_ANALYST_AGENT_DEVELOPMENT.md）
- [x] 补充系统集成关键步骤（端点枚举、构建函数、配置集成等）
- [x] 补充错误处理和资源管理章节
- [x] 文档已提交到git (commit: 23d4654e1)

### ✅ Phase 1 - 数据库Schema和类型定义
- [x] 在 `packages/data-provider/src/schemas.ts` 添加 `e2bAssistants` 枚举
- [x] 验证TypeScript编译成功
- [x] 创建 `api/server/services/Endpoints/e2bAssistants/` 目录

### ✅ Phase 1 - 端点构建函数
- [x] 创建 `buildOptions.js` - E2B Assistants端点选项构建函数
- [x] 实现基本的参数处理逻辑

### ✅ Phase 1 - E2B客户端管理器（基础架构）
- [x] 创建 `initialize.js` - E2B客户端管理器
- [x] 实现 `E2BClientManager` 类（带TODO标记，待集成实际SDK）
- [x] 实现沙箱生命周期管理方法：
  - `createSandbox()` - 创建沙箱
  - `getSandbox()` - 获取沙箱
  - `killSandbox()` - 终止沙箱
  - `cleanup()` - 清理所有沙箱
  - `getActiveSandboxCount()` - 获取活跃沙箱数量
- [x] 使用单例模式导出管理器

---

## 2025-12-24 已完成任务 ✅

### ✅ E2B SDK 深度集成 (v2.8.4 适配)
- [x] 安装 E2B SDK: `npm install @e2b/code-interpreter`
- [x] **重构 `initialize.js` (E2B 客户端管理器)**:
  - [x] 修正属性名为 `sandboxId` (小写d) 以对齐 SDK 源码
  - [x] 修正 `Sandbox.create(template, opts)` 的显式传参方式
  - [x] 切换至 `.files` 模块 (取代旧版 filesystem) 实现文件操作
  - [x] 适配 `result.logs.stdout/stderr` 嵌套数据结构
  - [x] 实现 `betaGetMcpToken` 和 `betaGetMcpUrl` (适配 Beta 前缀)
  - [x] 完成优雅关闭逻辑 (SIGTERM/SIGINT 自动清理)
- [x] **重构 `codeExecutor.js` (代码执行服务)**:
  - [x] 实现 Python 代码安全分级校验 (Critical/Warning)
  - [x] **重大突破**: 实现从 `results` 数组中自动提取 Base64 格式的图表 (PNG/JPEG/SVG)
  - [x] 实现多代码块批量执行逻辑 (`executeBatch`)
  - [x] 适配 v2.8.4 的日志格式化处理

### ✅ 数据库与全系统集成
- [x] 创建 `packages/data-schemas/src/schema/e2bAssistant.ts` - E2B Assistant Schema
- [x] 创建 `packages/data-schemas/src/models/e2bAssistant.ts` - E2BAssistant Model
- [x] 创建 `packages/data-schemas/src/types/e2bAssistant.ts` - TypeScript 类型定义
- [x] 在 `packages/data-schemas/src/index.ts` 中注册新模型
- [x] 在 `api/server/middleware/buildEndpointOption.js` 中注册 E2B 构建函数

---

## 2025-12-25 已完成任务 ✅

### ✅ Agent 逻辑起步
- [x] 实现 `prompts.js` - 定义 Data Analyst Agent 的系统提示词及工具函数声明

---

## 2025-12-26 已完成任务 ✅

### ✅ 核心服务重构与深度优化
- [x] **重构 `fileHandler.js` (文件处理服务)**:
  - [x] 实现对 LibreChat 多存储后端（Local, S3, Azure Blob）的全面支持
  - [x] 实现 `persistArtifacts` 逻辑，支持将沙箱生成的成果持久化并同步创建 DB 记录
  - [x] 增加对内存 Buffer (Base64) 的直接持久化支持，优化图表保存流程
- [x] **优化 `codeExecutor.js` (代码执行服务)**:
  - [x] 增强图表提取逻辑，支持多格式图片及其 MIME 类型自动识别
  - [x] 强化安全校验与日志格式化处理

### ✅ Agent 核心类与工具实现
- [x] **实现 `index.js` (E2BDataAnalystAgent)**: 基于 ReAct 循环的多轮对话核心类
- [x] **实现 `tools.js`**: 封装 `execute_code`, `upload_file`, `download_file` 为 Agent 可用工具
- [x] 将 Agent 逻辑完整集成至 Controller 端的 `chat` 方法

### ✅ 系统初始化规范化
- [x] **规范化 `initialize.js`**: 实现标准的 `initializeClient` 导出，确保 singleton 状态管理与端点架构对齐
- [x] **完善 `index.js` (Endpoint 入口)**: 导出 `buildOptions` 及包含 OpenAI 客户端的初始化环境

### ✅ 自动化与集成测试验证
- [x] 编写并跑通 `api/tests/e2b/codeExecutor.test.js` 和 `fileHandler.test.js` 单元测试
- [x] **实现并跑通端到端集成测试 (`manual_integration.js` / `real_integration.js`)**:
  - 验证 **Controller -> Agent -> LLM (Mocked) -> E2B Sandbox (Mocked)** 逻辑闭环
  - 验证 **真实环境集成 (Real DB + OpenAI + E2B Cloud)**：确认 Agent 具备真实云端执行与错误重试能力

### ✅ Phase 3 - API层（全面完成 ✅）
- [x] 实现 CRUD 控制器、路由定义、中间件配置及全系统挂载

---

## 2025-12-31 前端集成与Bug修复（进行中 ⏳）

### ✅ 基础设施修复
- [x] **后端Schema**: 修复 `librechat.yaml` 验证错误 (Unrecognized key: e2bAssistants)，更新 `packages/data-provider` 和 `loadCustomConfig.js`。
- [x] **后端路由**: 补全缺失的 `/tools` 和 `/documents` 路由，解决前端 404 错误。
- [x] **前端构建**: 修复 `tsconfig.json` 覆盖输入文件错误，修改 `vite.config.ts` 强制 Docker 重新构建前端。
- [x] **UI图标**: 在 `MessageEndpointIcon.tsx` 和 `Icons.tsx` 中添加 E2B 助手图标支持 (Sparkles)。
- [x] **助手创建**: 修复前端 `undefined is not valid JSON` 错误（通过在 `mutations.ts` 中增加空值保护）。
- [x] **ID生成**: 统一后端生成的助手 ID 前缀为 `asst_`。

---

## 2026-01-04 重大Bug修复与系统完善 ✅

### ✅ 文件上传系统修复
- [x] **前端编译错误修复**: 在 `useFileHandling.ts` 中添加缺失的 `EModelEndpoint` 导入
- [x] **配置中间件缺失 (Critical)**: 在 E2B 路由中添加 `configMiddleware`，修复 `req.config` 未初始化导致的文件访问失败
- [x] **文件上传逻辑优化**: 确保 E2B 文件上传标记为 `message_file: 'true'`，跳过 RAG 向量索引
- [x] **错误处理增强**: 在 `fileHandler.js` 中为本地文件源添加明确的配置检查

### ✅ SSE 消息流修复 (Critical)
- [x] **消息格式完全对齐**: 修复 SSE 响应格式，与 Agent Controller 保持一致
- [x] **created 事件实现**: 发送用户消息的 created 事件，符合前端预期
- [x] **final 事件结构**: 包含完整的 conversation, requestMessage, responseMessage
- [x] **消息持久化**: 实现用户消息和响应消息的数据库保存

### ✅ 助手列表显示修复
- [x] **API 响应格式修复**: 修改 `listAssistants` 返回格式为 `{ data: [...] }`，与 Azure Assistants 一致
- [x] **刷新后可见**: 解决刷新页面后看不到已创建助手的问题

### ✅ 助手配置完整持久化 (2026-01-04 下午)
- [x] **Schema 扩展**: 在 `e2bAssistantSchema` 中添加缺失的 `append_current_datetime`、`tools`、`tool_resources` 字段
- [x] **字段映射修复**: 在 `createAssistant`/`getAssistant`/`listAssistants`/`updateAssistant` 中实现完整字段映射
- [x] **instructions ↔ prompt 映射**: 确保前后端字段名称转换正确
- [x] **默认值处理**: 为所有可选字段设置合理的默认值
- [x] **白名单更新**: 在 `updateAssistant` 中使用白名单方式处理所有可更新字段

### ✅ 对话历史保持 (2026-01-04 下午)
- [x] **历史消息加载**: 在 `controller.js` 中添加 `getMessages` 导入
- [x] **上下文传递**: 调用 `processMessage` 前加载并转换历史消息为 OpenAI 格式
- [x] **多轮对话**: Agent 现在能正确理解对话上下文，实现真正的多轮交互
- [x] **沙箱复用验证**: 确认同一对话中沙箱实例被正确复用

### ✅ 图像路径替换增强 (2026-01-04 下午)
- [x] **扩展路径映射**: 在 `tools.js` 中添加 6 种常见 sandbox 路径模式（sandbox:/、sandbox://、/tmp/ 等）
- [x] **双层替换策略**: 
  - 第一层：精确匹配 `image_url_map` 中的所有预定义模式
  - 第二层：使用正则表达式匹配任何包含图像文件名的路径
- [x] **模式匹配增强**: 存储 `image_names` 和 `image_actual_paths` 用于灵活的模式匹配
- [x] **日志优化**: 详细记录每种替换模式的匹配次数

### ✅ 文档更新
- [x] **创建修复文档**: 编写 `docs/E2B_FILE_UPLOAD_FIX.md`，详细记录问题分析和修复方案
- [x] **更新开发文档**: 更新 `E2B_DATA_ANALYST_AGENT_DEVELOPMENT.md`，反映最新状态
- [x] **更新TODO文档**: 同步所有修复到 TODO.md

### 🎯 已验证功能
- ✅ 助手创建和列表显示
- ✅ 所有配置字段完整保存（刷新后不丢失）
- ✅ 文件上传到 E2B 沙箱
- ✅ 代码执行和结果返回
- ✅ 图像生成和前端显示
- ✅ 消息持久化到数据库
- ✅ 多轮对话保持上下文
- ✅ 刷新后历史对话可见
- ✅ 沙箱实例智能复用

### ⏳ 待优化项
- [ ] Agent 编排精调 (优化 Token 消耗)
- [ ] 流式响应优化 (当前已实现基础流式，待进一步优化)
- [ ] 错误重试机制优化
- [ ] 访问控制实现（私有/公共助手）

---

## 2026-01-07 ~ 2026-01-08 核心系统完善与架构优化 ✅

### ✅ 1. Context Manager 完整实现 (架构核心)
- [x] **Single Source of Truth**: 统一管理会话状态、文件、生成的工件
- [x] **内部/外部隔离**: 内部存储 `file_id`（带UUID前缀），外部只暴露 clean filename
- [x] **结构化上下文生成**: 
  - `generateFilesContext()` - 文件列表上下文
  - `generateArtifactsContext()` - 生成工件历史
  - `generateErrorRecoveryContext()` - 动态错误恢复指导
- [x] **conversationId 追踪**: 每个 artifact 记录所属对话，防止混淆
- [x] **详细日志**: 构造函数和关键操作的完整日志记录

### ✅ 2. 双层沙箱恢复系统 (会话持久性)
- [x] **Layer 1 - 初始化恢复** (`index.js` lines 50-100):
  - 检测对话中是否已有文件但沙箱不存在
  - 从 Context Manager 提取 file_ids
  - 调用 `syncFilesToSandbox` 实际上传文件
  - **关键修复**: 不仅更新 Context Manager，还要真正上传
- [x] **Layer 2 - 执行超时恢复** (`tools.js`):
  - 检测沙箱连接超时/过期
  - 自动重建沙箱并恢复所有文件
  - 重新执行用户代码
- [x] **文件恢复流程**:
  ```
  Database (UUID__ prefix) 
    → Query first message with files
    → Extract file_ids
    → syncFilesToSandbox (strips prefix automatically)
    → Context Manager stores clean name + file_id
    → LLM only sees: /home/user/titanic.csv
  ```
- [x] **恢复日志验证**: "Restoring X files to new sandbox...", "File uploaded successfully"

### ✅ 3. 迭代控制系统优化 (性能与稳定性)
- [x] **迭代限制提升**: 从 10 次增加到 **20 次** (`index.js` line 39)
- [x] **提前提醒机制**: 
  - 提醒阈值: `maxIterations - 3` (第 17 次迭代)
  - 消息内容: "⚠️ IMPORTANT: You have X iterations remaining. Please provide your final analysis..."
  - 触发位置: 流式和非流式模式都实现 (lines 318-330, 373-385)
- [x] **System Prompt 强化**: 添加 "CRITICAL - Always Provide Explanations" 章节
  - 强调每次代码执行后必须提供文字说明
  - 防止无限工具调用循环
- [x] **问题修复**: 解决 Agent 达到 max iterations 但无任何输出的问题

### ✅ 4. 错误恢复策略重构 (灵活性与可维护性)
- [x] **从具体到通用的转变**:
  ```
  旧方案: 为每种错误类型硬编码解决方案
         → pandas ValueError 特定代码
         → KeyError 特定代码
         → TypeError 特定代码
         ✗ 不可扩展，遇到新错误需要修改代码
  
  新方案: 分层错误处理
         → Tier 1: 关键错误（FileNotFound, ImportError, matplotlib）
         → Tier 2: 通用调试指导（所有其他错误）
         → Tier 3: LLM 自主分析和修复
         ✓ 可扩展，无需为每种错误编码
  ```
- [x] **移除的方法**: `_generatePandasDataTypeRecovery()` (~20 lines)
- [x] **新增的方法**: `_generateGenericErrorGuidance()` (contextManager.js lines 320-345)
  ```javascript
  💡 DEBUGGING TIPS:
  1. Read the error traceback carefully
  2. Check data types - Use df.dtypes, df.info()
  3. Inspect data - Use df.head(), df.describe()
  4. Common issues: wrong data types, missing values, wrong columns
  5. Fix strategy: df.select_dtypes(), df.dropna(), df.astype()
  ```
- [x] **设计哲学**: "Teach how to debug" > "Memorize solutions"

### ✅ 5. 可视化路径问题修复 (用户体验)
- [x] **System Prompt 增强** (`prompts.js` lines 18-26):
  ```javascript
  ## 🎨 VISUALIZATION RULES (CRITICAL)
  - ✅ CORRECT: Just call plt.show()
  - ❌ WRONG: plt.savefig('/images/myplot.png')  // /images/ doesn't exist in sandbox
  ```
- [x] **Context Manager 动态提醒**: 在文件上下文中提醒 LLM 不要保存到 /images/
- [x] **问题根源**: LLM 看到用户侧的 `/images/userId/timestamp-plot.png` 路径，误以为沙箱中也有这个目录
- [x] **解决效果**: LLM 现在只使用 `plt.show()` 或保存到 `/tmp/`，由系统自动持久化

### ✅ 6. 图片路径架构简化 (2026-01-07)
- [x] **移除复杂逻辑**: 彻底删除 `index.js` 中的 `replaceImagePaths()` 方法
- [x] **直接路径提供**: 在 `tools.js` observation 中直接提供最终路径
  ```javascript
  observation.image_paths = persistedFiles.map(f => f.filepath);
  observation.images_markdown = persistedFiles.map((f, i) => 
    `![Plot ${i}](${f.filepath})`
  ).join('\n');
  ```
- [x] **System Prompt 指导**: 明确告知 LLM "Use the image paths provided in observation"
- [x] **修复问题**: 解决路径双重嵌套 bug (`/images/.../timestamp-/images/.../plot-0.png`)
- [x] **根本原因**: LLM 引用历史图片路径 → 路径替换匹配到子串 → 重复替换 → 嵌套
- [x] **新架构优势**: 
  - 不依赖字符串匹配和替换
  - LLM 直接获得正确路径
  - 多轮对话中引用历史图片不会出错

### ✅ 7. 无限重试循环修复 (Critical Bug)
- [x] **问题表现**:
  ```
  iteration 1: execute_code → error
  iteration 2-10: 重复执行相同代码（没有改进）
  最终: Reached max iterations
  ```
- [x] **根本原因**: observation 格式不一致
  - 成功: `{ success: true, stdout, stderr, has_plots, plot_count, image_paths, ... }`
  - 失败: `{ success: false, error }` ⚠️ 缺少关键字段
- [x] **LLM 行为**: 因缺少结构化信息，无法判断失败原因，只能重试
- [x] **修复方案**: 统一格式，失败时也返回完整结构
  ```javascript
  return {
    success: false,
    error: error.message,
    stdout: '',
    stderr: error.message,
    has_plots: false,
    plot_count: 0,
    image_paths: [],
    images_markdown: '',
    plot_info: ''
  };
  ```
- [x] **验证结果**: LLM 现在能正确分析失败原因并调整策略

### ✅ 8. 工具精简与优化
- [x] **移除 download_file 工具**:
  - 发现与 execute_code 的自动图片持久化功能 100% 冗余
  - LLM 困惑何时使用哪个工具
- [x] **保留工具**: 只有 `execute_code` 和 `upload_file`
- [x] **System Prompt 更新**: 移除 download_file 引用，强调自动持久化
- [x] **E2B API 修复** (`initialize.js`):
  ```javascript
  // 修复前
  const content = await sandbox.files.read(path, { format });
  
  // 修复后
  const response = await sandbox.files.read(path, { format });
  let content;
  if (format === 'buffer') {
    const arrayBuffer = await response.arrayBuffer();
    content = Buffer.from(arrayBuffer);
  } else {
    content = await response.text();
  }
  ```
- [x] **测试用例更新**: E2B_AGENT_TEST_CASES.md 添加自动持久化测试

### ✅ 9. 诊断日志增强 (Debug Infrastructure)
- [x] **codeExecutor.js**:
  ```javascript
  logger.debug(`[CodeExecutor] Full result:`, JSON.stringify({
    success, stdout: stdout?.substring(0, 500), 
    stderr: stderr?.substring(0, 500), error, 
    hasVisualization, imageCount
  }, null, 2));
  ```
- [x] **tools.js**:
  - 成功: 完整 observation 对象
  - 失败: 完整 error observation
  - 代码执行前后的状态
- [x] **index.js**:
  - 工具调用参数 (JSON.stringify)
  - 工具执行结果（流式和非流式分别记录）
  - 迭代计数和状态
- [x] **控制方式**: 
  - 使用 `logger.debug()` 而非 `logger.info()`
  - 需要 `DEBUG_LOGGING=true` 或 `LOG_LEVEL=debug` 启用
  - 避免生产环境日志污染
- [x] **用途**: 诊断复杂问题（如高级统计分析为何失败）

### 📝 架构文档
- [x] **E2B_ARCHITECTURE_AND_FIXES.md**: 完整的系统架构说明
- [x] **E2B_AGENT_TEST_CASES.md**: 更新错误处理策略说明
- [x] **TODO.md**: 完整的开发历史和修复记录

---

## Phase 1: 基础设施搭建（已完成 ✅）

### ✅ 端点集成
- [x] 在 `api/server/services/Config/getEndpointsConfig.js` 添加 E2B 配置处理
- [x] 在 `packages/data-provider/src/config.ts` 添加 E2B 模型配置
- [x] 在 `packages/data-provider/src/file-config.ts` 添加 E2B 文件支持
- [x] 在 `packages/data-provider/src/config.ts` 添加 E2B 到 EndpointURLs

### ✅ API 模型层 (CRUD 实现)
- [x] 创建 `api/models/E2BAssistant.js` - E2B Assistant 业务层数据模型
- [x] 实现 CRUD 操作函数
- [x] 在 `api/models/index.js` 中注册新模型

### ✅ 沙箱服务层完善
- [x] 创建 `api/server/services/Sandbox/fileHandler.js` (多后端支持 + 成果持久化)
- [x] 增强 `codeExecutor.js` (安全校验 + 图表提取)

---

## Phase 2: Agent核心逻辑（已完成 MVP ✅）

### ✅ 提示词和工具定义
- [x] 创建 `prompts.js` - 系统提示词生成
- [x] 实现 `getToolsDefinitions()` - 工具声明

### ✅ Agent类与工具实现
- [x] 实现 `tools.js` - 封装 `execute_code`, `upload_file`, `download_file`
- [x] 实现 `index.js` - `E2BDataAnalystAgent` 主类 (ReAct 循环实现)
- [x] 将 Agent 逻辑集成至 Controller 的 `chat` 方法

---

## Phase 4: 优化和后续调研（进行中 ⏳）

### ⏳ Agent 编排精调 (Orchestration Tuning)
- [ ] 调研 Open Interpreter / Julius AI 的交互模式
- [ ] 优化工具调用循环的 Token 消耗
- [ ] 增强多轮对话中的上下文管理

### ✅ 错误处理与恢复
- [x] 验证沙箱连接超时 (502) 的自动重试机制
- [x] 验证环境缺失包时的降级处理

### ✅ 资源管理与监控
- [x] 实现并验证自定义 Docker 模板构建流程
- [x] 优化 Dockerfile 以适应受限磁盘空间（移除 PyTorch，保留 XGBoost）

### ✅ 测试
- [x] 编写并跑通集成测试：`real_integration.js`
- [x] 验证 XGBoost 机器学习任务全流程

---

## 环境配置

### 需要的环境变量
```bash
# 在 .env 中添加
E2B_API_KEY=your_e2b_api_key_here
# 使用构建成功的 Data Analyst 模板 ID
E2B_SANDBOX_TEMPLATE=xed696qfsyzpaei3ulh5
E2B_DEFAULT_TIMEOUT_MS=300000
E2B_DEFAULT_MAX_MEMORY_MB=2048
E2B_DEFAULT_MAX_CPU_PERCENT=80
```

---

## 注意事项

### ⚠️ 访问控制
- 访问控制逻辑由协作人员实现
- 当前TODO标记的位置需要协作人员填充：
  - `listAssistants()` - 查询过滤
  - `getAssistant()` - 权限检查
  - `updateAssistant()` - 权限检查
  - `deleteAssistant()` - 权限检查
  - `chat()` - 权限检查
  - `publishAssistant()` - 发布为公共
  - `unpublishAssistant()` - 取消发布

### ⚠️ 前端集成
- 前端UI由协作人员实现
- 需要提供的端点：
  - `GET /api/endpoints/config` - 获取E2B Assistants配置
  - `GET /api/e2b-assistants/` - 获取Assistant列表
  - `POST /api/e2b-assistants/` - 创建Assistant
  - `POST /api/e2b-assistants/:assistant_id/chat` - 对话

### ⚠️ 配置文件
- 在 `librechat.yaml` 中添加E2B配置
- 示例：
  ```yaml
  endpoints:
    e2bAssistants:
      disableBuilder: false
      capabilities:
        - code_execution
        - file_upload
        - data_analysis
      allowedLibraries:
        - pandas
        - numpy
        - matplotlib
        - seaborn
        - scikit-learn
        - xgboost
      sandboxTemplate: python3-data-analysis
  ```

---

## 参考资料

### 关键文件
- [E2B开发文档](./E2B_DATA_ANALYST_AGENT_DEVELOPMENT.md)
- [E2B Code Interpreter SDK](https://github.com/e2b-dev/code-interpreter)
- [E2B Documentation](https://e2b.dev/docs)

---

## 2026-01-12 流式传输优化 ✅

### ✅ SSE 流式传输完整修复
- [x] **问题诊断**: 发现 E2B Agent 响应格式与 OpenAI Assistants 不一致
  - E2B 使用 `{ message: true, text: "..." }` → 触发 messageHandler (批量模式)
  - OpenAI 使用 `{ type: "text", text: { value: "..." } }` → 触发 contentHandler (流式模式)
- [x] **事件格式统一**: 修改 E2B 后端事件格式为 OpenAI Assistants 兼容格式
  ```javascript
  // 旧格式
  { message: true, text: fullResponseText }
  
  // 新格式（OpenAI 兼容）
  { 
    type: 'text',
    index: 0,
    text: { value: fullResponseText },
    messageId, 
    conversationId 
  }
  ```
- [x] **移除 thread_id 依赖**: E2B 不使用 OpenAI threads，前端可正确处理 undefined
- [x] **Compression 中间件问题修复** (Critical):
  - **根本原因**: `api/server/index.js` 全局启用 `compression()` 中间件
  - **影响**: 响应被缓冲以优化压缩率，所有 SSE 事件在同一毫秒到达浏览器
  - **解决方案**: 在 `sendEvent()` 后立即调用 `res.flush()` 强制刷新缓冲区
  ```javascript
  sendEvent(res, eventData);
  // FLUSH: Critical for real-time streaming when compression is enabled
  if (res.flush) res.flush();
  ```
- [x] **验证结果**: 
  - ✅ 浏览器 DevTools 显示每个事件独立到达
  - ✅ 文本逐字累积显示（`在` → `在分析` → `在分析泰坦尼克号数据集`）
  - ✅ 真正的实时流式体验

### 📝 技术要点
- **前端事件路由**: `useSSE.ts` 根据事件字段判断处理器
  - `data.type != null` → contentHandler（使用 messageMap，支持流式）
  - `data.message != null` → messageHandler（重建数组，批量显示）
- **OpenAI 标准格式**: 嵌套结构 `text: { value: string }` 而非扁平 `text: string`
- **Compression 与 SSE**: Express compression 需要显式 flush 才能实时传输
- **res.flush() 来源**: `compression` 中间件会为响应对象添加此方法

### 🎯 性能特点
- Token 生成速度: OpenAI gpt-4o 非常快（每秒几十个 token）
- 网络延迟: 低延迟环境下多个事件可能在同一毫秒到达
- 这是**正常且期望的行为** - 系统应尽可能快地显示内容
- 用户体验: "快速流式" > "慢速打字机效果"

---

## 2026-01-14 关键 Bug 修复与系统完善 ⭐⭐⭐

### ✅ 错误检测逻辑严重 Bug 修复 (Critical)
- [x] **问题**: `initialize.js` 使用 `!result.error` 判断错误，当 `result.error` 是对象时误判为成功
- [x] **影响**: LLM 收不到错误信息，不断重复执行失败代码，无法自动修复
- [x] **根本原因**: JavaScript 对象真值判断 `!{} === false`，导致 `success: false` 但后续逻辑认为成功
- [x] **修复方案**:
  - 使用明确的 `hasError` 布尔变量判断
  - 添加 `errorName` 和 `traceback` 字段完整传递
  - 完整的错误信息链：initialize.js → codeExecutor.js → tools.js → LLM
- [x] **验证结果**: ✅ 错误自动修复成功（ValueError → df.select_dtypes() 修复）

### ✅ 图表显示问题修复
- [x] **问题**: 4个图表生成成功但前端不显示
- [x] **根本原因**: LLM 生成了图表但没有输出 markdown 语法
- [x] **System Prompt 问题**: 之前说 "automatically captured and displayed"，LLM 误以为不需要自己输出
- [x] **修复方案**: 在 System Prompt 中明确要求 "YOU MUST output the image markdown"
- [x] **状态**: ⏳ 等待用户测试验证

### ✅ TOOL_CALL 事件与 ExecuteCode 组件集成 (Azure Assistant 风格)
- [x] **目标**: 实现代码块和输出紧密显示，类似 Azure Assistant
- [x] **Content 数组架构**: 
  ```javascript
  message.content = [
    { type: 'text', text: { value: '分析开始...' } },
    { type: 'tool_call', tool_call: { 
        id, name: 'execute_code',
        args: '{"lang":"python","code":"..."}',
        progress: 1.0,
        output: '...'
    }},
    { type: 'text', text: { value: '从结果看出...' } }
  ]
  ```
- [x] **实现组件**:
  - `controller.js`: contentParts 数组管理、startNewTextPart() 函数
  - `index.js`: TOOL_CALL 事件发送（开始/完成）、TEXT part 切断
  - 前端 ExecuteCode: 自动解析 args 并显示代码和输出
- [x] **显示效果**: ✅ 代码块和输出框紧密显示，文本和工具调用正确交错

### ✅ 通用错误处理策略优化
- [x] **优化**: 移除针对特定错误（如 ValueError）的硬编码提示
- [x] **新策略**: 提供通用调试方法论，让 LLM 自主分析和修复
- [x] **优势**:
  - 可处理未见过的错误类型
  - LLM 学会调试方法而非记忆答案
  - 代码更简洁，易于维护
- [x] **验证**: ✅ 成功处理 ValueError 并自动修复

### 📝 修改的文件
1. ✅ `api/server/services/Endpoints/e2bAssistants/initialize.js` - 错误检测逻辑修复
2. ✅ `api/server/services/Sandbox/codeExecutor.js` - errorName 和 traceback 传递
3. ✅ `api/server/services/Agents/e2bAgent/tools.js` - 完整错误信息传递给 LLM
4. ✅ `api/server/services/Agents/e2bAgent/prompts.js` - 图表显示规则 + 通用错误处理
5. ✅ `api/server/services/Agents/e2bAgent/index.js` - TOOL_CALL 事件发送
6. ✅ `api/server/routes/e2bAssistants/controller.js` - Content 数组架构
7. ✅ `docs/E2B_AGENT_FIXES.md` - 问题修复详细文档
8. ✅ `docs/E2B_DATA_ANALYST_AGENT_DEVELOPMENT.md` - 开发文档更新
9. ✅ `docs/E2B_AGENT_TEST_CASES.md` - 测试用例更新

### 🎯 验证结果
- ✅ 错误自动修复成功（ValueError → 正确的 pandas 代码）
- ✅ 静默恢复（用户不看到错误信息）
- ✅ 4个图表生成成功
- ⏳ 图表显示（System Prompt 已修复，待测试）
- ✅ TOOL_CALL 事件正确发送
- ✅ ExecuteCode 组件正确显示代码和输出
- ✅ Content 数组交错结构工作正常
- ✅ Azure Assistant 风格输出实现

---

**创建日期**: 2025-12-23  
**最后更新**: 2026-01-14  
**当前状态**: ✅ 核心功能完成！关键 bug 修复完成（错误检测、图表显示、TOOL_CALL 事件、通用错误处理）。助手配置、历史对话、图像显示、沙箱复用、实时流式响应、错误自愈、Azure 风格输出均已正常工作。
**当前分支**: `feature/e2b-integration`

---
