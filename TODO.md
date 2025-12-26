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

### ✅ 核心服务重构与优化
- [x] **重构 `fileHandler.js` (文件处理服务)**:
  - [x] 实现对 LibreChat 多存储后端（Local, S3, Azure Blob）的全面支持
  - [x] 使用 `getDownloadStream` 取代直接的 `fs` 操作，增强系统抽象一致性
  - [x] 实现 `persistArtifacts` 逻辑，支持将沙箱生成的文件持久化至系统存储并创建 DB 记录
  - [x] 引入 `Promise.allSettled` 实现文件同步与持久化的并发处理，提升性能
- [x] **优化 `codeExecutor.js` (代码执行服务)**:
  - [x] 增强图表提取逻辑，支持多格式图片及其 MIME 类型识别
  - [x] 强化安全校验，拦截危险函数调用及无限循环风险

### ✅ 单元测试验证
- [x] 编写并跑通 `api/tests/e2b/codeExecutor.test.js`:
  - 验证代码执行输出、图表捕获、安全拦截及错误处理
- [x] 编写并跑通 `api/tests/e2b/fileHandler.test.js`:
  - 验证跨存储策略的文件同步、成果物持久化及并发逻辑
- [x] 修正 Jest 配置 (`jest.config.js`) 以适配 E2B SDK 相关的 ESM 模块转换

### ✅ Agent 逻辑与系统初始化规范化
- [x] 实现 `prompts.js` - 定义系统提示词及工具声明
- [x] 重构 `initialize.js` - 实现标准的 `initializeClient` 导出，对齐 LibreChat 架构
- [x] 更新 `Endpoints/e2bAssistants/index.js` - 完整导出 `buildOptions`, `initializeClient`, `listAssistants`
- [x] 验证 `helpers.js` 与 `buildEndpointOption.js` 的集成兼容性

### ✅ Phase 3 - API层（已完成 ✅）
- [x] 实现 `api/server/routes/e2bAssistants/controller.js` (CRUD + Chat 集成)
- [x] 实现 `api/server/routes/e2bAssistants/index.js` (路由定义与中间件)
- [x] 在 `api/server/routes/index.js` 和 `api/server/index.js` 中完成挂载

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

### ⬜ Agent 编排精调 (Orchestration Tuning)
- [ ] 调研 Open Interpreter / Julius AI 的交互模式
- [ ] 优化工具调用循环的 Token 消耗
- [ ] 增强多轮对话中的上下文管理

### ⬜ 错误处理与恢复
- [ ] 实现超时错误恢复机制
- [ ] 实现内存限制友好提示

### ⬜ 资源管理与监控
- [ ] 实现代码执行指标收集
- [ ] 添加执行时间与内存监控

### ⬜ 测试
- [ ] 编写集成测试：完整对话流程
- [ ] 编写端到端测试

---

## 环境配置

### 需要的环境变量
```bash
# 在 .env 中添加
E2B_API_KEY=your_e2b_api_key_here
E2B_SANDBOX_TEMPLATE=python3-data-analysis
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
**最后更新**: 2025-12-26  
**当前状态**: 后端全链路已通 (Endpoint -> API -> Agent -> E2B Sandbox)，进入 Agent 编排精调阶段。
**当前分支**: `feature/e2b-integration`