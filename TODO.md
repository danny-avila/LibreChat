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
- [ ] 流式响应实现 (当前为批量返回)
- [ ] 错误重试机制优化
- [ ] 访问控制实现（私有/公共助手）

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

**创建日期**: 2025-12-23  
**最后更新**: 2026-01-04  
**当前状态**: ✅ E2B Data Analyst Agent 核心功能全部完成！助手配置、历史对话、图像显示、沙箱复用均已正常工作。
**当前分支**: `feature/e2b-integration`

---
