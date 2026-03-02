# E2B Agent 开发工作日志

> 记录 E2B Data Analyst Agent 的每日开发进展、问题解决和关键决策。


## 2026-03-02 (周一)

### ✨ 实现文件导出下载功能 (E2B Export)
**Git Commit**: feat(e2b): Implement export_file tool for sandbox-to-user downloads

### 主要工作
1. **实现 `export_file` 工具** ⭐⭐⭐
   - **功能**: 允许 LLM 将沙箱内生成的非图片文件（CSV, Excel, JSON, Parquet, 模型文件等）导出，并向用户提供下载链接。
   - **技术实现**:
     - 在 `tools.js` 中新增 `export_file` 工具函数。
     - 调用 `fileHandler.persistArtifacts()` 将沙箱文件下载并保存到 LibreChat 本地存储。
     - 生成符合前端下载逻辑的 URL：`/files/{userId}/{file_id}/{filename}`。
     - 返回 Markdown 格式的下载链接：`[📥 Download filename](URL)`。
   - **支持格式**: CSV, TSV, TXT, JSON, JSONL, XLSX, XLS, Parquet, Feather, PKL, PDF, HTML, ZIP, GZ, PT/PTH, H5, Joblib, PY。

2. **修复 E2B 二进制文件下载 Bug** 🐛⭐
   - **问题**: 下载 Parquet/PKL 等二进制文件时报错 `response.arrayBuffer is not a function`。
   - **原因**: `initialize.js` 误认为 E2B SDK `files.read()` 返回 Fetch `Response` 对象，实际上它直接返回 `Uint8Array` 或 `string`。
   - **修复**: 
     - 修改 `initialize.js` 中的 `downloadFile` 方法。
     - 显式传递 `{ format: 'bytes' }` 给 SDK。
     - 直接使用 `Buffer.from(data)` 处理返回的 `Uint8Array`。
   - **效果**: 彻底解决所有非文本文件的沙箱提取失败问题。

3. **解决下载链接 401 Unauthorized 问题** 🛡️
   - **现象**: 用户点击下载链接跳转到新页面显示 "Unauthorized"。
   - **原因**: 
     - 原 URL `/api/files/download/...` 不匹配前端 `MarkdownComponents.tsx` 的正则。
     - 导致前端未触发 `useFileDownload` hook（带 Auth header 的 fetch）。
     - 浏览器以普通 GET 请求访问 API，因缺少 JWT Token 被拦截。
   - **修复**: 
     - 调整 `tools.js` 返回的 URL 格式为 `/files/{userId}/{file_id}/{filename}`。
     - 该格式能够命中前端正则，触发带身份验证的下载流程。

4. **系统 Prompt 强化** 📝
   - **更新内容**:
     - 在工具调用格式中新增 `export_file(path)` 说明。
     - 新增第 9 条强制规则：保存非图片输出文件后必须调用 `export_file`。
     - 明确区分：图片（Plots）自动处理，数据文件需显式调用 `export_file`。
   - **效果**: LLM 现在能够主动在保存数据后提供下载按钮，极大提升了用户闭环体验。

### 验证结果
- ✅ Parquet/PKL 二进制文件正常从沙箱持久化。
- ✅ 前端下载链接正常显示为 "📥 Download ..."。
- ✅ 点击链接可正常触发带 Token 的下载，无 401 错误。
- ✅ LLM 会在 `df.to_csv()` 后自动调用 `export_file`。

### 技术细节
**涉及文件**:
1. `api/server/services/Agents/e2bAgent/tools.js`
   - 实现 `export_file` 逻辑及 MIME 类型映射。
   - 优化下载 URL 路径以适配前端鉴权下载。
2. `api/server/services/Agents/e2bAgent/prompts.js`
   - 定义 `export_file` 函数 schema。
   - 增加强制执行规则 9 和调用示例。
3. `api/server/services/Endpoints/e2bAssistants/initialize.js`
   - 修复 `files.read()` 返回值处理逻辑，支持二进制下载。

---

## 2026-02-09 (周日)

### 🐛 Loading Dot 消失与 Prompt 优化
**Git Commit**: feat(e2b): Fix loading dot persistence and optimize system prompt

### 主要工作
1. **Loading Dot 消失问题根本修复** ⭐⭐⭐
   - **问题**: 用户反馈"有时候在对话里，第二次对话中的 dot 会消失"，系统工作状态不可见
   - **根本原因**: 
     - `contentParts` 数组初始化为空 `[]`，`contentIndex` 从 1 开始
     - 如果第一个事件是 TOOL_CALL（代码执行），会创建 `contentParts[1]`
     - 导致 `contentParts[0] = undefined`（稀疏数组）
     - 前端遍历时访问 `contentParts[0].type` 触发错误：`Cannot read properties of null (reading 'type')`
   - **修复方案**:
     - 初始化 `contentParts` 为 `[{ type: 'text', text: { value: '\u200B' } }]`（包含零宽空格占位符）
     - `currentTextIndex = 0`（TEXT part 已存在于 index=0）
     - `contentIndex = 1`（下一个 index 从 1 开始）
     - 第一个 token 替换零宽空格，后续 token 追加
   - **效果**: 
     - 消除稀疏数组，防止 null reference 错误
     - 前端始终能正确显示 loading 状态
     - 助手名称正常显示

2. **System Prompt 大幅优化** 📝⭐
   - **背景**: 用户反馈"回复不是很专业和系统性"、"暴露了内部计划流程"
   - **优化内容**:
     - **简化冗余描述** (删除 ~150 行):
       - 移除 `Multi-Scenario Adaptation Rules` 章节（4 种场景的详细示例代码）
       - 移除 `Common Error Patterns` 章节（5 种具体错误类型的硬编码处理）
       - 移除数据库连接的冗长示例代码（Python 代码块）
       - 移除 XGBoost 训练的完整代码示例
     - **精简核心规则**:
       - 保留关键工作流程（Initial Turn → Subsequent Turns → Final Turn）
       - 保留强制性要求（Plan First, Sequential Execution, Language Consistency）
       - 保留通用错误处理协议（而非特定错误类型）
     - **优化措辞**:
       - 从 "multi-scenario Python-based data tasks" 改为 "end-to-end Python data tasks"
       - 移除过多的 emoji 和警告符号（⚠️）
       - 统一术语：将各处的描述统一为简洁、专业的风格
   - **哲学转变**:
     - 从"详尽的示例驱动" → "简洁的原则驱动"
     - 从"特定场景说明" → "通用方法指导"
     - 从"冗长的代码示例" → "清晰的规则描述"
   - **效果**:
     - Prompt 长度从 233 行减少到约 170 行
     - 输出更专业、结构化，不暴露内部流程
     - LLM 聚焦核心任务，减少冗余输出

3. **稀疏数组防御性修复** 🛡️
   - **技术细节**:
     ```javascript
     // 之前（有风险）
     const contentParts = [];
     let contentIndex = 1;
     // 如果第一个是 TOOL_CALL → contentParts[1] 存在，contentParts[0] 为 undefined
     
     // 现在（安全）
     const contentParts = [{ type: 'text', text: { value: '\u200B' } }];
     let currentTextIndex = 0;  // 已存在
     let contentIndex = 1;      // 后续索引
     ```
   - **零宽空格策略**:
     - 用作占位符，维持 loading 状态可见
     - 第一个 token 到达时替换（而非追加），避免显示
     - 与 sync 事件的零宽空格配合，确保流畅过渡

### 验证结果
- ✅ 修复前端错误：`Cannot read properties of null (reading 'type')`
- ✅ Loading dot 在第二次对话中正常显示
- ✅ 助手名称始终可见
- ✅ 简单问答不再显示"任务计划"、"步骤1"等内部流程
- ✅ Prompt 长度减少约 27%，输出更简洁专业

### 技术细节
**文件修改**:
1. `api/server/routes/e2bAssistants/controller.js` (+5 行, -4 行)
   - 初始化 `contentParts` 为包含零宽空格的数组
   - 调整 `currentTextIndex` 和 `contentIndex` 初始值
   - 优化 onToken 中的 token 处理逻辑（替换 vs 追加）

2. `api/server/services/Agents/e2bAgent/prompts.js` (-63 行)
   - 删除 `Multi-Scenario Adaptation Rules` 章节（~50 行）
   - 删除 `Common Error Patterns` 章节（~15 行）
   - 删除数据库连接示例代码（~30 行）
   - 删除 XGBoost 示例代码（~20 行）
   - 精简文件管理、工具调用格式描述
   - 统一措辞为简洁专业风格

