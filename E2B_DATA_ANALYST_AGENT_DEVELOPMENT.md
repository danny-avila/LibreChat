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
│   │   │   │       ├── index.js        # [待实现] Data Analyst Agent核心
│   │   │   │       ├── prompts.js     # [已实现] 系统提示词
│   │   │   │       └── tools.js       # [待实现] 工具定义
│   │   │   ├── Endpoints/
│   │   │   │   └── e2bAssistants/
│   │   │   │       ├── index.js       # [已实现] 端点入口
│   │   │   │       ├── initialize.js  # [已实现] E2B客户端管理器 (E2BClientManager)
│   │   │   │       └── buildOptions.js # [待实现] 选项构建
│   │   │   ├── Sandbox/
│   │   │   │   ├── codeExecutor.js    # [已实现] 代码执行服务
│   │   │   │   └── fileHandler.js     # [已实现] 文件处理服务 (支持Local/S3/Azure)
│   │   └── routes/
│   │       └── e2bAssistants/
│   │           ├── index.js           # [待实现] 路由注册
│   │           └── controller.js      # [待实现] 控制器逻辑
│   └── tests/
│       └── e2b/
│           ├── codeExecutor.test.js   # [已实现] CodeExecutor单元测试
│           └── fileHandler.test.js    # [已实现] FileHandler单元测试
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
- **文件操作**: 使用 `.files` API 进行文件读写。

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
  - **流式传输**: 使用 Stream API 高效传输文件。

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

## 7. 下一步计划 (Phase 2 & 3)

1. **实现 Agent 核心类 (`index.js`)**: 将 LLM、CodeExecutor 和 FileHandler 串联，实现 ReAct 循环或工具调用循环。
2. **实现 Tools (`tools.js`)**: 封装 `execute_code`, `upload_file`, `download_file` 为 LLM 可调用的函数。
3. **实现 API 控制器 (`controller.js`)**: 处理前端请求，创建/更新 Assistant，发起对话。
4. **路由注册**: 将新路由挂载到 LibreChat 的 Express 应用中。

---

**创建日期**: 2025-12-23  
**最后更新**: 2025-12-25  
**当前状态**: 基础设施与核心服务层 (Phase 1) 已完成并测试通过。正在进行 Agent 逻辑开发 (Phase 2)。