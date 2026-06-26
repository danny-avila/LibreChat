# Graupel Memory 修缮(Memory Fix)设计

> **日期**: 2026-06-26 ｜ **作者**: 小天 ｜ **类型**: 功能设计(MVP 功能补齐 · 阶段3 之 ②)
>
> **关联**: [MVP 路线图](../2026-06-17-mvp-roadmap.md) §5 阶段3「② Memory 修缮(普通用户可见+自动+端点)」。

---

## 1. 概述与目标

LibreChat 自带完整的「记忆」(personalization/memories)子系统,但在 Graupel 当前形态下**不生效**:记忆的注入+抽取只在 Agents 端点跑,而 Graupel 聊天走标准端点(modelSpecs on openAI/custom);且记忆侧栏被硬编码为 admin-only。本设计把记忆**接进标准聊天链路**、**对普通用户可见可管理**、**抽取模型可配**,做出 ChatGPT 式「自动记住你」体验。

**目标**: 普通用户在策展模型聊天中被自动记忆,可在侧栏面板查看/增删改自己的记忆,新会话自动注入。

## 2. 范围

**做**:
- **可见**:去掉 Memory 侧栏的 `isAdmin` 门,普通用户(默认已有全部 5 项 memory 权限)可见可用完整 CRUD 面板 + opt-out。
- **自动**(核心):把记忆的**注入(读)+ 抽取(写)**接进 `BaseClient`(标准聊天链路),薄调用 `packages/api` 现成函数。
- **端点**:`memory.agent` 配便宜抽取模型(经 gptsapi)。

**不做(YAGNI)**:
- 不接 gating(记忆对所有登录用户开放)。
- 不做"运行时改抽取模型"的 admin UI(YAML 配置即可)。
- 不动 `AgentClient` 既有记忆逻辑(agents 端点继续照常)。
- 不限制 `validKeys`(抽取通用用户事实);沿用现成 CRUD 面板,不裁剪成 ChatGPT 式只读。

## 3. 现状(已建 vs 缺口)

**已建**(实测确认,见 explore):
- 抽取后端 `packages/api/src/agents/memory.ts`(`processMemory`、`createMemoryProcessor`、`createMemoryCallback`)。
- 存储 `MemoryEntry` schema + CRUD methods(`setMemory`/`deleteMemory`/`getAllUserMemories`/`getFormattedMemories`)+ `/api/memories` 路由。
- 权限 `memoryPermissionsSchema`(USE/CREATE/UPDATE/READ/OPT_OUT),**USER 角色默认全 `true`**(`roles.ts:213`)。
- 前端 `SidePanel/Memories/`(全 CRUD:list/create/edit/delete + usage badge + opt-out)+ Personalization 设置 tab。
- 抽取模型可配:`memory.agent.{provider,model}` 或 `agent.id`。

**缺口**(本设计补齐):
1. 侧栏面板硬编码 `isAdmin &&`(`client/src/hooks/Nav/useSideNavLinks.ts:159`)→ 普通用户看不到。
2. 注入+抽取**只在 `AgentClient`**(`api/server/controllers/agents/client.js` 的 `useMemory`/`runMemory`)→ 标准端点(Graupel 用的)完全不跑。
3. `memory:` 未配置 → 功能 inert(`isMemoryEnabled(undefined)===false`)。

## 4. 后端:BaseClient 记忆 hook(核心)

`api/app/clients/BaseClient.js`(标准聊天链路,被 OpenAIClient 等继承——覆盖所有策展模型)。**薄接线**,复用 `packages/api` + `~/models`,符合 CLAUDE.md「/api 最小改动」。

### 4.1 注入(读)
- 位置:`sendMessage`(~line 409)中,`buildMessages` 产出 payload 后、`sendCompletion`(~571)前。
- 逻辑:门控通过(memory 配置启用 + 非 disabled + 用户 `MEMORIES.USE` + 未 opt-out)→ `db.getFormattedMemories({ userId })` 取 `withoutKeys` → 经 `addInstructions`(~315)把记忆作为系统指令注入 payload。
- `this.user` 是 string → `new mongoose.Types.ObjectId(this.user)`。