**ContentParts 数组结构对比**:
| 场景 | 旧实现 | 新实现 |
|------|--------|--------|
| 第一个事件是 TEXT | `[{type:'text',...}]` ✅ | `[{type:'text',...}]` ✅ |
| 第一个事件是 TOOL_CALL | `[undefined, {type:'tool_call',...}]` ❌ | `[{type:'text',text:{value:'\u200B'}}, {type:'tool_call',...}]` ✅ |

### 遗留问题
- 🔲 需要用户测试验证简单问答的输出质量
- 🔲 需要验证复杂数据分析任务是否仍能正常完成

### 工作时长
约 2 小时（Bug 诊断 + 修复 + Prompt 优化）

---

## 2026-02-05 (周三)

### 🚀 流式体验优化与 Prompt 增强
**Git Commit**: feat(e2b): Optimize streaming, multi-file handling and language consistency

### 主要工作
1. **多文件处理逻辑优化** 📁
   - **问题**: 用户上传多个文件后，提出通用问题（如"加载数据"、"运行EDA"）时，LLM 只处理第一个文件，忽略其他文件
   - **修复**: 修改 System Prompt 添加 Multi-File Policy
   - **实现**: 
     ```
     - **Multi-File Policy**: If multiple files are available and the user's 
       request is general (e.g., "load data", "run EDA"), you **MUST load and 
       preview ALL files** to provide a complete overview. Do not arbitrarily 
       select just one.
     ```
   - **效果**: LLM 现在会加载并预览所有可用文件，提供完整的数据概览

2. **语言一致性问题修复** 🌐
   - **问题**: LLM 在分析过程中语言不一致，中文提问时部分内容输出英文
   - **修复**: 修改 System Prompt 添加 Absolute Language Consistency 规则
   - **实现**:
     ```
     6. **Absolute Language Consistency**: You MUST detect the user's language 
        and use it EXCLUSIVELY for all parts of your response (Plan, Thoughts, 
        Interpretations, and Summary). Never switch languages.
     ```
   - **效果**: 确保从计划、思考、解释到总结全程使用用户语言

3. **流式输出体验优化** ⚡ (未完全解决)
   - **问题**: TOOL_CALL 事件流式输出延迟，前端在代码执行完成后才收到 PENDING 和 COMPLETED 事件
   - **现象**: 前端在 10 秒后同时收到两个事件，导致"正在分析"瞬间出现又消失
   - **尝试修复**:
     - ✅ 后端改为发送 `sync` 事件（匹配 Azure Assistant 实现）
     - ✅ 在所有 TOOL_CALL 事件后添加 `res.flush()`，强制刷新缓冲区
     - ⏳ 撤销了前端的临时修改（ContentParts.tsx, useEventHandlers.ts）
   - **效果**: HTTP 压缩中间件现在立即发送事件，但仍需进一步测试验证

4. **Loading Dot 消失问题调查** 🔍 (未解决)
   - **问题**: 第二次对话时，loading dots (正在加载) 消失，用户无法判断系统状态
   - **分析**: 
     - 前端依赖 `isLatestMessage` 状态来显示 loading 动画
     - `createdHandler` 调用 `resetLatestMessage()` 但未设置新值
     - 导致 `isLatestMessage` 为 false → `effectiveIsSubmitting` 为 false → 无 loading
   - **尝试方案**:
     - 方案 A: 修改前端逻辑（已撤销）
     - 方案 B: 改用 `sync` 事件匹配 Azure 实现（已实现，待测试）
   - **待验证**: 需要重新测试第二次对话是否正常显示 loading 和 stop button

### 技术细节
- **文件修改**:
  1. `api/server/services/Agents/e2bAgent/prompts.js` (+2 行)
     - 添加 Multi-File Policy 和 Absolute Language Consistency
  2. `api/server/routes/e2bAssistants/controller.js` (+14 行, -4 行)
     - 从 `created` 事件改为 `sync` 事件（匹配 Azure）
     - 添加 requestMessage 和 responseMessage 结构
  3. `api/server/services/Agents/e2bAgent/index.js` (+57 行, -22 行)
     - 在所有 TOOL_CALL 事件后添加 `res.flush()`
     - 统一事件格式（使用 `{ type, [type]: {...} }` 嵌套结构）
     - 移除单步执行限制和自动继续逻辑
     - 添加无效 file_ids 清理逻辑

- **事件格式对比**:
  | 实现 | 事件类型 | Handler | setShowStopButton |
  |------|---------|---------|-------------------|
  | Azure | `sync` | syncHandler | ✅ Line 337 |
  | E2B (旧) | `created` | createdHandler | ❌ 缺失 |
  | E2B (新) | `sync` | syncHandler | ✅ 复用 Azure |

### 验证结果
- ✅ Multi-File Policy: Prompt 已更新
- ✅ Language Consistency: Prompt 已更新
- ✅ res.flush() 添加: 所有 TOOL_CALL 事件后都有 flush
- ✅ sync 事件: 后端已改为发送 sync 事件
- ⏳ Loading Dot: 待重新构建并测试
- ⏳ Stop Button: 待重新构建并测试

### 遗留问题
1. 🔲 需要重新测试第二次对话的 loading 显示
2. 🔲 需要验证 stop button 是否正常出现
3. 🔲 需要确认流式输出是否真正实时（不再有 10 秒延迟）

### 工作时长
约 3 小时（问题分析 + 代码修改 + Git 准备）

---

## 2026-01-27 (周二)

### 🔐 数据库连接安全加固与 CRUD 完善
**Git Commit**: feat(e2b): Implement secure database connections with encryption, redaction, and full CRUD UI

### 主要工作
1. **数据库连接功能全闭环** ⭐⭐⭐
   - **UI 完善**: 实现了 Data Sources 的完整 CRUD（增删改查）。
   - **交互优化**: 新增编辑模式（PencilIcon），支持保留原密码修改其他字段。
   - **图标修复**: 统一使用 Lucide 的 `Trash2` 和 `Pencil` 确保兼容性。

2. **企业级安全体系构建** 🛡️
   - **静态加密 (Encryption at Rest)**: 
     - 在 Controller 层使用 AES-CBC (`encryptV2`) 加密数据库密码存入 MongoDB。
     - 读取时解密回传给前端（兼顾体验与安全）。
   - **动态解密 (Runtime Injection)**:
     - 仅在沙箱初始化或代码执行瞬间解密 (`decryptV2`) 并注入环境变量。
     - 密码在内存中短暂存在，数据库中始终加密。
   - **输出脱敏 (Output Redaction)**:
     - 拦截 Agent 执行结果的 stdout/stderr。
     - 自动检测环境变量中的敏感值（Key/Secret/Password）并替换为 `[REDACTED]`。
     - 防止用户诱导 Agent 打印环境变量导致泄露。

3. **鲁棒性增强**
   - **特殊字符处理**: 更新 System Prompt，强制要求 Python 代码中使用 `urllib.parse.quote_plus` 处理数据库密码，解决 `@` 等特殊字符导致的连接失败。
   - **回显修复**: 修复 `AssistantSelect` 白名单逻辑，解决数组类型配置 (`data_sources`) 刷新丢失的问题。

### 验证结果
- ✅ 数据库密码加密存储，无明文落地。
- ✅ Agent 无法通过 print 泄露密码。
- ✅ 包含特殊字符的复杂密码能成功连接 PostgreSQL/MySQL。
- ✅ 前端可以正常添加、修改、删除数据库连接配置。

---

## 2026-01-26 (周一)

### 🌊 流式响应体验与稳定性优化
**Git Commit**: feat(e2b): Enhance streaming UX, fix race conditions and session stability

### 主要工作
1. **Pending Tool Call 机制** (index.js) ⭐
   - **问题**: 工具执行期间前端无反馈（真空期），用户体验卡顿
   - **实现**: 
     - 在 `execute_code` 执行前立即发送 Pending 状态事件 (`progress: 0.1`)
     - 确保 `startNewTextPart` 在正确时机调用，切断前一个文本块
   - **效果**: 前端立即显示 Loading 状态，UI 响应极快

2. **强制单步执行策略** (index.js)
   - **问题**: LLM 有时会"批处理"多个工具调用，导致前端渲染出错（多个代码块粘连，解释文本错位）
   - **实现**: 
     - 在 `index.js` 中强制每次迭代只执行**第一个**工具调用
     - 忽略后续调用，迫使 LLM 在下一轮迭代中处理结果
   - **效果**: 恢复了 "Code -> Result -> Interpretation" 的清晰线性流

3. **自动继续逻辑** (index.js)
   - **问题**: LLM 在解释完某一步后，有时会直接停止 (`finish_reason: stop`)，不再继续执行下一步
   - **实现**: 
     - 检测到异常停止（任务未完成且无 `complete_task`）时
     - 自动注入用户提示 `"Please continue with the next step..."`
     - 强制循环继续
   - **效果**: 复杂的多步任务能自动推进到底，不再半途而废

