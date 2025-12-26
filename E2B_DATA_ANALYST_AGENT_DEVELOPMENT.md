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
│   │   └── E2BAssistant.js              # [已实现] E2B Assistant数据模型
│   ├── server/
│   │   ├── services/
│   │   │   ├── Agents/
│   │   │   │   └── e2bAgent/
│   │   │   │       ├── index.js        # [已实现] Data Analyst Agent核心
│   │   │   │       ├── prompts.js     # [已实现] 系统提示词
│   │   │   │       └── tools.js       # [已实现] 工具定义
│   │   │   ├── Endpoints/
│   │   │   │   └── e2bAssistants/
│   │   │   │       ├── index.js       # [已实现] 端点入口
│   │   │   │       ├── initialize.js  # [已实现] E2B客户端管理器 (E2BClientManager)
│   │   │   │       └── buildOptions.js # [已实现] 选项构建
│   │   │   ├── Sandbox/
│   │   │   │   ├── codeExecutor.js    # [已实现] 代码执行服务
│   │   │   │   └── fileHandler.js     # [已实现] 文件处理服务 (支持Local/S3/Azure)
│   │   └── routes/
│   │       └── e2bAssistants/
│   │           ├── index.js           # [已实现] 路由注册
│   │           └── controller.js      # [已实现] 控制器逻辑
│   └── tests/
│       └── e2b/
│           ├── codeExecutor.test.js   # [已实现] CodeExecutor单元测试
│           ├── fileHandler.test.js    # [已实现] FileHandler单元测试
│           └── real_integration.js    # [已实现] 真实环境端到端测试
├── packages/
│   └── data-schemas/
│       ├── src/
│       │   ├── schema/
│       │   │   └── e2bAssistant.ts    # [已实现] E2B Assistant Schema
│       │   ├── models/
│       │   │   └── e2bAssistant.ts    # [已实现] E2B Assistant Model
│       │   └── types/
│       │       └── e2bAssistant.ts    # [已实现] TypeScript类型定义
```

---

## 5. 核心模块实现详情

### 5.1 E2BClientManager (`initialize.js`)
- **功能**: 管理 E2B 沙箱生命周期（创建、销毁、重用）。
- **SDK适配**: 适配了 `@e2b/code-interpreter` v2.8.4，使用 `Sandbox.create()` 和 `sandbox.kill()`。
- **配置**: `secure: false` 以确保与 E2B API 的兼容性。

### 5.2 CodeExecutor (`codeExecutor.js`)
- **功能**: 在沙箱中执行 Python 代码，处理 `stdout`/`stderr`，并提取生成的图表。
- **特性**: 
  - **图表提取**: 自动从 execution results 中提取 PNG/JPEG/SVG 格式的图片，并转换为 Base64。
  - **安全校验**: 包含基础的代码安全检查，拦截危险函数（如 `os.system`）。
  - **批量执行**: 支持按顺序执行多个代码块。

### 5.3 FileHandler (`fileHandler.js`)
- **功能**: 处理 LibreChat 系统存储与 E2B 沙箱之间的文件同步。
- **特性**:
  - **多存储支持**: 兼容 Local, S3, Azure Blob Storage。
  - **Artifacts 持久化**: 将沙箱生成的分析结果（图片、CSV等）下载并保存到 LibreChat 系统存储，创建对应的数据库记录。
  - **内存持久化**: 支持直接将内存中的 Buffer (如生成的图表) 保存到存储系统，无需重复下载。

### 5.4 E2BDataAnalystAgent (`index.js`)
- **功能**: 基于 ReAct 循环的智能代理。
- **特性**:
  - **自愈能力**: 当代码执行失败时，将错误反馈给 LLM 并自动重试。
  - **工具调用**: 集成 `execute_code`, `upload_file`, `download_file` 工具。
  - **多轮对话**: 维护对话上下文和沙箱状态。

---

## 6. 系统集成点

### 6.1 端点注册
- **Enum**: 在 `packages/data-provider/src/schemas.ts` 添加了 `EModelEndpoint.e2bAssistants`。
- **Index**: 在 `api/server/services/Endpoints/index.js` 注册了初始化入口。
- **Config**: 在 `api/server/services/Config/EndpointService.js` 添加了配置生成逻辑。

### 6.2 助手逻辑集成
- **Helpers**: 在 `api/server/controllers/assistants/helpers.js` 中添加了对 `e2bAssistants` 的支持：
  - `getOpenAIClient`: 路由到 E2B 的初始化逻辑。
  - `fetchAssistants`: 从 `E2BAssistant` 模型获取助手列表。

---

## 7. 测试与验证

### 7.1 单元测试
位于 `api/tests/e2b/` 目录：
- `codeExecutor.test.js`: 验证代码执行、图表提取和安全校验。
- `fileHandler.test.js`: 验证文件同步和持久化逻辑。

### 7.2 端到端集成测试
脚本 `api/tests/e2b/real_integration.js` 验证全链路逻辑：
1. **环境准备**: 需配置 `.env` 中的 `OPENAI_API_KEY` 和 `E2B_API_KEY`，并确保 MongoDB 运行。
2. **测试流程**:
   - 连接真实 MongoDB。
   - 创建 `Real E2B Analyst` 助手。
   - 发送 "计算 Fibonacci 数列" 的请求。
   - 验证 Agent 思考 -> 生成 Python 代码 -> E2B 沙箱执行 -> 返回结果的闭环。
   - 清理创建的助手。

**运行方式**:
```bash
node api/tests/e2b/real_integration.js
```

---

## 8. 下一步计划 (前端适配)

后端 MVP 已完成，接下来的重点是前端适配：
1. **前端 Endpoint 配置**: 确保前端能识别 `e2bAssistants`。
2. **创建界面**: 复用 Assistant 创建界面，添加 E2B 特有配置（如 Sandbox Template）。
3. **聊天界面**: 确保对话请求正确路由到 `/api/e2b-assistants/:id/chat`。

---

**创建日期**: 2025-12-23  
**最后更新**: 2025-12-26  
**当前状态**: 后端核心服务、Agent 逻辑及 API 层均已完成并通过真实环境集成测试。
**当前分支**: `feature/e2b-integration`
