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
│           ├── real_integration.js    # [已实现] 真实环境端到端测试
│           └── debug_sandbox.js       # [已实现] 沙箱调试脚本
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
- **配置**: 默认 `secure: false` 以增强兼容性，并支持智能模板选择。

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

## 9. 测试与验证

### 9.1 单元测试
```bash
cd api
npx jest tests/e2b/codeExecutor.test.js
npx jest tests/e2b/fileHandler.test.js
```

### 9.2 端到端集成测试 (推荐)
脚本 `api/tests/e2b/real_integration.js` 验证全链路逻辑（Controller -> Agent -> OpenAI -> E2B Sandbox）。
**注意**：运行前请确保 `.env` 中已配置有效的 `E2B_SANDBOX_TEMPLATE`。

```bash
node api/tests/e2b/real_integration.js
```

---

**创建日期**: 2025-12-23  
**最后更新**: 2025-12-29  
**当前状态**: 后端全链路已通。支持自定义模板和预装包。测试脚本已归档。