4. **Prompt 增强与语言一致性** (prompts.js)
   - **格式优化**: 强制要求 Markdown 格式（标题、粗体、表格）
   - **语言约束**: 增加规则 `Language Consistency`，强制 Summary 使用用户语言（中文），解决最后总结突变英文的问题
   - **逻辑强化**: 强调 "Plan First" 和 "Error Recovery Discipline"

5. **工具输出去重** (tools.js)
   - **问题**: Summary 中图片重复显示（文中引用一次，末尾又自动附加一次）
   - **实现**: 移除 `complete_task` 中自动附加图片的逻辑
   - **效果**: 依赖 LLM 的 Markdown 引用，显示更加整洁

6. **会话稳定性修复** (.env)
   - **问题**: 用户登录后很快（1秒）被踢出
   - **原因**: `.env` 中的表达式 `1000 * 60 * 15` 被错误解析为 `1000` (1秒)
   - **修复**: 修改为纯数值 `SESSION_EXPIRY=3600000` (1小时) 和 `REFRESH_TOKEN_EXPIRY=2592000000` (30天)

### 验证结果
- ✅ **流式体验**: 丝般顺滑，状态切换清晰
- ✅ **内容顺序**: 计划 -> 代码 -> 解释，层次分明
- ✅ **任务完成度**: 自动纠错，自动继续，直至完成
- ✅ **视觉效果**: 格式美观，图片不重复
- ✅ **稳定性**: 会话持久，不再掉线

---

## 2026-01-22 (周三) - 凌晨

### 🔧 修复无工具调用时的无限循环问题
**Git Commit**: fix(e2b): Fix infinite loop when LLM returns text-only response

### 问题描述
当用户提出不需要代码执行的简单问题时（如"解释一下 R² 是什么"），LLM 返回纯文本响应（不调用工具），导致：
1. Agent 循环执行 20 次迭代（达到 `maxIterations` 上限）
2. 每次迭代 LLM 都输出相似的内容
3. 前端显示大量重复文本（50000+ 字符）
4. 无法正常停止

### 根本原因
代码缺少 **`finish_reason` 检查机制**：
- OpenAI API 返回的流式响应包含 `finish_reason` 字段：
  - `'stop'`: LLM 认为对话已完成（正常结束）
  - `'tool_calls'`: LLM 需要调用工具
  - `'length'`: 达到 token 限制
- 原代码只检查 `complete_task` 工具调用，忽略了 `finish_reason`
- 当 LLM 返回纯文本时，`finish_reason === 'stop'`，但代码仍然 `continue` 到下一次迭代

### 解决方案
**修改文件**: `api/server/services/Agents/e2bAgent/index.js`

1. **捕获 finish_reason** 🎯
   ```javascript
   let finishReason = null;
   for await (const chunk of response) {
     const choice = chunk.choices[0];
     if (choice?.finish_reason) {
       finishReason = choice.finish_reason;
     }
   }
   message.finish_reason = finishReason;
   ```

2. **智能停止逻辑** 🧠
   ```javascript
   if (!message.tool_calls || message.tool_calls.length === 0) {
     if (message.finish_reason === 'stop') {
       logger.info(`[E2BAgent] finish_reason is 'stop' - LLM completed. Exiting loop.`);
       shouldExitMainLoop = true;
       break; // 立即停止
     } else {
       // 其他 finish_reason（如 'length'）继续迭代
       logger.info(`[E2BAgent] finish_reason: ${message.finish_reason}. Continuing...`);
       continue;
     }
   }
   ```

3. **两种停止机制** ⚡
   - **主动停止**: LLM 调用 `complete_task` 工具（数据分析任务完成）
   - **自然停止**: `finish_reason === 'stop'`（简单问答完成）

### System Prompt 优化
**修改文件**: `api/server/services/Agents/e2bAgent/prompts.js`

用户根据实际使用反馈优化了 System Prompt，主要改进：
- 更清晰的工作流程指导
- 更明确的输出要求（每次代码执行后立即输出分析）
- 更完善的错误处理说明

**预期效果**:
- LLM 在每次工具调用后输出分析文本（不再只有连续代码输出）
- 改善用户体验，让分析过程更透明

### 技术细节
- **finish_reason 位置**: 在流式响应的最后一个 chunk 中
- **停止时机**: 检测到 `stop` 后立即 `break`，避免多余的 LLM 调用
- **日志增强**: 添加 `finish_reason` 到日志输出，方便调试

### 验证结果
- ✅ 简单问答（如"什么是 R²"）：LLM 回答后立即停止（1 次迭代）
- ✅ 数据分析任务（如"分析 titanic"）：正常执行工具，最后调用 `complete_task`
- ✅ 无重复文本输出
- ✅ 无性能问题（避免了 19 次无效的 LLM 调用）

### 影响范围
- **受益场景**: 所有纯文本问答（约占 20-30% 的用户查询）
- **兼容性**: 完全向后兼容，不影响现有工具调用流程
- **性能提升**: 减少无效 LLM 调用，节省 API 成本

---

## 2026-01-21 (周二) - 晚上

### ⏱️ E2B 执行时间显示功能
**Git Commit**: feat(e2b): Add execution timer display for E2B code execution

### 主要工作
1. **后端计时器实现** 🕒
   - **文件**: `api/server/services/Agents/e2bAgent/index.js`
   - **实现**:
     - 在工具执行前捕获 `startTime = Date.now()`
     - 在工具执行后计算 `elapsedTime = Date.now() - startTime`
     - 将 `startTime` 和 `elapsedTime` 添加到 `toolCallPart` 中
     - 通过 SSE 事件发送给前端
   - **调试日志**: 添加 `[E2BAgent] 🕒 Timer data sent` 验证数据发送

2. **TypeScript 类型定义** 📝
   - **文件**: 
     - `packages/data-provider/src/types/agents.ts`
     - `packages/data-provider/src/types/assistants.ts`
   - **修改**: 在 `ToolCall` 和 `PartMetadata` 接口中添加可选字段：
     ```typescript
     startTime?: number;
     elapsedTime?: number;
     ```
   - **原因**: 确保类型安全，同时保持对其他模块的兼容性（Azure Assistants 不受影响）

3. **前端计时器组件** ⏰
   - **文件**: `client/src/components/Chat/Messages/Content/Parts/ExecuteCode.tsx`
   - **实现**:
     - 添加 `startTime` 和 `elapsedTime` 作为组件 props
     - 使用 `useState` 管理当前时间显示
     - 使用 `useEffect` 实现：
       - 执行中：每 100ms 更新一次计时器（实时显示）
       - 已完成：显示固定的 `elapsedTime`
     - 添加 `formatTime` 函数：格式化为 "XXms" 或 "X.Xs"
   - **UI 位置**:
     - 初始方案：与 ProgressText 同行（导致重叠）
     - 最终方案：独立行显示在代码块和输出下方
     - 样式：`mt-0.5 mb-3` - 上边距小（靠近输出），下边距大（远离下方文字）

4. **数据流调试** 🐛
   - **问题**: 前端无输出，计时器不显示
   - **诊断流程**:
     - 后端日志确认数据发送成功
     - 前端控制台发现 LLM 直接调用 `complete_task`，跳过 `execute_code`
     - 发现测试查询太简单（"1+1", "2+2"），LLM 不执行代码
   - **解决**: 使用复杂查询测试（"分析 titanic 数据"）
   - **验证**: 控制台显示：
     ```
     [Part.tsx] toolCall object: {startTime: 1768981522584, elapsedTime: 619, ...}
     [ExecuteCode] Timer data: {startTime: 1768981522584, elapsedTime: 619, currentTime: 619}
     ```

5. **Docker 构建与部署** 🐳
   - **问题**: 修改 `.tsx` 文件后前端无变化
   - **原因**: Docker 使用生产构建模式，需重新构建镜像
   - **解决**:
     - 挂载 `client/src` 和 `packages` 目录到容器（实时更新）
     - 重新构建 Docker 镜像（`docker compose build api`）
     - 清理 Docker 缓存（释放 7GB 空间）

### 技术细节
- **计时精度**: 毫秒级（Date.now()）
- **性能影响**: 可忽略（仅添加两个时间戳字段）
- **兼容性**: 完全向后兼容（字段为可选，不影响其他模块）
- **隔离性**: 仅在 E2B execute_code 工具中使用

### 验证结果
- ✅ 后端正确发送 startTime 和 elapsedTime
- ✅ 前端正确接收并显示计时器
- ✅ 计时器位置合理，不与其他元素重叠
- ✅ 实时更新功能正常（执行中每 100ms 刷新）
- ✅ 格式化显示正确（230ms, 1.8s 等）

### 遗留任务
- 🔲 移除调试日志（生产环境）
- 🔲 可选：添加国际化支持（i18n）