### 4.2 抽取(写)
- 位置:`sendCompletion` 返回后(拿到 assistant 回复)。
- 逻辑:fire-and-forget(带 ~3s 超时,仿 `AgentClient.runMemory`)→ 取最近 `messageWindowSize`(默认5)条消息 → 复用 `createMemoryProcessor`/`processMemory`(`@librechat/api`)处理 → `setMemory` 落库。仅当 `memory.agent.enabled === true`。
- 抽取失败/超时不阻塞回复(记忆是 best-effort 增强)。

### 4.3 复用与边界
- 注入/抽取核心逻辑全在 `packages/api/src/agents/memory.ts` + data-schemas memory methods;BaseClient 只接线(取配置、取 userId、调函数)。
- 抽取的 LLM 配置由 `memory.agent` 解析(provider+model+endpoint 的 apiKey/baseURL)。**复用 AgentClient 已有的配置解析路径**(`createMemoryProcessor` 接受 agent 配置);若 BaseClient 复用成本过高,退化为在 BaseClient 内按 `memory.agent` 直接构 LLMConfig(provider/model/apiKey/baseURL)。实现期取最干净的一种。

## 5. 抽取模型配置(librechat.yaml + graupel.yaml.example)

```yaml
memory:
  disabled: false
  personalize: true
  messageWindowSize: 5
  # charLimit / tokenLimit 用 schema 默认
  agent:
    enabled: true
    provider: "openAI"               # 经 .env OPENAI_REVERSE_PROXY 走 gptsapi
    model: "gemini-2.5-flash-lite"   # 便宜抽取模型
```
- ⚠️ **实现期验证**:memory agent 以 `provider:"openAI"` + `model:"gemini-2.5-flash-lite"` 是否真经 openAI 端点的 reverse-proxy 调到 gptsapi 的该模型。若不通,备选:(a) `memory.agent.id` 指向一个用 gptsapi 的 saved agent;(b) 在 `model_parameters` 里 `configuration.baseURL` override 到 gptsapi。
- 配置写入 graupel.yaml.example(committed)+ librechat.yaml(本地)。

## 6. 前端可见性

- `client/src/hooks/Nav/useSideNavLinks.ts:159`:去掉 `isAdmin &&`,改为仅凭 `hasAccessToMemories && hasAccessToReadMemories`(普通用户默认满足)。
- 结果:普通用户侧栏出现 Memory 面板(现成全 CRUD);配置了 `memory` + `personalize:true` 后,Personalization 设置 tab 的 opt-out 开关对用户可见(`OPT_OUT` 权限默认 true)。
- 全文案走现有 `useLocalize`(面板已本地化);不新增组件。

## 7. 数据模型

复用现有 `MemoryEntry`(`packages/data-schemas/src/schema/memory.ts`):`{ userId, key(^[a-z_]+$), value, tokenCount, updated_at, tenantId }`。**无 schema 改动**。

## 8. 验证(运行 app 观察)

1. 用普通(非 admin)用户登录 → 侧栏出现 Memory 面板(去 admin 门生效)。
2. 用策展模型(如默认 Gemini)聊几句含个人信息(如「我叫小天,喜欢简洁的代码」)→ 稍后 Memory 面板出现自动抽取的记忆条目(自动抽取生效)。
3. 开新会话问「我叫什么/我的偏好」→ 模型能答出(注入生效)。
4. 面板手动增/删/改一条记忆 → 生效;opt-out 开关关掉后不再注入/抽取。
5. 抽取用的是配置的便宜模型(查后端日志确认走 gemini-2.5-flash-lite,不是贵模型)。

## 9. 测试策略(Jest)

- **BaseClient hook(api)**:注入——给定已有记忆,payload 含记忆指令;门控——opt-out/无权限/未配置时不注入。抽取——sendCompletion 后触发 processMemory(spy/mock LLM),落 setMemory;失败不阻塞回复。mock 仅限外部 LLM 调用。
- **前端**:`useSideNavLinks` 普通用户(有权限、非 admin)返回的链接含 Memory 面板。
- 运行 app 端到端(§8)。

## 10. 工作量预估

- BaseClient 注入+抽取 hook + 复用接线 + 测试:~8-12h(核心,需吃透 AgentClient 记忆路径)
- memory 配置 + 抽取模型验证:~2-3h
- 前端去 admin 门 + 测试:~1-2h
- 运行 app 端到端验证:~2-3h
- **合计 ~13-20h**。
