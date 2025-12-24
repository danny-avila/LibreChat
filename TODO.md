# E2B Data Analyst Agent 开发任务清单

## 今日已完成 (2025-12-23)

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

## Phase 1: 基础设施搭建（进行中）

### ⏳ 端点集成
- [ ] 在 `api/server/middleware/buildEndpointOption.js` 中注册E2B Assistants构建函数
- [ ] 在 `api/server/services/Config/getEndpointsConfig.js` 添加E2B配置处理
- [ ] 在 `packages/data-provider/src/config.ts` 添加E2B模型配置
- [ ] 在 `packages/data-provider/src/file-config.ts` 添加E2B文件支持
- [ ] 在 `packages/data-provider/src/config.ts` 添加E2B到EndpointURLs

### ⏳ E2B模型层
- [ ] 创建 `packages/data-schemas/src/schema/e2bAssistant.ts` - E2B Assistant Schema
- [ ] 创建 `packages/data-schemas/src/models/e2bAssistant.ts` - E2B Assistant Model
- [ ] 创建 `packages/data-schemas/src/types/e2bAssistant.ts` - TypeScript类型定义
- [ ] 在 `packages/data-schemas/src/index.ts` 中注册新模型

### ⏳ API模型层
- [ ] 创建 `api/models/E2BAssistant.js` - E2B Assistant数据模型
- [ ] 实现 CRUD操作函数：
  - `createE2BAssistantDoc()` - 创建Assistant
  - `getE2BAssistantDocs()` - 获取Assistant列表
  - `getE2BAssistantDoc()` - 获取单个Assistant
  - `updateE2BAssistantDoc()` - 更新Assistant
  - `deleteE2BAssistantDoc()` - 删除Assistant
- [ ] 在 `api/models/index.js` 中注册新模型

### ⏳ 沙箱服务层
- [ ] 安装E2B SDK: `npm install @e2b/code-interpreter`
- [ ] 在 `api/server/services/Sandbox/` 目录下创建服务：
  - `codeExecutor.js` - 代码执行服务
  - `fileHandler.js` - 文件处理服务
- [ ] 实现 `CodeExecutor` 类：
  - `executeCode()` - 执行Python代码
  - `uploadFile()` - 上传文件
  - `downloadFile()` - 下载文件
  - `listFiles()` - 列出文件
  - `loadDataset()` - 加载数据集

### ⏳ E2B SDK集成
- [ ] 在 `api/server/services/Endpoints/e2bAssistants/initialize.js` 中集成实际E2B SDK
- [ ] 替换TODO标记的模拟代码为真实的E2B SDK调用
- [ ] 测试沙箱创建和销毁

---

## Phase 2: Agent核心逻辑（待开始）

### ⬜ Agent类实现
- [ ] 创建 `api/server/services/Agents/e2bAgent/` 目录
- [ ] 实现 `index.js` - E2BDataAnalystAgent主类
- [ ] 实现消息处理流程：
  - `processMessage()` - 处理用户消息
  - `initializeSandbox()` - 初始化沙箱
  - `generateLLMResponse()` - 生成LLM响应
  - `executeToolCalls()` - 执行工具调用
  - `cleanup()` - 清理资源

### ⬜ 提示词和工具
- [ ] 创建 `prompts.js` - 系统提示词生成
- [ ] 实现 `getSystemPrompt()` - 生成系统提示词
- [ ] 实现 `getToolsDefinitions()` - 获取工具定义
- [ ] 创建 `tools.js` - 工具函数实现
- [ ] 实现工具函数：
  - `execute_code` - 执行Python代码
  - `upload_file` - 上传文件
  - `download_file` - 下载文件

### ⬜ LLM集成
- [ ] 集成OpenAI LLM客户端
- [ ] 实现工具调用逻辑
- [ ] 实现对话上下文管理

---

## Phase 3: API层（待开始）