---

## 2026-01-19 (周日) - 下午

### ⚡ E2B 资源配置优化与 PyTorch 支持
**Git Commit**: feat(e2b): Optimize resource limits and add PyTorch support

### 主要工作
1. **E2B 资源限制拉满（Hobby Plan）** ⭐⭐⭐
   - **需求**: 支持长时间运行的机器学习任务（模型训练、大数据处理）
   - **实现**:
     - 修改 `build.dev.ts`: 添加 `cpuCount: 8` 和 `memoryMB: 8192`
     - 修改 `initialize.js`: 移除运行时无效的资源配置（maxMemoryMB/maxCpuPercent/maxDiskMB）
     - 增加沙箱超时：从 5 分钟改为 **1 小时**（3600000ms）
   - **E2B 配置原理**:
     - CPU 和内存：在**构建模板时**设定（`Template.build()`）
     - 超时时间：在**创建 Sandbox 时**设定（`Sandbox.create()`）
     - 磁盘空间：E2B Hobby Plan 固定 10GB（无法配置）

2. **PyTorch 支持** 🔥
   - **需求**: 支持深度学习任务（模型训练、推理、model.eval()）
   - **实现**:
     - 修改 `template.ts`: 添加 `pipInstall(['torch', 'torchvision', 'torchaudio'])`
     - 重新构建模板：`npm run e2b:build:dev`
   - **安全验证兼容性**:
     - 之前已修复 `codeExecutor.js` 的 eval 检测（使用 negative lookbehind）
     - 确保 `model.eval()` 不会触发安全警告

3. **配置架构清理** 🧹
   - **问题**: defaultConfig 中定义了无法传递给 E2B SDK 的参数
   - **解决**:
     - 删除 `maxMemoryMB`, `maxCpuPercent`, `maxDiskMB`（运行时不支持）
     - 添加注释说明：CPU/内存在构建时设定
     - 简化日志输出：只显示 template 和 timeout

4. **模板构建验证** ✅
   - 模板 ID: `xed696qfsyzpaei3ulh5`（alias 固定，不会变化）
   - Build ID: 每次构建生成新的（E2B 自动使用最新 Build）
   - 构建包含：
     - PyTorch 2.5+ (CPU 版本，~2GB)
     - 原有所有包（pandas, numpy, scikit-learn, xgboost, nltk, spacy 等）
     - 新资源限制：8 vCPUs, 8GB RAM, 1 小时超时

### 验证结果
- ✅ 模板构建成功（包含 PyTorch）
- ✅ 资源配置生效（8 vCPUs, 8GB RAM）
- ✅ 超时时间增加到 1 小时
- ✅ 配置代码简化（移除无效参数）
- ✅ API 服务重启完成

### 技术细节
**E2B 资源配置层级**:
| 配置项 | 设定时机 | 配置位置 | 说明 |
|--------|---------|---------|------|
| CPU 核心数 | 模板构建时 | `build.dev.ts` | 8 vCPUs (Hobby Max) |
| 内存大小 | 模板构建时 | `build.dev.ts` | 8GB (Hobby Max) |
| 磁盘空间 | E2B 固定 | 无法配置 | 10GB (Hobby Plan) |
| 超时时间 | Sandbox 创建时 | `initialize.js` | 1 小时 (3600000ms) |

**文件修改**:
1. `e2b_template/data-analyst/build.dev.ts` (+2 行)
   - 添加 cpuCount 和 memoryMB 参数
2. `e2b_template/data-analyst/template.ts` (+1 行)
   - 添加 PyTorch 安装
3. `api/server/services/Endpoints/e2bAssistants/initialize.js` (-4 行)
   - 移除无效的资源配置，简化注释

**模板构建命令**:
```bash
cd /home/airi/LibreChat/e2b_template/data-analyst
npm run e2b:build:dev
```

### 工作时长
约 1.5 小时（需求分析 + E2B 文档研究 + 配置修改 + 模板构建）

---

## 2026-01-19 (周日)

### 🎯 智能任务完成机制
**Git Commit**: feat(e2b): Add intelligent task completion with complete_task tool

### 主要工作
1. **添加 `complete_task` 工具** ⭐⭐⭐
   - **需求**: 解决 LLM 执行多步计划时提前停止的问题
   - **问题**: 之前仅依赖"没有 tool_calls"判断任务完成，导致 LLM 执行一步后就停止
   - **实现**:
     - 新增 `complete_task` 工具（tools.js）：接受 summary 参数，返回任务完成标记
     - 添加工具定义（prompts.js）：描述何时调用该工具
     - 修改停止逻辑（index.js）：检测 `complete_task` 调用时立即停止循环
     - 更新 System Prompt：明确要求完成所有步骤后 MUST 调用 `complete_task`

2. **工作流程优化** 🔄
   - **之前的问题**:
     ```
     Iteration 1: 计划 (4步) + 执行 Step 1 → 停止 ❌
     用户手动提示 → Iteration 2: 执行 Step 2 → 停止 ❌
     ```
   - **优化后**:
     ```
     Iteration 1: 计划 + Step 1 工具调用
     Iteration 2: Step 1 解释 + Step 2 工具调用
     Iteration 3: Step 2 解释 + Step 3 工具调用
     ...
     Iteration N: 最后一步解释 + complete_task("所有步骤完成，主要发现...") ✅
     ```

3. **Prompt 优化** 📝
   - 简化 Execution Workflow 描述（从冗长的技术流程说明改为简洁规则）
   - 删除"One tool per turn"规则（不必要的限制）
   - 强调"MUST call complete_task"（使用大写 MUST）
   - 添加具体示例：`complete_task(summary="...")`
   - 明确禁止行为："do NOT just say 'will summarize', actually call the tool"

4. **停止机制改进** ⚙️
   - 从被动判断改为主动决策
   - LLM 自主决定任务何时完成
   - 系统检测到 `complete_task` 调用后立即停止
   - 避免依赖"没有 tool_calls"的模糊判断

### 验证结果
- ✅ LLM 自动执行多步计划（无需手动提示继续）
- ✅ 每步执行后立即解释，体验流畅
- ✅ 完成所有步骤后调用 `complete_task`
- ✅ 任务完成标记明确，不再提前停止

### 技术细节
**文件修改**:
1. `api/server/services/Agents/e2bAgent/tools.js` (+18 行)
   - 新增 `complete_task` 工具实现
2. `api/server/services/Agents/e2bAgent/prompts.js` (+17 行)
   - 添加工具定义和 workflow 优化
3. `api/server/services/Agents/e2bAgent/index.js` (+10 行)
   - 智能停止机制（检测 complete_task）

**停止机制对比**:
| 方式 | 判断依据 | 问题 |
|------|---------|------|
| 旧方式 | `!message.tool_calls` | LLM 解释后没调用工具就停止 |
| 新方式 | `hasCompleteTask` 检测 | LLM 主动声明完成 ✅ |

---

## 2026-01-15 (周三)

###  E2B Assistant 文件持久化功能
**Git Commit**: (待提交) - feat(e2b): Add persistent file upload support for E2B Assistants

### 主要工作
1. **E2B Assistant 侧边栏文件上传功能** ⭐⭐⭐
   - **需求**: 实现类似 Azure Assistants 的文件持久化功能
   - **实现**:
     - 修改后端文件上传路由（`files.js`）：检测 E2B assistant_id 并正确设置 endpoint
     - 修改文件处理服务（`process.js`）：E2B 特定的文件关联逻辑
     - 修改 E2B Agent（`index.js`）：从三个来源收集文件（消息附件、tool_resources、root file_ids）
     - 修改前端上传逻辑（`useFileHandling.ts`）：移除错误的 endpoint 覆盖
     - 添加文件元数据检索（`controller.js`）：populateCodeFiles 函数

2. **Bug 修复过程** 🐛
   - **问题 1**: 文件未同步到沙箱
     - 原因: E2B Agent 只读取消息附件（this.files），未读取 assistant.tool_resources
     - 修复: 修改 index.js 收集三个来源的文件并去重
   
   - **问题 2**: 文件 file_id 显示为 undefined
     - 原因: 存储策略（Local/S3/Azure）不返回 'id' 字段（只有 OpenAI 返回）
     - 解决方案: 在 process.js 中添加 E2B 特定的 fallback：`actualFileId = id || file_id`
   
   - **问题 3**: 文件在重新登录后消失
     - 原因: 前端错误地覆盖了 endpoint 为 'default'
     - 修复: 移除 useFileHandling.ts 中的 endpoint 覆盖逻辑

3. **代码审查与安全验证** 🔒
   - 分析所有修改的文件（5 个文件，~500 行）
   - 确认所有 E2B 逻辑都有条件检查（`isE2BAssistant`, `metadata.e2b_assistant_id`）
   - 验证互斥分支（if-else）保护原有逻辑
   - 风险评估: 🟢 无风险到 🟡 低风险
   - 结论: 修改已正确隔离，不影响其他 LibreChat 功能

