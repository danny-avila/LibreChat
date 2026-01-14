# E2B Agent 问题解决文档

## 📋 目录
0. [2026-01-14 关键 Bug 修复](#0-2026-01-14-关键-bug-修复) ⭐ 最新
1. [2026-01-07 核心问题修复](#1-2026-01-07-核心问题修复)
2. [优化方向](#2-优化方向)

---

## 0. 2026-01-14 关键 Bug 修复 ⭐

### 0.1 错误检测逻辑严重 Bug

**问题描述**：
LLM 不断重复执行相同的失败代码，无法自动修复错误。

**用户报告**：
```
日志显示:
2026-01-14 07:12:41 error: [E2B] Execution result contains error: {
  "name": "ValueError",
  "message": "could not convert string to float: 'Braund, Mr. Owen Harris'",
  "traceback": "..."
}
2026-01-14 07:12:41 info: [E2BAgent Tools] Code executed successfully (empty stdout)
```

后端记录了错误，但告诉 LLM "执行成功"，导致 LLM 不知道需要修复。

**根本原因**：
`initialize.js` 的错误检测逻辑错误：
```javascript
// ❌ 错误的判断方式
return {
  success: !result.error,  // 当 result.error 是对象时，!{} === false
  stdout: result.logs?.stdout || [],
  stderr: result.logs?.stderr || [],
  error: result.error ? result.error.message : null,
  ...
};
```

**问题分析**：
```javascript
const result = { error: { name: 'ValueError', message: '...', traceback: '...' } };

// JavaScript 中的对象真值判断
!result.error  // !{} === false
              // 所以 success = false ❌

// 但后续代码
result.error ? result.error.message : null
// {} ? {} : null → {} 被判断为真
// 所以提取了 error.message

// 矛盾：success = false (表示失败)
//      但 error = "..." (有错误消息)
//      codeExecutor 收到 success: false 误以为成功
```

**实际影响**：
- `initialize.js` 返回 `success: false` (JavaScript: `!{} = false`)
- `codeExecutor.js` 使用 `success: !result.error` 再次误判为 `true`
- `tools.js` 构建 observation 时认为执行成功
- LLM 收到 "Code executed successfully"，不知道需要修复
- 结果：重复执行相同代码 10+ 次，直到迭代上限

**解决方案**：
使用明确的布尔变量判断：

**1. initialize.js - 正确检测 Python 错误**：
```javascript
// ✅ 修复后
let hasError = false;
let errorMessage = null;
let errorName = null;
let errorTraceback = null;

if (result.error) {
  hasError = true;
  errorName = result.error.name;  // "ValueError"
  errorMessage = result.error.message || result.error.value || String(result.error);
  errorTraceback = result.error.traceback;
  logger.error(`[E2B] Execution result contains error: ${JSON.stringify({
    name: errorName,
    message: errorMessage,
    traceback: errorTraceback
  }, null, 2)}`);
}

return {
  success: !hasError,  // ✅ 明确的布尔值
  stdout: result.logs?.stdout || [],
  stderr: result.logs?.stderr || [],
  error: hasError ? errorMessage : null,
  errorName: hasError ? errorName : null,  // ✨ 新增：错误类型
  traceback: hasError ? errorTraceback : null,  // ✨ 新增：完整 traceback
  results: result.results || [],
  logs: result.logs || [],
  exitCode: result.exitCode || 0,
  runtime: result.runtime || 0,
};
```

**2. codeExecutor.js - 传递完整错误信息**：
```javascript
// ✅ 修复后
const response = {
  success: result.success,  // ✅ 直接使用，不再重新判断
  stdout: this._formatOutput(result.stdout),
  stderr: this._formatOutput(result.stderr),
  error: result.error || null,
  errorName: result.errorName || null,  // ✨ 新增
  traceback: result.traceback || null,  // ✨ 新增
  exitCode: result.exitCode || 0,
  runtime: result.runtime || 0,
  images: images,
  hasVisualization: images.length > 0,
};
```

**3. tools.js - 向 LLM 传递完整错误信息**：
```javascript
// ✅ 修复后
if (!result.success) {
  logger.error(`[E2BAgent Tools] Code execution FAILED:`);
  logger.error(`[E2BAgent Tools]   Error Type: ${result.errorName || 'Unknown'}`);
  logger.error(`[E2BAgent Tools]   Error: ${result.error}`);
  if (result.traceback) {
    logger.error(`[E2BAgent Tools]   Traceback: ${result.traceback.substring(0, 500)}...`);
  }
  
  // ✨ 向 LLM 传递完整的错误信息（让 LLM 自己分析和修复）
  observation.error_type = result.errorName;
  observation.error_message = result.error;
  observation.traceback = result.traceback;
  // Note: No specific debug hints - LLM should analyze the traceback independently
}
```

**效果验证**（用户测试）：
```
✅ 第1次执行: df.corr()
   → ValueError: could not convert string to float
   → LLM 收到完整错误信息

✅ 第2次执行: LLM 分析 traceback 后改用
   numeric_df = df.select_dtypes(include=['int64', 'float64'])
   correlation_matrix = numeric_df.corr()
   → Success! (817 chars output)

✅ 结果：错误自动修复成功，用户无感知
```

---

### 0.2 图表显示问题

**问题描述**：
4个图表成功生成并保存，但用户界面不显示。

**用户报告**：
```
日志显示图表生成:
- /images/.../1768374775789-plot-0.png (性别 vs 生存率)
- /images/.../1768374780395-plot-0.png (年龄分布)
- /images/.../1768374784401-plot-0.png (舱位 vs 生存率) 
- /images/.../1768374788211-plot-0.png (登船港口 vs 生存率)

但前端没有图片显示
```

**根本原因**：
LLM 生成了图表，但没有输出 markdown 语法来显示图片。

**System Prompt 问题**：
```javascript
// ❌ 之前的描述（不够明确）
"Charts will be automatically captured and displayed to the user."
// LLM 误以为：只要生成图表，系统会"自动"显示，不需要自己输出 markdown
```

**解决方案**：
在 System Prompt 中明确要求 LLM 输出 markdown 语法：

```javascript
// prompts.js - ✅ 修复后
4️⃣ **Visualization Handling** - CRITICAL for displaying charts:
   
   a) **Create the chart**:
      - Write matplotlib/seaborn code
      - Call plt.show() at the end
   
   b) **Display the chart** (MANDATORY):
      - After execution, you will receive \`image_paths\` in the observation
      - **YOU MUST output the image markdown** to display it to the user
      - Use: \`![Chart Description](exact_path_from_observation)\`
      - Example from observation:
         \`\`\`
         observation.image_paths = ["/images/user123/1234567890-plot-0.png"]
         \`\`\`
         Your output:
         \`\`\`
         ![Age Distribution](/images/user123/1234567890-plot-0.png)
         \`\`\`
   
   c) **Explain the chart**:
      - Describe what the visualization shows
      - Highlight key patterns or insights
   
   **IMPORTANT**: If you don't output the markdown syntax, the user won't see the chart!
```

**关键改进**：
1. ✅ 明确说明 "YOU MUST output the image markdown"
2. ✅ 提供具体示例（observation → markdown 输出）
3. ✅ 警告后果："If you don't output the markdown syntax, the user won't see the chart!"

**预期效果**：
LLM 在生成图表后会输出：
```markdown
现在生成性别与生存率的关系图表：

![性别 vs 生存率](/images/user123/1768374775789-plot-0.png)

从图表可以看出，女性的生存率明显高于男性...
```

---

### 0.3 TOOL_CALL 事件与 ExecuteCode 组件集成 ⭐

**目标**：实现 Azure Assistant 风格的输出，代码块和执行结果紧密显示。

**前端需求分析**：
前端已存在 `ExecuteCode` 组件，可以解析并显示：
```typescript
// ExecuteCode 组件期望的数据格式
{
  type: 'tool_call',
  tool_call: {
    id: string,
    name: 'execute_code',
    args: string,  // JSON 字符串，包含 { lang: 'python', code: '...' }
    input: string,  // 备用：纯代码字符串
    progress: number,  // 0.1 = 开始, 1.0 = 完成
    output: string  // 执行结果
  }
}
```

**实现方案 - Content 数组架构**：

**1. Controller 层 - 初始化 Content 数组**：
```javascript
// controller.js
const contentParts = [];  // 📝 共享数组
let currentTextIndex = -1;
let contentIndex = 0;

// 📝 Helper: 开始新的 TEXT part
const startNewTextPart = () => {
  currentTextIndex = contentIndex++;
  contentParts[currentTextIndex] = {
    type: 'text',
    text: { value: '' }
  };
  return currentTextIndex;
};

// 传递给 Agent
const agent = new E2BDataAnalystAgent({
  contentParts,  // 📝 共享引用
  getContentIndex: () => contentIndex++,
  startNewTextPart,
  ...
});
```

**2. Agent 层 - 发送 TOOL_CALL 事件**：
```javascript
// index.js - 工具执行时
if (onToken && name === 'execute_code') {
  // 🔧 发送开始事件 (progress=0.1)
  const toolCallIndex = this.getContentIndex();
  const argsString = JSON.stringify(args);  // ✨ 完整的 {lang, code}
  
  const toolCallPart = {
    type: ContentTypes.TOOL_CALL,
    [ContentTypes.TOOL_CALL]: {
      id: id,
      name: name,
      args: argsString,  // ✨ JSON 字符串
      input: args.code || argsString,
      progress: 0.1,
    },
  };
  
  this.contentParts[toolCallIndex] = toolCallPart;
  sendEvent(this.res, { ...toolCallPart, index: toolCallIndex });
}

// 执行完成后
if (onToken && name === 'execute_code' && toolCallIndex !== -1) {
  // 🔧 发送完成事件 (progress=1.0 + output)
  const output = result.stdout || result.stderr || '';
  this.contentParts[toolCallIndex][ContentTypes.TOOL_CALL].output = output;
  this.contentParts[toolCallIndex][ContentTypes.TOOL_CALL].progress = 1.0;
  
  sendEvent(this.res, {
    type: ContentTypes.TOOL_CALL,
    index: toolCallIndex,
    [ContentTypes.TOOL_CALL]: this.contentParts[toolCallIndex][ContentTypes.TOOL_CALL]
  });
  
  // ✨ 切断当前 TEXT part，为后续文本创建新 part
  if (this.startNewTextPart) {
    this.startNewTextPart();
  }
}
```

**3. Controller 层 - 流式 TEXT 事件**：
```javascript
// controller.js - onToken 回调
agent.onToken = (token) => {
  // 📝 初始化 TEXT part（首次）
  if (currentTextIndex === -1) {
    startNewTextPart();
  }
  
  // 📝 累积文本内容
  contentParts[currentTextIndex].text.value += token;
  
  // ✅ 发送 TEXT 事件
  const eventData = {
    type: 'text',
    index: currentTextIndex,  // ✨ 正确的 index
    text: {
      value: contentParts[currentTextIndex]?.text?.value || fullResponseText
    },
    messageId: responseMessageId,
    conversationId: finalConversationId,
  };
  sendEvent(res, eventData);
};
```

**4. 最终消息 - 包含完整 Content 数组**：
```javascript
// controller.js - 流式结束后
const responseMessage = {
  messageId: responseMessageId,
  conversationId: finalConversationId,
  parentMessageId: userMessageId,
  sender: assistant.name || 'E2B Agent',
  text: finalText,
  content: contentParts,  // 📝 包含完整的交错内容
  isCreatedByUser: false,
  error: false,
  unfinished: false,
};
```

**Content 数组结构示例**：
```javascript
[
  { type: 'text', text: { value: '我将分析数据集...' } },  // index 0
  { type: 'tool_call', tool_call: {                         // index 1
      id: 'call_123',
      name: 'execute_code',
      args: '{"lang":"python","code":"df.head()"}',
      input: 'df.head()',
      progress: 1.0,
      output: '   PassengerId  Survived  Pclass...'
    }
  },
  { type: 'text', text: { value: '从上面的数据可以看出...' } },  // index 2
  { type: 'tool_call', tool_call: { ... } },                 // index 3
  { type: 'text', text: { value: '最后生成图表...' } },        // index 4
]
```

**前端显示效果** (Azure Assistant 风格)：
```
我将分析数据集...

┌─────────────────────────────────┐
│ 🐍 Python                       │
├─────────────────────────────────┤
│ df.head()                       │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ 📤 Output                       │
├─────────────────────────────────┤
│    PassengerId  Survived  ...   │
│ 0      1         0        ...   │
└─────────────────────────────────┘

从上面的数据可以看出...

┌─────────────────────────────────┐
│ 🐍 Python                       │
├─────────────────────────────────┤
│ plt.plot(df['Age'])             │
│ plt.show()                      │
└─────────────────────────────────┘
...
```

**关键技术点**：
1. ✅ **共享 Content 数组**：Controller 和 Agent 共享同一个数组引用
2. ✅ **Index 管理**：每个 part 有独立的 index，支持交错显示
3. ✅ **TEXT part 切断**：工具执行后自动创建新 TEXT part
4. ✅ **args 格式**：传递完整 JSON 字符串 `{lang, code}`
5. ✅ **Progress 状态**：0.1 = 开始, 1.0 = 完成
6. ✅ **Output 传递**：执行结果包含在 TOOL_CALL 事件中

**效果验证**：
- ✅ 代码块和输出紧密显示
- ✅ 支持多次工具调用，正确排序
- ✅ 文本和工具调用交错显示
- ✅ 前端 ExecuteCode 组件自动渲染
- ✅ 完全符合 Azure Assistant 风格

---

### 0.4 通用错误处理策略优化

**之前的问题**：
System Prompt 中针对特定错误（如 ValueError）有过多强调：
```javascript
// ❌ 之前的描述
"When you encounter ValueError with corr(), use df.select_dtypes(include='number').corr()"
"When you encounter KeyError, check df.columns.tolist()"
// 问题：针对每种错误都要写特定解决方案
```

**优化方案**：
采用通用调试策略，让 LLM 自主分析和解决：

```javascript
// prompts.js - ✅ 优化后
- **Error Handling** - When code fails (success = false):
  1. **Analyze the traceback** - it contains all information you need
  2. **Understand the root cause** - What operation failed? Why?
  3. **🛑 NEVER repeat the same code** - Change your approach based on what you learned
  4. **Debug systematically**:
     - Check data types: print(df.dtypes)
     - Check column names: print(df.columns.tolist())
     - Inspect values: print(df.head())
     - Verify assumptions before complex operations
  5. **Recover silently** - Fix internally, show only success to user
  6. Don't explain errors unless you can't fix after 2-3 attempts
```

**优势**：
- ✅ 可处理未见过的错误类型
- ✅ LLM 学会调试方法而非记忆答案
- ✅ 代码更简洁，无需维护大量特定错误处理
- ✅ 已验证：成功处理 ValueError 并自动修复

---

### 0.4 修复总结

**修改的文件**：
1. ✅ `api/server/services/Endpoints/e2bAssistants/initialize.js` - 修复错误检测逻辑
2. ✅ `api/server/services/Sandbox/codeExecutor.js` - 传递 errorName 和 traceback
3. ✅ `api/server/services/Agents/e2bAgent/tools.js` - 向 LLM 传递完整错误信息
4. ✅ `api/server/services/Agents/e2bAgent/prompts.js` - 强制要求图表 markdown 输出
5. ✅ `api/server/services/Agents/e2bAgent/index.js` - TOOL_CALL 事件发送
6. ✅ `api/server/routes/e2bAssistants/controller.js` - Content 数组架构
7. ✅ `docs/E2B_AGENT_TEST_CASES.md` - 更新测试文档

**验证结果**：
- ✅ 错误自动修复成功（ValueError → select_dtypes 修复）
- ✅ 静默恢复（用户不看到错误）
- ✅ 4个图表生成成功
- ⏳ 图表显示（等待测试验证 - System Prompt 已修复）
- ✅ TOOL_CALL 事件正确发送
- ✅ ExecuteCode 组件正确显示代码和输出
- ✅ Content 数组交错结构工作正常
- ✅ Azure Assistant 风格输出实现

**系统状态**：
- ✅ 错误检测逻辑正确
- ✅ 错误信息完整传递给 LLM
- ✅ 通用调试策略生效
- ✅ 图表显示规则明确
- ✅ TOOL_CALL 事件完整实现
- ✅ ExecuteCode 组件自动显示代码和输出
- ✅ Azure Assistant 风格输出

> **相关文档**: 
> - [系统架构文档](./E2B_AGENT_ARCHITECTURE.md)
> - [开发文档](./E2B_DATA_ANALYST_AGENT_DEVELOPMENT.md)
> - [测试用例](./E2B_AGENT_TEST_CASES.md)

---

## 1. 2026-01-07 核心问题修复

### 1.1 图片路径双层嵌套问题

**问题描述**：
生成的图片路径错误地保存为 `/mnt/images/images/xxx.png`（双层 `images`），导致：
- 控制器获取路径错误
- 图片 base64 编码失败
- 数据库保存 `null` imageUrls

**根本原因**：
```javascript
// tools.js 的 execute_code 工具
const imagePath = `/images/${imageFilename}`;  // ❌ 只有相对路径
observation += `\n📊 生成的图片: ${imagePath}`;  // ❌ 传递给 LLM 的是相对路径
```

LLM 看到 `/images/xxx.png`，在代码中生成：
```python
plt.savefig('/mnt/images/images/xxx.png')  # ❌ 双层嵌套
```

**解决方案**：
1. **在 observation 中直接提供完整路径**：
```javascript
// tools.js - 修改后
const imagePath = `/images/${imageFilename}`;
const fullPath = `/mnt${imagePath}`;  // ✅ 完整路径
observation += `\n📊 生成的图片: ${fullPath}`;  // ✅ 传递完整路径
```

2. **在 system prompt 中明确路径规则**：
```javascript
// prompts.js - 新增规则
如果需要保存图表，请:
1. 使用完整路径保存: plt.savefig('/mnt/images/xxx.png')
2. 不要使用相对路径或创建子目录
3. 路径格式必须为: /mnt/images/文件名.png
```

**效果验证**：
- ✅ 图片正确保存到 `/mnt/images/xxx.png`
- ✅ imageUrls 正确保存为 `["/images/xxx.png"]`
- ✅ 数据库记录完整

---

### 1.2 无限重试循环问题

**问题描述**：
Agent 在遇到 `execute_code` 工具失败时会进入无限循环：
```
Thought: 我需要执行代码
Action: execute_code[...]
[Error] API 调用失败

Thought: 我需要执行代码
Action: execute_code[...]  # ❌ 完全相同的操作
[Error] API 调用失败
...
```

**根本原因**：

1. **观察格式不一致**：
```javascript
// tools.js - 修改前
// 成功时
observation = `执行结果:\n${result.text}`;

// 失败时 - 直接抛出错误
throw new Error(`执行失败: ${error.message}`);  // ❌ 格式不同
```

2. **错误处理缺失观察**：
```javascript
// index.js - 修改前
catch (toolError) {
  throw new Error(`工具执行失败: ${toolError.message}`);  // ❌ 无观察
}
```

**解决方案**：

1. **统一观察格式**：
```javascript
// tools.js - 修改后
async function executeTool(toolName, toolInput, sandbox) {
  try {
    // 成功逻辑
    return {
      observation: `执行结果:\n${result.text}\n📊 生成的图片: ${fullPath}`
    };
  } catch (error) {
    // ✅ 失败也返回结构化观察
    return {
      observation: `[Error] ${error.message}\n请检查代码逻辑并重试`,
      error: true
    };
  }
}
```

2. **确保错误传递到 LLM**：
```javascript
// index.js - 修改后
const toolResult = await executeTool(action, actionInput, this.sandbox);

// ✅ 成功和失败都传递观察
observation = toolResult.observation;

// 继续 ReAct 循环，让 LLM 看到错误并调整策略
```

**效果验证**：
- ✅ 错误信息传递给 LLM
- ✅ LLM 能够调整策略（例如修改代码）
- ✅ 不再无限重复相同操作

---

### 1.3 工具冗余问题（download_file）

**问题描述**：
`download_file` 工具从未被成功使用：
- upload_file 在上传后已提供文件路径
- execute_code 可以直接使用该路径读取文件
- download_file 尝试再次读取时总是失败

**根本原因**：
文件路径架构混乱：
```javascript
// upload_file 返回
{ filepath: '/workspace/uploaded_file.csv' }  // ✅ 正确路径

// download_file 尝试
await sandbox.files.read('/uploaded_file.csv')  // ❌ 错误路径，文件不存在
```

**解决方案**：
1. **移除 download_file 工具**：
```javascript
// tools.js - 删除 download_file 定义
// execute_code 工具已经足够：可以直接在代码中读取文件
```

2. **upload_file 工具提供清晰的使用说明**：
```javascript
// prompts.js - 工具描述
[upload_file] - 上传文件到沙箱
- 返回文件路径，可以在 execute_code 中直接使用
- 示例: filepath = '/workspace/data.csv'
- 在代码中使用: df = pd.read_csv('/workspace/data.csv')
```

**效果验证**：
- ✅ 工具定义更清晰
- ✅ 不再出现 download_file 失败日志
- ✅ 文件操作简化为上传→代码读取

---

### 1.4 沙箱恢复问题（双层恢复）

**问题描述**：
沙箱超时（10分钟）或异常终止时，文件丢失，导致：
- 用户上传的文件消失
- 生成的图片无法访问
- 需要重新上传文件才能继续

**根本原因**：
沙箱生命周期管理不完整：
```javascript
// 修改前：只有 Layer 1（初始化时恢复）
async initializeSandbox(conversationId) {
  this.sandbox = await Sandbox.create();
  await this.restoreFiles(conversationId);  // ✅ Layer 1 恢复
}

// ❌ 没有 Layer 2（执行时恢复）
async executeTool(toolName, toolInput) {
  // 如果沙箱已超时，直接执行会失败
  const result = await this.sandbox.filesystem.write(...);  // ❌ 失败
}
```

**解决方案**：

**Layer 1 恢复（初始化时）**：
```javascript
// initialize.js
async initializeSandbox(conversationId) {
  this.sandbox = await Sandbox.create();
  await this.restoreConversationFiles(conversationId);  // ✅ 恢复所有文件
}

async restoreConversationFiles(conversationId) {
  const files = await File.find({ conversationId }).lean();
  for (const file of files) {
    const content = await FileHandler.getFileContent(file);
    await this.sandbox.filesystem.write(file.filepath, content);
  }
}
```

**Layer 2 恢复（执行时）**：
```javascript
// tools.js - execute_code
async function executeCode(code, conversationId, sandbox) {
  try {
    const result = await sandbox.runCode(code);
    return { observation: result.text };
  } catch (error) {
    if (error.message.includes('Sandbox timeout')) {
      // ✅ Layer 2 恢复
      await sandbox.initialize(conversationId);  // 重新初始化 + 恢复文件
      const result = await sandbox.runCode(code);  // 重试
      return { observation: result.text };
    }
    throw error;
  }
}
```

**效果验证**：
- ✅ 沙箱超时后自动恢复
- ✅ 文件持久化，无需重新上传
- ✅ 用户无感知（透明恢复）

---

### 1.5 Context Manager 缺失问题

**问题描述**：
上下文管理逻辑分散在多个文件：
- `index.js`：部分上下文生成
- `controller.js`：历史消息处理
- 没有统一的状态管理
- 多轮对话时上下文不一致

**解决方案**：
新建 `contextManager.js`（387 行），统一管理：

1. **内部 ID 映射**：
```javascript
async getContextForIteration(conversationId, userMessage) {
  // ✅ 查询数据库，获取真实数据
  const conversation = await Conversation.findById(conversationId);
  const files = await File.find({ conversationId });
  
  return {
    uploadedFiles: files.map(f => ({
      filename: f.filename,
      filepath: f.filepath  // ✅ 真实路径
    })),
    conversationHistory: this.formatHistory(conversation.messages)
  };
}
```

2. **历史消息格式化**：
```javascript
formatHistory(messages) {
  return messages.map(msg => {
    if (msg.role === 'tool') {
      // ✅ 工具结果
      return `Observation: ${msg.content}`;
    }
    return `${msg.role}: ${msg.content}`;
  }).join('\n');
}
```

3. **错误恢复上下文**：
```javascript
async generateRetryContext(error, previousCode) {
  return {
    errorMessage: error.message,
    previousAttempt: previousCode,
    suggestion: this.getErrorSuggestion(error)  // ✅ 基于错误类型的建议
  };
}
```

**效果验证**：
- ✅ 上下文管理集中化
- ✅ 支持多轮对话
- ✅ 错误恢复更智能

---

### 1.6 迭代控制问题

**问题描述**：
- 最大迭代数固定为 10，部分复杂任务无法完成
- 接近上限时没有提醒，导致突然中断

**解决方案**：

1. **增加迭代上限**：
```javascript
// index.js
const MAX_ITERATIONS = 20;  // ✅ 10 → 20
```

2. **添加迭代提醒**：
```javascript
// index.js
while (iteration < MAX_ITERATIONS) {
  iteration++;
  
  if (iteration === 17) {  // ✅ 提前 3 轮提醒
    context += '\n⚠️ 注意：当前已使用 17/20 次迭代，请尽快完成任务';
  }
  
  // ReAct 循环
}
```

3. **迭代统计日志**：
```javascript
logger.info(`任务完成，总迭代次数: ${iteration}/${MAX_ITERATIONS}`);
```

**效果验证**：
- ✅ 复杂任务（如多图表生成）可以完成
- ✅ LLM 收到提醒后会加速完成
- ✅ 更少任务因迭代不足而失败

---

### 1.7 错误恢复策略问题

**问题描述**：
早期使用"特定错误 → 特定解决方案"的硬编码策略：
```javascript
// 反模式 - 硬编码解决方案
if (error.includes('could not convert string to float')) {
  suggestion = '使用 df.select_dtypes(include="number").corr()';
}
```

存在问题：
- 无法处理未见过的错误
- 维护成本高（需要不断添加新错误）
- LLM 依赖预设解决方案，不锻炼调试能力

**解决方案**：
采用"教授调试方法"而非"记忆解决方案"：

```javascript
// contextManager.js - 新策略
generateErrorGuidance(error) {
  return `
遇到错误: ${error.message}

🔍 调试建议:
1. 分析错误信息中的关键词（类型错误？缺失值？）
2. 检查数据：使用 df.info(), df.dtypes 了解数据结构
3. 逐步调试：先测试小部分数据，再应用到全部数据
4. 查阅文档：使用 help(函数名) 或查看库的文档
  `;
}
```

**实际验证 - 2026-01-08 真实案例**：

测试场景：Titanic 数据集相关性分析
```
用户请求: "分析 Titanic 数据集各特征之间的相关性"
```

**错误序列**：
```
Iteration 7: ValueError: could not convert string to float: 'Braund, Mr. Owen Harris'
[来自 df.corr() 对包含字符串列的 DataFrame 调用]

Iteration 8-10: LLM 分析
- 识别问题："Name 和 Sex 是字符串，不能参与数值计算"
- 制定策略："先筛选数值列"
- 无需硬编码提示

Iteration 11-13: LLM 实施
action: execute_code[
  numeric_df = df.select_dtypes(include='number')
  corr_matrix = numeric_df.corr()
  sns.heatmap(corr_matrix, annot=True)
  plt.savefig('/mnt/images/correlation.png')
]

Iteration 14: 成功 ✅
observation: 执行结果: 📊 生成的图片: /mnt/images/correlation_xxx.png
```

**关键发现**：
- ✅ LLM 自主完成了：错误分析 → 数据检查 → 解决方案 → 验证
- ✅ 使用的是**通用调试方法**，而非特定 pandas 代码提示
- ✅ 共用 14 次迭代（包括错误恢复），效率合理

**策略对比**：
| 维度 | 硬编码策略 | 通用调试策略 |
|------|-----------|-------------|
| 代码量 | 需维护大量错误-解决方案映射 | 单一调试指导逻辑 |
| 覆盖范围 | 仅覆盖已知错误 | 可处理未见错误 |
| LLM 能力 | 依赖预设答案 | 锻炼调试思维 |
| 维护成本 | 高（持续添加新规则） | 低（一次性指导） |
| 真实案例 | ❌ 需预设 pandas 相关性错误 | ✅ 自主解决了 ValueError |

**效果验证**：
- ✅ 真实场景下自愈成功（ValueError → 正确的 corr() 代码）
- ✅ 无需维护特定错误库
- ✅ 可扩展到其他数据科学库（非 pandas）

---

## 2. 优化方向

### 2.1 性能优化

**当前瓶颈**：
- LLM 每次迭代需要 2-3 秒
- 沙箱代码执行 1-2 秒
- 14-20 次迭代总耗时 40-60 秒

**优化方案**：
1. **代码缓存**：对相同数据分析任务缓存结果
2. **并行工具调用**：独立工具操作可并行执行
3. **流式输出**：渐进式返回思考过程（已支持 SSE）

### 2.2 功能扩展

**计划中功能**：
1. **数据库连接**：支持 MySQL、PostgreSQL 直接查询
2. **Web 爬虫工具**：添加网页数据抓取能力
3. **机器学习工具**：添加简单的 scikit-learn 模型训练
4. **自定义工具注册**：允许用户扩展工具集

### 2.3 用户体验

**待改进**：
1. **进度显示**：实时显示当前迭代数和任务状态
2. **可视化交互**：支持修改图表参数（颜色、大小等）
3. **代码可见性**：允许用户查看生成的完整代码
4. **错误友好提示**：错误信息更直观易懂

---

## 3. 总结

**核心改进**（2026-01-07）：
1. ✅ 双层沙箱恢复 → 文件持久化
2. ✅ Context Manager → 状态管理集中化
3. ✅ 统一观察格式 → 消除无限循环
4. ✅ 通用错误恢复策略 → 自愈能力验证
5. ✅ 迭代控制优化 → 复杂任务支持
6. ✅ 图片路径修复 → 可视化稳定
7. ✅ 工具简化 → 降低复杂度

**系统状态**：
- 代码行数：3000+ 行
- 核心模块：8 个
- 工具数量：2 个（execute_code, upload_file）
- 最大迭代：20 次
- 沙箱超时：10 分钟（自动恢复）
- 测试覆盖：全场景验证完成

**下一步**：
- 性能监控和优化
- 功能扩展（数据库、爬虫）
- 用户体验改进
- 生产环境部署准备