### ⬜ 控制器
- [ ] 创建 `api/server/routes/e2bAssistants/` 目录
- [ ] 实现 `controller.js` - API控制器
- [ ] 实现控制器方法：
  - `createAssistant()` - 创建Assistant
  - `listAssistants()` - 获取Assistant列表
  - `getAssistant()` - 获取单个Assistant
  - `updateAssistant()` - 更新Assistant
  - `deleteAssistant()` - 删除Assistant
  - `chat()` - 与Assistant对话

### ⬜ 路由
- [ ] 创建 `index.js` - 路由注册
- [ ] 注册API端点：
  - `POST /api/e2b-assistants/` - 创建Assistant
  - `GET /api/e2b-assistants/` - 获取Assistant列表
  - `GET /api/e2b-assistants/:assistant_id` - 获取单个Assistant
  - `PATCH /api/e2b-assistants/:assistant_id` - 更新Assistant
  - `DELETE /api/e2b-assistants/:assistant_id` - 删除Assistant
  - `POST /api/e2b-assistants/:assistant_id/chat` - 对话
- [ ] 在主路由中注册E2B Assistants路由

### ⬜ 中间件
- [ ] 实现访问控制中间件（协作部分）
- [ ] 实现参数验证中间件
- [ ] 添加认证中间件

---

## Phase 4: 优化和测试（待开始）

### ⬜ 错误处理
- [ ] 实现超时错误处理
- [ ] 实现内存限制错误处理
- [ ] 实现沙箱错误恢复机制
- [ ] 添加友好的错误提示

### ⬜ 资源管理
- [ ] 在服务器关闭时添加graceful shutdown处理
- [ ] 实现沙箱清理逻辑
- [ ] 添加SIGTERM/SIGINT信号处理

### ⬜ 监控和日志
- [ ] 实现代码执行指标收集
- [ ] 添加执行时间监控
- [ ] 添加内存使用监控
- [ ] 添加详细日志记录

### ⬜ 测试
- [ ] 编写单元测试：
  - `tests/e2b/client.test.js` - E2B客户端测试
  - `tests/e2b/executor.test.js` - 代码执行测试
  - `tests/e2b/agent.test.js` - Agent测试
- [ ] 编写集成测试：
  - 完整对话流程测试
  - 文件上传和数据分析测试
  - 沙箱生命周期测试
  - 错误处理测试
- [ ] 编写端到端测试

---

## 待提交内容

### 下次提交计划
完成后将提交以下内容：

```bash
# Phase 1 提交
git add packages/data-provider/src/schemas.ts
git add api/server/services/Endpoints/e2bAssistants/
git add packages/data-schemas/src/schema/e2bAssistant.ts
git add packages/data-schemas/src/models/e2bAssistant.ts
git add packages/data-schemas/src/types/e2bAssistant.ts
git add api/models/E2BAssistant.js
git add api/server/services/Sandbox/
git commit -m "feat(e2b): Complete Phase 1 - E2B infrastructure setup"

# Phase 2 提交
git add api/server/services/Agents/e2bAgent/
git commit -m "feat(e2b): Complete Phase 2 - E2B Data Analyst Agent core"

# Phase 3 提交
git add api/server/routes/e2bAssistants/
git add api/server/middleware/
git commit -m "feat(e2b): Complete Phase 3 - E2B Assistants API layer"

# Phase 4 提交
git add api/tests/e2b/
git commit -m "feat(e2b): Complete Phase 4 - Error handling and optimization"
```

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

### 需要安装的依赖
```bash
npm install @e2b/code-interpreter
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

### 现有参考代码
- Azure Assistants实现: `api/server/services/Endpoints/azureAssistants/`
- Assistant模型: `packages/data-schemas/src/schema/assistant.ts`
- 端点构建: `api/server/middleware/buildEndpointOption.js`
- 配置加载: `api/server/services/Config/getEndpointsConfig.js`

---

**创建日期**: 2025-12-23  
**最后更新**: 2025-12-23  
**当前分支**: feature/e2b-integration