4. **文档创建** 📝
   - 创建 `文件流逻辑.md`：详细记录两种上传模式的 16 步流程
   - 包含侧边栏助手上传（持久化）vs 聊天消息附件（临时）的对比
   - 记录 E2B Agent 文件同步机制（12 步）

### 验证结果
- ✅ 侧边栏文件上传：file_id 正确保存到数据库
- ✅ 文件关联：tool_resources.code_interpreter.file_ids 正确更新
- ✅ 文件同步：文件成功上传到沙箱 /home/user/
- ✅ Context Manager：系统提示包含文件列表和路径
- ✅ LLM 感知：AI 在执行代码前知道文件存在
- ✅ 跨会话持久化：重新登录后文件仍然存在
- ✅ 安全性：所有修改已正确隔离，不影响其他功能

### 技术细节
- **文件上传流程**:
  1. 前端发送 formData（包含 e2b_assistant_id）
  2. files.js 检测 E2B 并设置正确的 endpoint 和 metadata
  3. process.js 处理文件上传（使用 Local/S3/Azure 存储）
  4. process.js 使用 fallback 确保 file_id 存在：`actualFileId = id || file_id`
  5. process.js 更新 assistant 的 tool_resources.code_interpreter.file_ids
  6. controller.js 的 populateCodeFiles 检索文件元数据并返回前端

- **E2B Agent 文件同步**:
  1. 收集消息附件文件（this.files）
  2. 收集 assistant.tool_resources.code_interpreter.file_ids
  3. 收集 assistant.file_ids（V1 兼容）
  4. 去重并查询数据库获取文件详情
  5. 调用 syncFilesToSandbox 上传到沙箱

- **安全隔离机制**:
  1. Endpoint 级别检查：`endpoint === 'e2bAssistants'`
  2. Metadata 级别检查：`metadata.e2b_assistant_id`
  3. 互斥分支：`if (isE2BAssistant) {...} else if (...)`
  4. Fallback 安全：其他端点的存储策略返回 'id'，不受影响

### 工作时长
约 6 小时（需求分析 + 实现 + Bug 修复 + 文档 + 安全验证）

---

## 2026-01-15 (周三) - 早上

### 🚀 Azure OpenAI 集成 + System Prompt 优化
**Git Commit**: 已完成 - feat: Add Azure OpenAI support and optimize system prompt for gpt-5-mini

### 主要工作
1. **Azure OpenAI API 集成** ⭐⭐⭐
   - **需求**: 从硬编码的 OpenAI API Key 迁移到 Azure OpenAI Service
   - **实现**:
     - 修改 `initialize.js`: 检测 `OPENAI_API_KEY=user_provided` 时优先使用 Azure 配置
     - 使用部署特定的 baseURL: `${azureEndpoint}/openai/deployments/${azureDeployment}`
     - 在 OpenAI 客户端对象上附加 `azureDeployment` 属性
   - **环境变量**:
     ```env
     OPENAI_API_KEY=user_provided
     AZURE_OPENAI_ENDPOINT=https://hkubs-airi.cognitiveservices.azure.com/
     AZURE_OPENAI_API_KEY=A4J32nz2...
     AZURE_OPENAI_API_VERSION=2025-01-01-preview
     AZURE_OPENAI_DEPLOYMENT=gpt-5-mini
     ```

2. **错误修复过程** 🐛
   - **错误 1**: `azureOpenAIApiVersion is not defined`
     - 原因: ES6 property shorthand 变量名不匹配
     - 修复: 使用显式赋值 `azureOpenAIApiVersion: azureApiVersion`
   
   - **错误 2**: 401 Incorrect API key "user_pro*ided"
     - 原因: `index.js` 创建了新的 OpenAI 客户端覆盖 initialize.js 的配置
     - 修复: 删除 `index.js` 中的重复客户端创建逻辑
   
   - **错误 3**: 400 temperature does not support 0
     - 原因: Azure OpenAI gpt-5-mini 仅支持 temperature=1（默认值）
     - 修复: 在 `e2bAgent/index.js` 中检测 Azure 并跳过 temperature 参数
   
   - **错误 4**: 模型名称显示为 gpt-4o 而非 gpt-5-mini
     - 原因: `this.assistant.model` 为空，使用了默认值
     - 修复: 优先使用 `this.openai.azureDeployment`

3. **System Prompt 优化** 📝
   - **背景**: gpt-5-mini 是轻量级模型，存在重复性输出、结构化不足问题
   - **优化内容** (`prompts.js`):
     - 明确工作流程: Plan (首次) → Execute (迭代循环)
     - 强调直接调用工具，禁止先写 ```python 代码块
     - 强制使用 Markdown 语法显示图像: `![Description](path)`
     - 改进错误处理提示: 分析 traceback，自主修复，无需询问
   - **效果**: 输出更结构化，减少重复，图像显示更可靠

4. **代码清理**
   - 清理所有临时调试日志（原计划的 lines 237-240, 247 已在之前版本清理）
   - 简化 temperature 处理逻辑
   - Azure 检测机制稳定

### 验证结果
- ✅ Azure OpenAI 初始化成功（日志显示正确的 endpoint, deployment, version）
- ✅ E2B Agent 使用 gpt-5-mini 部署名称
- ✅ Temperature 参数正确省略
- ✅ Titanic 数据集分析成功（5 次工具调用，生成 1 张热力图）
- ✅ 优化后的 prompt 输出更结构化
- ✅ 图像正确显示在前端

### 文档更新
- 更新 `E2B_DATA_ANALYST_AGENT_DEVELOPMENT.md`:
  - 添加 Azure OpenAI 集成章节
  - 添加 System Prompt 优化章节
  - 更新最后更新日期和状态

### 待办事项
- ⏳ 创建 Git commit 并推送到远程仓库
- ⏳ 考虑支持前端动态选择 OpenAI / Azure OpenAI
- ⏳ 针对不同模型微调 prompt（GPT-4o vs gpt-5-mini）

---

## 2026-01-14 (周二)

### 🐛 关键 Bug 修复日
**Git Commit**: `9a854cb67` - fix: critical E2B Agent bug fixes and TOOL_CALL integration

### 主要工作
1. **错误检测逻辑严重 Bug 修复** ⭐⭐⭐
   - **问题**: JavaScript `!{}` 判断导致错误对象被误判为成功
   - **影响**: LLM 无法感知代码执行失败，陷入无限重试循环
   - **修复**: 使用显式 `hasError` boolean 变量
   - **文件**: `initialize.js`, `codeExecutor.js`, `tools.js`

2. **完整错误信息传递链**
   - 添加 `errorName` 和 `traceback` 字段
   - 从 initialize.js → codeExecutor.js → tools.js → LLM
   - LLM 现在能根据完整堆栈跟踪自动修复错误

3. **TOOL_CALL 事件系统实现** (Azure Assistant 风格)
   - 实现 Content 数组架构（TEXT 和 TOOL_CALL 交错）
   - 代码块和输出紧密显示
   - 文件: `index.js`, `controller.js`

4. **图表显示问题修复**
   - System Prompt 明确要求输出 markdown 语法
   - 移除 "automatically displayed" 误导性描述

5. **通用错误处理策略**
   - 移除特定错误类型的硬编码提示
   - 提供通用调试方法论

6. **文档重组** 📚
   - 创建 `README.md` - 文档导航
   - 创建 `E2B_TROUBLESHOOTING.md` - 故障排查手册
   - 创建 `E2B_DEVELOPMENT_GUIDE.md` - 开发指南
   - 创建 `E2B_DEPLOYMENT.md` - 部署指南
   - 创建 `CHANGELOG.md` - 版本更新日志
   - 创建 `WORK_LOG.md` - 工作日志（本文件）

### 验证结果
- ✅ 错误自动修复成功（ValueError → df.select_dtypes() 修复）
- ✅ 4 张图表生成成功
- ✅ TOOL_CALL 事件正确发送
- ✅ ExecuteCode 组件正确显示
- ⏳ 图表 markdown 显示待用户测试

### 工作时长
约 6 小时（Bug 修复 + 文档重组）

---

## 2026-01-12 (周日)

### 🚀 流式传输优化日
**Git Commits**:
- `7f49fd4f0` - chore: 添加 AI 辅助文件到 .gitignore
- `2033fa101` - feat(e2b-agent): 流式传输与用户体验全面优化
- `3b0342bfd` - fix: E2B Agent 流式传输完整修复

### 主要工作
1. **SSE 流式传输完整修复** ⭐
   - **问题诊断**: E2B 事件格式与 OpenAI Assistants 不一致
   - **修复**: 统一事件格式为 OpenAI 兼容格式
     ```javascript
     { type: 'text', index: 0, text: { value: "..." } }
     ```
   - **Compression 中间件问题**: 添加 `res.flush()` 强制刷新缓冲区
   - **效果**: 真正的实时流式体验

2. **前端事件路由优化**
   - 修改 `contentHandler` 判断逻辑
   - 移除对 `thread_id` 的依赖（E2B 不使用 OpenAI threads）

3. **技术文档**
   - 创建 `docs/E2B_STREAMING_UX_FIXES_2026-01-12.md`
   - 详细记录 SSE 流式传输的原理和修复过程

### 关键发现
- Express `compression()` 中间件会缓冲响应
- 必须显式调用 `res.flush()` 才能实现真正的流式传输
- OpenAI 使用嵌套格式 `text: { value: string }`

### 工作时长
约 4 小时

---

## 2026-01-08 (周三)

### 📝 文档重组日
**Git Commit**: `e524a56b6` - docs: 重组文档结构 - 分离架构说明和问题解决

### 主要工作
1. **文档拆分**
   - 创建 `E2B_AGENT_ARCHITECTURE.md` - 系统架构（1006行）
   - 创建 `E2B_AGENT_FIXES.md` - 问题解决（从开发文档中分离）
   - 保持 `E2B_DATA_ANALYST_AGENT_DEVELOPMENT.md` 作为开发历史记录

2. **文档组织原则**
   - 架构文档：只讲"是什么"和"为什么"
   - 修复文档：记录问题和解决方案
   - 开发文档：保留完整开发历史

### 工作时长
约 2 小时

---

## 2026-01-07 ~ 2026-01-08 (周一-周二)

### 🏗️ 核心系统完善与架构优化
**Git Commit**: `551a783bd` - feat: 核心系统完善 - Context Manager, 沙箱恢复, 迭代优化, 错误自愈

### 主要工作
1. **Context Manager 完整实现** ⭐⭐⭐
   - Single Source of Truth 统一管理会话状态
   - 内部/外部隔离（内部存储 file_id，外部暴露 clean filename）
   - 结构化上下文生成方法
   - conversationId 追踪防止混淆

2. **双层沙箱恢复系统**
   - Layer 1: 初始化恢复（从数据库恢复文件）
   - Layer 2: 执行超时恢复（自动重建沙箱）
   - 文件恢复流程完整实现

3. **迭代控制系统优化**
   - 迭代限制从 10 次提升到 20 次
   - 提前提醒机制（第 17 次迭代警告）
   - System Prompt 强化（强调提供文字说明）

4. **错误恢复策略重构**
   - 从具体到通用的转变
   - 移除特定错误类型的硬编码解决方案
   - 实现通用调试指导方法
   - 设计哲学："Teach how to debug" > "Memorize solutions"

5. **可视化路径问题修复**
   - System Prompt 明确：不要保存到 /images/
   - 只使用 `plt.show()` 或保存到 `/tmp/`
   - 系统自动持久化

6. **图片路径架构简化** ⭐
   - 移除复杂的路径替换逻辑
   - 直接在 observation 中提供最终路径
   - 解决路径双重嵌套 bug

7. **无限重试循环修复**
   - 统一 observation 格式（成功/失败都返回完整结构）
   - LLM 能正确分析失败原因

8. **工具精简**
   - 移除 `download_file` 工具（与自动持久化冗余）
   - 只保留 `execute_code` 和 `upload_file`

9. **诊断日志增强**
   - 使用 `logger.debug()` 而非 `logger.info()`
   - 详细记录工具调用和执行结果

### 详细任务清单 (已完成)
- [x] **Context Manager 完整实现**:
  - [x] Single Source of Truth 统一管理会话状态、文件、生成的工件
  - [x] 内部/外部隔离：内部存储 `file_id`（带UUID前缀），外部只暴露 clean filename
  - [x] 结构化上下文生成：`generateFilesContext`, `generateArtifactsContext`, `generateErrorRecoveryContext`
  - [x] conversationId 追踪：每个 artifact 记录所属对话
- [x] **双层沙箱恢复系统**:
  - [x] Layer 1 - 初始化恢复：检测对话中文件，从数据库提取 file_ids，调用 `syncFilesToSandbox`
  - [x] Layer 2 - 执行超时恢复：检测沙箱超时，自动重建沙箱并恢复所有文件
- [x] **迭代控制系统优化**:
  - [x] 迭代限制提升至 20 次
  - [x] 提前提醒机制（第 17 次警告）
  - [x] System Prompt 强化：每次执行后提供文字说明
- [x] **错误恢复策略重构**:
  - [x] 移除 `_generatePandasDataTypeRecovery` 硬编码
  - [x] 新增 `_generateGenericErrorGuidance` 通用调试指导
- [x] **可视化路径问题修复**:
  - [x] System Prompt 增强：禁止保存到 `/images/`
  - [x] Context Manager 动态提醒
- [x] **图片路径架构简化**:
  - [x] 移除 `replaceImagePaths`
  - [x] tools.js 直接提供正确路径
  - [x] System Prompt 指导使用 observation 中的路径
- [x] **无限重试循环修复**:
  - [x] 统一 observation 格式，失败时返回 `{ success: false, error, stderr, ... }`
- [x] **工具精简**:
  - [x] 移除 `download_file` 工具
  - [x] 修复 `initialize.js` 中的 E2B API 调用 (`.arrayBuffer()`, `.text()`)
- [x] **诊断日志增强**:
  - [x] 增加 codeExecutor, tools, index 的详细 debug 日志

### 关键决策
- **错误处理哲学**: 通用方法 > 特定解决方案
- **路径架构**: 直接路径 > 字符串替换
- **工具设计**: 简化 > 功能冗余

### 工作时长
约 10-12 小时（跨两天）

---

## 2026-01-07 (周一)

### 🔧 架构优化与关键 Bug 修复
**Git Commit**: `843c5dc0d` - feat(e2b): 架构优化与关键Bug修复

### 主要工作
1. **图片路径架构简化** (第一版)
   - 初步移除复杂路径映射
   - 实现直接路径提供

2. **无限重试循环初步修复**
   - 添加最大迭代次数限制
   - 传递 traceback 给 LLM

3. **工具精简初步探索**
   - 分析 `download_file` 工具的必要性

### 工作时长
约 5 小时

---

## 2026-01-04 (周五)

### 🎯 用户体验全面优化日
**Git Commits**:
- `2c321ff16` - feat(e2b): 修复助手配置保存、对话历史和图像显示问题
- `c73d706fc` - fix: E2B文件上传、SSE消息流和数据持久化三大关键Bug修复
- `b507caa5f` - feat(e2b): Fix frontend creation bugs, add backend routes, update docs

### 主要工作
1. **文件上传系统修复** ⭐
   - 前端编译错误修复（`useFileHandling.ts` 缺失导入）
   - 配置中间件缺失（`req.config` 未初始化）
   - 文件上传标记为 `message_file: 'true'`

2. **SSE 消息流修复**
   - 消息格式完全对齐 Agent Controller
   - 实现 `created` 事件
   - 完整的 `final` 事件结构
   - 消息持久化到数据库

3. **助手列表显示修复**
   - API 响应格式修改为 `{ data: [...] }`
   - 与 Azure Assistants 一致

4. **助手配置完整持久化**
   - Schema 扩展（添加 `append_current_datetime`, `tools`, `tool_resources`）
   - 字段映射修复（`instructions` ↔ `prompt`）
   - 默认值处理
   - 白名单更新

5. **对话历史保持**
   - 历史消息加载
   - 上下文传递给 Agent
   - 多轮对话支持
   - 沙箱复用验证

6. **图像路径替换增强**
   - 扩展路径映射（6 种常见 sandbox 路径模式）
   - 双层替换策略
   - 模式匹配增强

7. **文档更新**
   - 创建 `docs/E2B_FILE_UPLOAD_FIX.md`
   - 更新开发文档和 TODO

### 详细任务清单 (已完成)
- [x] **文件上传系统修复**:
  - [x] 前端编译错误修复
  - [x] E2B 路由添加 `configMiddleware`
  - [x] 文件上传标记为 `message_file: 'true'`
  - [x] 本地文件源配置检查
- [x] **SSE 消息流修复**:
  - [x] 消息格式对齐
  - [x] 实现 `created` 和 `final` 事件
  - [x] 消息持久化到数据库
- [x] **助手列表显示修复**:
  - [x] API 响应格式修改为 `{ data: [...] }`
- [x] **助手配置完整持久化**:
  - [x] Schema 扩展 (`append_current_datetime`, `tools`, `tool_resources`)
  - [x] 字段映射 (`instructions` ↔ `prompt`)
  - [x] `updateAssistant` 白名单更新
- [x] **对话历史保持**:
  - [x] `controller.js` 导入 `getMessages`
  - [x] 历史消息加载并转换为 OpenAI 格式
- [x] **图像路径替换增强**:
  - [x] 扩展路径映射（6种模式）
  - [x] 双层替换策略

### 已验证功能
- ✅ 助手创建和列表显示
- ✅ 所有配置字段完整保存
- ✅ 文件上传到沙箱
- ✅ 代码执行和结果返回
- ✅ 图像生成和显示
- ✅ 消息持久化
- ✅ 多轮对话
- ✅ 沙箱复用

### 工作时长
约 8 小时

---

## 2025-12-31 (周二)

### 🖥️ 前端集成与 Bug 修复
**阶段任务**: 基础设施修复与前端联调

### 主要工作
1. **基础设施修复**
   - 修复 `librechat.yaml` 验证错误 (Unrecognized key)
   - 补全后端路由 (`/tools`, `/documents`)

2. **前端构建与 UI**
   - 修复 `tsconfig.json` 和 `vite.config.ts`
   - 添加 E2B 助手图标 (Sparkles)
   - 修复助手创建时的 JSON 错误

### 详细任务清单 (已完成)
- [x] **后端Schema**: 修复 `librechat.yaml` 验证错误
- [x] **后端路由**: 补全 `/tools` 和 `/documents` 路由
- [x] **前端构建**: 修复 `tsconfig.json` 和 `vite.config.ts`
- [x] **UI图标**: 添加 E2B 助手图标支持
- [x] **助手创建**: 修复前端 `undefined is not valid JSON` 错误
- [x] **ID生成**: 统一后端生成的助手 ID 前缀为 `asst_`

---

## 2025-12-30 (周一)

### 📚 文档整理与模板优化
**Git Commits**:
- `882c5aa8f` - docs(e2b): Restore core module details in development docs
- `831e257c3` - feat(e2b): Adopt TS-based template and update tests

### 主要工作
1. **文档恢复**
   - 恢复核心模块实现细节
   - 更新开发文档

2. **模板系统迁移**
   - 采用 TypeScript 模板
   - 更新测试用例

### 工作时长
约 3 小时

---

## 2025-12-29 (周日)

### 🎨 数据分析环境完善
**Git Commits**:
- `338337c8a` - feat(e2b): Finalize comprehensive data analyst environment
- `f3c2a3781` - docs(e2b): Finalize documentation and configuration for release
- `6f9447665` - feat(e2b): Finalize comprehensive data analyst environment
- `fe537d51b` - docs(e2b): Restore core implementation details and update template guides
- `bcd349adb` - feat(e2b): Enhance data science template and persist test tools
- `cf83355db` - feat(e2b): Add custom template support and updated docs

### 主要工作
1. **完善数据分析环境**
   - 优化预装库列表
   - 调整 Dockerfile 配置

2. **自定义模板支持**
   - 实现自定义模板构建流程
   - 更新文档和配置指南

3. **测试工具持久化**
   - 保存测试工具和脚本

### 工作时长
约 6 小时

---

## 2025-12-26 (周四)

### 🚀 后端实现完成与集成测试
**Git Commits**:
- `1a66d83db` - feat(e2b): Finalize E2B backend implementation and integration tests
- `1e8d87ac4` - docs(todo): Correct task completion timeline for Dec 25-26
- `b0ec66f8b` - feat(e2b): Complete MVP of E2B Data Analyst Agent and API integration
- `ad6235e50` - fix(e2b): Export buildOptions from endpoint index
- `3d704b557` - refactor(e2b): Standardize endpoint initialization and exports
- `da2af6807` - feat(e2b): Implement API layer for E2B Assistants
- `1b6d72c04` - feat(e2b): Complete Phase 1 integrations and update docs

### 主要工作
1. **Agent 核心类实现** ⭐⭐⭐
   - `E2BDataAnalystAgent` 类（ReAct 循环）
   - `tools.js` 工具封装
   - Controller 集成

2. **API 层完整实现**
   - CRUD 控制器
   - 路由定义
   - 中间件配置
   - 系统挂载

3. **集成测试**
   - `real_integration.js` 真实环境测试
   - 验证完整流程

4. **端点标准化**
   - 标准化 `initializeClient` 导出
   - 规范化端点架构

### 详细任务清单 (已完成)
- [x] **核心服务重构与优化**:
  - [x] `fileHandler.js`: 支持多存储后端，Artifact 持久化，内存 Buffer 支持
  - [x] `codeExecutor.js`: 增强图表提取，强化安全校验
- [x] **Agent 核心类与工具**:
  - [x] 实现 `E2BDataAnalystAgent` (ReAct 循环)
  - [x] 实现 `tools.js`
  - [x] 集成至 Controller `chat` 方法
- [x] **系统初始化规范化**:
  - [x] 规范化 `initialize.js`
  - [x] 完善 `index.js` (Endpoint)
- [x] **自动化与集成测试**:
  - [x] 单元测试: `codeExecutor.test.js`, `fileHandler.test.js`
  - [x] 集成测试: `real_integration.js`
- [x] **API 层**:
  - [x] 实现 CRUD 控制器、路由、中间件挂载

### 工作时长
约 10 小时

---

## 2025-12-25 (周三)

### 🧠 Agent 逻辑起步
**Git Commits**:
- `05f26df1b` - feat(e2b): Add fileHandler tests and update task list
- `f2d7406fe` - feat(e2b): Implement E2B Sandbox services and tests

### 主要工作
1. **Prompts 实现**
   - 定义 System Prompt
   - 工具函数声明

2. **文件处理服务**
   - 实现 `fileHandler.js`
   - 支持多存储后端（Local, S3, Azure）
   - Artifact 持久化

3. **单元测试**
   - `codeExecutor.test.js`
   - `fileHandler.test.js`

### 详细任务清单 (已完成)
- [x] 实现 `prompts.js`
- [x] 实现 `fileHandler.js` 基础功能
- [x] 编写单元测试

### 工作时长
约 6 小时

---

## 2025-12-24 (周二)

### 🔌 E2B SDK 深度集成
**Git Commits**:
- `ec1eb275f` - fix(e2b): 修正E2B SDK API调用方式
- `43ff2aea5` - Phase 3.1: 优化E2B代码执行和文件操作
- `0c45d6b3e` - feat(e2b): Complete Phase 2.5 and 3 - E2B Schema enhancement and CodeEx

### 主要工作
1. **重构 `initialize.js`** ⭐
   - 适配 E2B SDK v2.8.4
   - 修正属性名（`sandboxId`）
   - 修正 API 调用方式
   - 实现 `.files` 模块操作
   - 适配嵌套日志结构
   - 实现优雅关闭逻辑

2. **重构 `codeExecutor.js`** ⭐
   - Python 代码安全校验
   - Base64 图表提取（重大突破）
   - 批量执行逻辑

3. **数据库集成**
   - 创建 E2B Assistant Schema
   - 创建 Model 和类型定义
   - 注册到系统

### 详细任务清单 (已完成)
- [x] **E2B SDK 深度集成**:
  - [x] 修正属性名 `sandboxId`
  - [x] 修正 `Sandbox.create` 传参
  - [x] 切换至 `.files` 模块
  - [x] 适配嵌套日志结构
  - [x] 实现优雅关闭逻辑
- [x] **codeExecutor.js 重构**:
  - [x] Python 代码安全分级校验
  - [x] Base64 图表自动提取
  - [x] 多代码块批量执行
- [x] **数据库与系统集成**:
  - [x] 创建 Schema, Model, Types
  - [x] 注册新模型
  - [x] 注册构建函数

### 关键突破
- 实现从 `results` 数组自动提取图表
- 支持 PNG/JPEG/SVG 多格式

### 工作时长
约 8 小时

---

## 2025-12-23 (周一)

### 🎬 项目启动与基础架构
**Git Commit**: `23d4654e1` - Initial E2B Agent documentation and planning

### 主要工作
1. **需求分析**
   - 分析 LibreChat 代码库结构
   - 理解 Azure Assistants 架构
   - 设计 E2B Agent 架构

2. **文档编写**
   - 创建 `E2B_DATA_ANALYST_AGENT_DEVELOPMENT.md`
   - 明确职责分工
   - 规划开发阶段

3. **基础设施搭建**
   - 添加 `e2bAssistants` 枚举到 Schema
   - 创建端点目录结构
   - 实现 `buildOptions.js`
   - 创建 `initialize.js` 基础架构

### 详细任务清单 (已完成)
- [x] **基础工作**:
  - [x] 分析代码库结构
  - [x] 理解 Azure Assistants 架构
  - [x] 设计 E2B Agent 架构
  - [x] 编写开发文档
- [x] **系统集成准备**:
  - [x] 补充系统集成步骤
  - [x] 补充错误处理章节
- [x] **Phase 1 - 数据库/端点**:
  - [x] 添加 `e2bAssistants` 枚举
  - [x] 创建 `buildOptions.js`
- [x] **Phase 1 - E2B客户端管理器**:
  - [x] 创建 `initialize.js`
  - [x] 实现沙箱生命周期管理方法

### 关键决策
- 使用 E2B Cloud Sandbox（而非本地 Docker）
- 采用 ReAct 循环架构
- 模块化设计（Context Manager, File Handler 等）

### 工作时长
约 4 小时

---

## 2026-02-28 (周六)

### 🐛 多项系统性 Bug 修复 + 库扩展
**Git Commit**: feat(e2b): Expand libraries, fix file recovery, sandbox expiry, and infinite loop

### 主要工作

#### 1. 库列表扩展 (prompts.js + template.ts) ⭐
- **问题**: 沙箱实际已安装 40+ 个专业库，但 system prompt 中只列了 14 个
- **修复**: 将默认库列表从 14 个扩展到 40+ 个，按类别分组：
  - 核心数据分析、高性能 DataFrame（polars/dask/modin）
  - ML 补全（catboost、imbalanced-learn、feature-engine、ydata-profiling）
  - PDF 处理（pymupdf/pymupdf4llm/pdfplumber/camelot-py）
  - Office 文档（python-docx/python-pptx/markitdown）
  - OCR（easyocr/pytesseract）
  - 地理空间、音频、高级 NLP、数据库等

#### 2. 文件类型感知代码示例 (contextManager.js + prompts.js) ⭐⭐
- **问题**: LLM 拿到文件时只知道文件名，不知道该用哪个库读取
- **修复**:
  - `contextManager.js` 的 `_generateFilesContext()` 根据后缀名动态生成对应读取代码
    - PDF → `pymupdf4llm.to_markdown()` / `camelot` / `fitz`（三种选项）
    - Word → `python-docx`；PPT → `python-pptx`；图片 → `easyocr`
    - CSV/Excel/Parquet/JSON → 对应 pandas 方法；其他格式 → `markitdown`
  - `prompts.js` 在 File Management 章节新增 "File Type Handling" 表格

#### 3. 规则强化 (prompts.js)
- **新增 Rule 7**: 严禁在文本中输出 markdown 代码块（`\`\`\`python`），所有代码必须通过 `execute_code` 工具执行
- **新增 Rule 8**: FileNotFoundError 强制恢复协议——立即 `list_files` → 文件存在则立即重试

#### 4. FileNotFoundError 自动注入 (tools.js) ⭐⭐
- **问题**: LLM 遇到 FileNotFoundError 后调用 `list_files`，但这需要额外一轮 tool call，期间 LLM 可能输出文字解释陷入循环
- **修复**: `execute_code` 内部检测到 FileNotFoundError 时，**自动执行** `os.listdir('/home/user/')` 并将结果直接注入 observation：
  - `available_files_in_sandbox`: 文件路径列表
  - `action_required`: 强制立即重试指令
- **效果**: LLM 无需额外工具调用即可看到正确文件，直接重试

#### 5. 持久化文件恢复来源扩展 (tools.js) ⭐⭐
- **问题**: 沙箱过期恢复时只看 `context.files`（当前消息附件），助手配置中的持久化文件未被恢复
- **修复**: 合并 4 个来源（Set 去重）：
  1. 当次消息附件 (`context.files`)
  2. ContextManager 已跟踪文件
  3. `assistant.tool_resources.code_interpreter.file_ids`（V2 持久化）
  4. `assistant.file_ids`（V1 持久化）
- 恢复成功后调用 `contextManager.updateUploadedFiles()` 更新状态

#### 6. 全量上传失败时自动重建沙箱 (index.js) ⭐⭐⭐
- **问题**: 沙箱过期后 `getSandbox()` 返回旧引用，`syncFilesToSandbox()` 全部失败（0 文件上传），LLM 拿到空沙箱
- **修复**: 检测"所有文件上传失败"时：
  1. 调用 `e2bClientManager.removeSandbox()` 删除本地缓存的旧引用
  2. 调用 `createSandbox()` 重建沙箱
  3. 自动重试 `syncFilesToSandbox()`

#### 7. 禁止误删持久化文件 ID (index.js) ⭐⭐⭐
- **问题**: 原有逻辑在文件同步部分失败时，会将"失败的 file_id"从数据库永久删除，导致助手配置中的持久化文件丢失
- **根本原因**: 同步失败往往是沙箱过期导致的瞬态错误，而非文件真的从 DB 删除
- **修复**: 删除清理逻辑，改为仅 `logger.warn`，不修改数据库

#### 8. 无工具调用决策优化 (index.js) ⭐⭐
- **问题**: LLM 遇到错误后输出文字解释而非重试，且无退出条件会产生无限循环
- **修复**: 新增 `lastToolFailed` / `lastToolName` 状态变量，三层决策：
  1. **硬上限**: 连续 3 次无工具调用 → 强制终止循环
  2. **失败重试**: 上一步工具失败 → 注入"立即重试"指令
  3. **正常推进**: 无失败背景 → 注入"继续下一步"指令

#### 9. removeSandbox() 方法 (initialize.js)
- 新增 `removeSandbox(userId, conversationId)` 方法，只删除本地 Map 引用，不调用 E2B kill API
- 用于沙箱已过期但本地缓存未清除的场景

#### 10. 诊断日志 + 跨用户污染防护 (controller.js)
- `getMessages()` 查询增加 `user: req.user.id` 过滤，防止跨用户数据污染
- 新增 `conversationId from frontend` 日志，便于诊断新对话是否真正无历史

#### 11. 中文回复问题排查
- **现象**: 纯英文新对话收到中文回复
- **排查结论**: 用户在任务描述末尾添加了"中文回答"四字，LLM 遵循该指令
- **深层问题**: 即使无此字，Rule 6（语言一致性规则）在 10000+ 字系统 prompt 后半部分，LLM 权重不足
- **未解决**: 待后续评估是否需要将语言规则提到系统 prompt 最前面

---

## 统计摘要

### 总工作时长
约 **92-96 小时**（分布在 2025-12-23 至 2026-02-28）

### 关键里程碑
1. **2025-12-23**: 项目启动，架构设计
2. **2025-12-24**: E2B SDK 深度集成
3. **2025-12-25**: Sandbox 服务实现
4. **2025-12-26**: Agent 核心逻辑完成，MVP 达成
5. **2025-12-29**: 数据分析环境完善
6. **2026-01-04**: 用户体验优化（文件上传、SSE、历史对话）
7. **2026-01-07**: 架构优化（路径简化、错误恢复）
8. **2026-01-08**: 核心系统完善（Context Manager、沙箱恢复）
9. **2026-01-12**: 流式传输优化
10. **2026-01-14**: 关键 Bug 修复 + 文档重组
11. **2026-01-26**: 流式体验最终优化 (Pending, Race Conditions, Stability)
12. **2026-02-28**: 库扩展 + 文件恢复 + 沙箱过期修复 + 无限循环修复

### 代码量统计
- **总代码**: ~3200+ 行（核心逻辑）
- **文档**: ~6200+ 行（开发、架构、测试、故障排查等）
- **测试**: ~500 行

### 主要技术挑战
1. ✅ E2B SDK 适配（属性名、API 调用方式）
2. ✅ 图表自动提取（Base64 处理）
3. ✅ 沙箱生命周期管理
4. ✅ 多轮对话上下文保持
5. ✅ SSE 流式传输（Compression 中间件问题）
6. ✅ 错误检测逻辑 Bug（JavaScript truthiness）
7. ✅ 图片路径架构（从复杂替换到直接路径）
8. ✅ 无限重试循环（observation 格式统一）
9. ✅ 流式响应的“真空期”与状态同步（Pending Event）
10. ✅ LLM 批处理工具调用导致的渲染错位（强制单步执行）

### 已解决的核心问题
- ✅ 错误自动恢复
- ✅ 沙箱超时恢复
- ✅ 文件持久化
- ✅ 图表生成和显示
- ✅ 多轮对话
- ✅ 实时流式响应 (Ultimate UX)
- ✅ Azure Assistant 风格输出
- ✅ 会话持久性

---

**文档版本**: 1.2  
**最后更新**: 2026-02-28  
**维护者**: @airi

**相关文档**:
- [TODO.md](TODO.md) - 任务清单
- [CHANGELOG.md](CHANGELOG.md) - 版本更新日志
- [E2B_DATA_ANALYST_AGENT_DEVELOPMENT.md](E2B_DATA_ANALYST_AGENT_DEVELOPMENT.md) - 完整开发历史

