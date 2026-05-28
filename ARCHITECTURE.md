# 技术架构

> 本仓库是 [danny-avila/LibreChat](https://github.com/danny-avila/LibreChat) 的 fork,正在向商用 SaaS **Graupel** 转型。本文档描述**当前代码现状**;Graupel 与上游的差异统一在 [§12 Graupel fork divergences](#12-graupel-fork-divergences) 列出,目标态(stage 1-5 完成)详见 [docs/superpowers/specs/](docs/superpowers/specs/)。

文档约定:
- 路径形如 [api/server/index.js](api/server/index.js) 是可点击的源码引用
- 章节编号稳定,可在 PR 描述里直接引用 `参 ARCHITECTURE.md §6.2`

---

## 1. 概览

| 维度 | 现状 |
|---|---|
| 形态 | npm workspaces monorepo + Turborepo build orchestration |
| 进程模型 | **单 Node 进程**(Express)同时承担 REST API + SSE 流式响应 + 静态托管 (`client/dist`) |
| 部署形态 | Docker Compose,5 容器:`api` / `mongodb` / `meilisearch` / `vectordb` (pgvector) / `rag_api` |
| 离线交付包 | [dist-images/graupelchat-images.tar.gz](dist-images/) — 5 镜像 + compose + .env 模板 |
| 数据库 | **MongoDB**(主存)+ **Meilisearch**(全文)+ **pgvector**(RAG)+ **Redis**(可选,session/限流/缓存) |
| LLM 集成 | OpenAI / Anthropic / Google / Bedrock 原生 SDK + 任意 OpenAI 兼容代理(Custom Endpoint) |
| Agent 引擎 | 外部依赖 [`@librechat/agents`](packages/api/package.json) v3.1.96(上游同团队仓库) |
| 包管理 | npm workspaces,锁文件单一 [package-lock.json](package-lock.json) |

---

## 2. 仓库布局

| Workspace | 语言 | 角色 | 规模(.ts/.js 入口数量级) |
|---|---|---|---|
| [api/](api/) | **JS** (CommonJS) | Express 入口、middleware、routes、controllers、薄 service | 27 路由 / 16 controllers / 31 middleware / 21+9 services |
| [client/](client/) | **TS** + React | Vite SPA(浏览器单页应用) | 28 个 components/ 子目录 |
| [packages/api/](packages/api/) | **TS** | 后端业务核心,新代码全部写在这里 | 28 个子域(`acl/`/`agents/`/`mcp/`/...) |
| [packages/data-schemas/](packages/data-schemas/) | **TS** | Mongoose schemas + 方法,可被任意 backend 项目复用 | 35+ schema |
| [packages/data-provider/](packages/data-provider/) | **TS** | **前后端共享**的 types / API endpoint 字符串 / data-service | 单根 + types/ + react-query/ |
| [packages/client/](packages/client/) | **TS** | 前端共享 UI primitives / utilities | 库,被 client/ 引用 |

依赖方向(不可逆):

```
api ─┐
     ├─► packages/api ─► packages/data-schemas ─┐
     │                                          ├─► packages/data-provider
client ─► packages/client ─────────────────────┘
```

新增 backend 代码**必须** TypeScript,放在 [packages/api/src/<domain>/](packages/api/src/);[api/](api/) 目录的 JS 老代码原则上**不动**,只在 [api/server/routes/*.js](api/server/routes/) 做薄壳路由 → 调 `packages/api` 的 service → 返响应。

---

## 3. 运行时拓扑

```
┌──────────────────────────────────────────────────────────────┐
│                        浏览器 (Vite SPA)                      │
│   client/dist/  ── React Router 6 客户端路由                  │
│   /  ──► Login / Register                                    │
│   /c/* ──► ChatRoute (主聊天界面)                             │
│   /search ──► Search                                         │
│   /share/:shareId ──► ShareRoute                             │
│   /d/* ──► Dashboard (admin/agents/prompts)                  │
└──────────────────┬───────────────────────────────────────────┘
                   │ /api/* (REST + Server-Sent Events)
                   ▼
┌──────────────────────────────────────────────────────────────┐
│           Express 5 单进程  (api/server/index.js)             │
│                                                              │
│   ① 启动顺序                                                  │
│      connectDb → indexSync(Meili) → middleware/passport      │
│      → mountRoutes → SSE/stream services → readiness OK      │
│                                                              │
│   ② 请求路径                                                  │
│      cors ─► sanitize ─► passport(JWT) ─► capability ACL     │
│           ─► route handler ─► @librechat/api service         │
│           ─► mongoose model / LLM SDK / MCP client           │
│                                                              │
│   ③ 流式响应                                                  │
│      POST /api/agents/chat[/:endpoint]                       │
│           ─► SSE stream(token-by-token)                      │
└──┬─────────────┬──────────────┬─────────────┬────────────────┘
   │             │              │             │
   ▼             ▼              ▼             ▼
MongoDB     Meilisearch       Redis        pgvector
 35+ col.   全文索引          (可选)        (RAG 容器)
                              session       embedding
                              rate-limit
                              cache
                                            ▲
                                            │ HTTP
                                            │
                                  rag_api 容器(Python)
                                  独立服务,
                                  embedding+检索

                                            ▼ (LLM 上游)
                              ┌─────────────────────────────────┐
                              │ OpenAI / Anthropic / Google /   │
                              │ Bedrock / 任意 OpenAI 兼容代理   │
                              │ (e.g. gptsapi.net / Azure)      │
                              └─────────────────────────────────┘
```

---

## 4. 技术栈

### 4.1 前端

| 层 | 技术 | 备注 |
|---|---|---|
| 构建 | **Vite 7** + TypeScript 5 | 不是 Next.js;无 SSR,纯 SPA。入口 [client/index.html](client/index.html) → [client/src/main.jsx](client/src/main.jsx) |
| 框架 | React 18 + react-dom | |
| 路由 | **react-router-dom 6** | 入口 [client/src/routes/index.tsx](client/src/routes/index.tsx),路由表见 §7.2 |
| 全局状态 | **Recoil** | UI 状态(主题、侧边栏、模型选择、当前对话) |
| 服务端缓存 | **TanStack Query v4** (`@tanstack/react-query`) | 所有 REST 数据;mutation 后用 `queryClient.invalidateQueries` 刷新 |
| UI 库 | **Radix UI** 主导 + Headless UI + Ariakit + lucide-react icons | Radix 占绝大多数(dialog/dropdown/popover/tabs/...) |
| 样式 | Tailwind 3 + tailwindcss-animate + tailwindcss-radix | |
| 表单 | react-hook-form + zod | |
| i18n | i18next 24 + react-i18next 15 | 文案在 [client/src/locales/<lang>/translation.json](client/src/locales/) |
| 编辑器 | Monaco + Sandpack | 代码块预览 + 沙箱执行 |
| Markdown | react-markdown + remark-gfm + remark-math + KaTeX | |
| SSE | `sse.js` | 流式 token 渲染,接 backend `/api/ask` 等 |
| PWA | `vite-plugin-pwa` (workbox) | offline shell + service worker |

### 4.2 后端

| 层 | 技术 | 备注 |
|---|---|---|
| HTTP | **Express 5** + cors + compression + express-static-gzip | static-gzip 直接 serve `client/dist` |
| 安全 | express-mongo-sanitize + express-rate-limit (+ rate-limit-redis) + helmet 等价手写 middleware | |
| 认证 | **passport** 多策略 | jwt / local / google / github / openid / saml / ldap / apple / discord / facebook;Graupel 计划砍到 google/github/local/magic-link |
| Session | express-session + connect-redis(可选) + jsonwebtoken (主) + bcryptjs(密码哈希) | JWT 是主流,session 仅 OAuth 回跳 |
| ORM | **mongoose 8** | schema 在 [packages/data-schemas/src/schema/](packages/data-schemas/src/schema/) |
| 全文搜索 | **meilisearch** | 启动时 `indexSync()` 同步对话/消息索引 |
| 缓存抽象 | **Keyv** 5 + keyv-file + @keyv/redis | 多后端切换:in-memory / 文件 / redis |
| LLM SDK | openai / @anthropic-ai/sdk / @google/generative-ai / @aws-sdk/client-bedrock-runtime | |
| Agent 框架 | **@librechat/agents** v3.1.96 | 上游同团队的图执行框架,支持 tool calling / 多 agent |
| 流式 | 手写 SSE(无 socket.io) | 与 frontend `sse.js` 配对 |
| 日志 | **winston** + winston-daily-rotate-file | |
| 可观测性 | **OpenTelemetry SDK**(spans for Mongo/Express/IORedis) + Prometheus(`/metrics` 端点,需 `METRICS_SECRET`) | 上游近期(stage 后期)新增 |

---

## 5. 数据层

35+ MongoDB collection,按域分组(全部 schema 在 [packages/data-schemas/src/schema/](packages/data-schemas/src/schema/)):

| 域 | 主要 collection | 关键关系 |
|---|---|---|
| **用户身份** | `user` / `session` / `token` / `pluginAuth` / `key` | user 1:N session;`pluginAuth` 存第三方 OAuth credentials |
| **会话** | `convo` / `message` / `share` / `conversationTag` / `preset` | convo 1:N message;share 是 convo 的只读快照 |
| **LLM 资源** | `agent` / `agentApiKey` / `agentCategory` / `assistant` / `action` / `prompt` / `promptGroup` | agent 是 LibreChat 自有概念(用 `@librechat/agents` 执行);assistant 是 OpenAI Assistants API 的镜像(Graupel 计划砍) |
| **工具与插件** | `skill` / `skillFile` / `toolCall` / `mcpServer` | skill = 用户自上传的代码工具;toolCall 记录执行;mcpServer 注册 MCP endpoints |
| **计费 / 配额** | `balance` / `transaction` | balance per-user,transaction 流水 |
| **权限** | `role` / `accessRole` / `aclEntry` / `group` / `systemGrant` | RBAC + 资源级 ACL,`aclEntry` 是 (subject, resource, permission) 三元组 |
| **文件 / 记忆** | `file` / `memory` | file 索引上传文件元数据;memory 是 long-term memory 条目 |
| **系统** | `banner` / `categories` / `config` | banner 顶部公告;config 持久化的运行时配置(覆盖 yaml) |

注:Graupel MVP 计划新增的 schema 见 §12,不在此表内。

---

## 6. 后端切片

### 6.1 三层结构

```
┌──────────────────────────────────────────────────────────┐
│  api/server/index.js   启动入口(JS,~150 行)              │
└──────────────────────────────────────────────────────────┘
              │  挂载顺序:metrics → cors → cookie/session
              ▼  → passport → routes → static → error
┌──────────────────────────────────────────────────────────┐
│  api/server/routes/*.js     27 路由文件(JS,薄壳)         │
│  api/server/controllers/    16 controllers (JS,薄)       │
│  api/server/middleware/     31 middleware (JS)            │
│  api/server/services/       21+9 services (JS,部分迁移)   │
└──────────────────────────────────────────────────────────┘
              │  require('@librechat/api')
              ▼
┌──────────────────────────────────────────────────────────┐
│  packages/api/src/<domain>/    28 子域(TS,业务核心)      │
│  ─ acl/admin/agents/apiKeys/app/auth/cache/cdn/cluster/  │
│    crypto/db/endpoints/files/flow/mcp/memory/middleware/  │
│    modelSpecs/oauth/prompts/skills/storage/stream/        │
│    telemetry/tools/types/utils/web/                       │
└──────────────────────────────────────────────────────────┘
              │  import schemas + methods
              ▼
┌──────────────────────────────────────────────────────────┐
│  packages/data-schemas/src/schema/<model>.ts             │
└──────────────────────────────────────────────────────────┘
```

### 6.2 关键路由聚合

入口在 [api/server/routes/index.js](api/server/routes/index.js),按功能划分:

| 类别 | 路由文件 |
|---|---|
| 认证 | `auth.js` / `oauth.js` / `keys.js` / `apiKeys.js` |
| 对话 | `convos.js` / `messages.js` / `presets.js` / `share.js` / `tags.js` / `categories.js` |
| LLM 资源 | `agents/` (子目录) / `prompts.js` / `actions.js` / `models.js` / `endpoints.js` |
| 工具 / 插件 | `skills.js` / `mcp.js` |
| 配置 / 用户 | `config.js` / `user.js` / `settings.js` / `banner.js` / `roles.js` / `accessPermissions.js` |
| 计费 | `balance.js` |
| 文件 / 搜索 | `files/`(子目录,含 `images.js`/`avatar.js`/`multer.js`)/ `search.js` |
| 内存 | `memories.js` |
| 管理 | `admin/` (子目录,role 隔离) |
| 静态 | `static.js` |

### 6.3 渐进 TS 化策略

源自 [CLAUDE.md](CLAUDE.md#workspace-boundaries):

1. **新代码必须 TypeScript** → [packages/api/src/<domain>/](packages/api/src/)
2. [api/](api/) 目录变更**最小化**,只做以下事:
   - 新增 thin route file:`api/server/routes/<name>.js` 解析 req → 调 packages/api → 返 res
   - 修旧 bug
3. DB schema 与方法只能写在 [packages/data-schemas/](packages/data-schemas/)
4. 前后端共用类型只能放 [packages/data-provider/src/types/](packages/data-provider/src/types/)
5. 不要在 [api/](api/) 引入新依赖(packages/api 已包含的就别再装一份)

---

## 7. 前端切片

### 7.1 入口与状态管理

```
client/index.html
   └─► <script src="/src/main.jsx">
       └─► createRoot(<ApiErrorBoundaryProvider><App/></ApiErrorBoundaryProvider>)
                                                    │
                                                    ▼
                                client/src/App.tsx (RecoilRoot + QueryClientProvider + ThemeProvider)
                                                    │
                                                    ▼
                                client/src/routes/index.tsx (RouterProvider + 7 routes)
```

### 7.2 路由表

来自 [client/src/routes/index.tsx](client/src/routes/index.tsx) 与 `routes/` 目录:

| Path | Component | 用途 |
|---|---|---|
| `/` | `Root` | 根容器(决定走 login 还是 chat) |
| `/login`/`/register` | `Auth/*` | 认证页 |
| `/c/:conversationId?` | `ChatRoute` | 主聊天界面 |
| `/search` | `Search` | 全文搜索结果页 |
| `/share/:shareId` | `ShareRoute` | 分享只读对话 |
| `/d/*` | `Dashboard` | 后台(agents/prompts/admin) |

### 7.3 目录约定

| 目录 | 内容 |
|---|---|
| [client/src/components/](client/src/components/) | 按功能域分组(Chat / Conversations / Auth / Agents / Skills / MCP / SidePanel / UnifiedSidebar / ...) |
| [client/src/data-provider/](client/src/data-provider/) | feature 级 React Query hooks(`<Feature>/queries.ts` 与 `mutations.ts`),通过 [packages/data-provider](packages/data-provider/) 的 data-service 发请求 |
| [client/src/hooks/](client/src/hooks/) | 通用 hooks(非 React Query) |
| [client/src/store/](client/src/store/) | Recoil atoms / selectors |
| [client/src/Providers/](client/src/Providers/) | Context Providers(主题、API 错误边界、Badge 等) |
| [client/src/locales/](client/src/locales/) | i18next 资源,**仅修改 en/translation.json**(其他语言由 locize 自动同步,Graupel fork 例外:见 §12) |
| [client/src/utils/](client/src/utils/) | 纯函数工具 |

### 7.4 数据流约定

- **所有 REST 调用**走 [packages/data-provider/src/data-service.ts](packages/data-provider/src/data-service.ts) — endpoint 字符串集中在 [api-endpoints.ts](packages/data-provider/src/api-endpoints.ts)
- **所有 queryKey/mutationKey**集中在 [packages/data-provider/src/keys.ts](packages/data-provider/src/keys.ts)
- 组件**禁止**直接 `fetch()` 或 `axios`;hooks 层全部用 React Query 包一层

---

## 8. 横切关注点

| 主题 | 实现 / 位置 |
|---|---|
| **认证** | passport jwt/local + 各 OAuth 策略 → [api/strategies/](api/strategies/);JWT 在 cookie + Authorization header 双轨;refresh token 在 [api/server/services/AuthService.js](api/server/services/AuthService.js) 等价处 |
| **RBAC + ACL** | 角色定义 [packages/data-schemas/src/schema/role.ts](packages/data-schemas/src/schema/role.ts);资源 ACL 在 [packages/data-schemas/src/schema/aclEntry.ts](packages/data-schemas/src/schema/aclEntry.ts);中间件 `capabilityContextMiddleware` 在 [api/server/middleware/](api/server/middleware/) |
| **SSE 流** | backend [packages/api/src/stream/](packages/api/src/stream/) 创建 token-by-token stream;frontend [client/src/data-provider/SSE/](client/src/data-provider/SSE/) 用 `sse.js` 接 |
| **文件管线** | 多后端 storage abstraction 在 [packages/api/src/files/](packages/api/src/files/) 与 [packages/api/src/storage/](packages/api/src/storage/);本地 / S3 / Azure Blob / Firebase / SharePoint;Graupel 计划用 R2 |
| **缓存** | Keyv 多 backend(内存 / 文件 / redis);用法分散,搜索 `from 'keyv'` 可定位 |
| **限流** | express-rate-limit + 可选 redis store,阀值在 .env |
| **配置加载** | 见 §10 |
| **错误处理** | [api/server/middleware/ErrorController](api/server/middleware/) 统一拦截;前端 `ApiErrorBoundaryProvider` |
| **可观测性** | winston 日志(daily rotate)+ OTel(Mongo/Express/IORedis spans) + Prometheus `/metrics`(需 `METRICS_SECRET`) + readiness `/health` |
| **优雅关闭** | `setupGracefulShutdown` 处理 SIGTERM/SIGINT,等流式请求结束(上游 #13211 最近添加) |

---

## 9. LLM 集成路径

LibreChat 的 LLM 接入有 5 条路径,职责清晰:

| 路径 | 用途 | 入口 |
|---|---|---|
| **Endpoints** | 直接对话(单轮 / 多轮),按 provider 选模型 | [packages/api/src/endpoints/](packages/api/src/endpoints/) + [api/server/routes/endpoints.js](api/server/routes/endpoints.js) |
| **Custom Endpoints** | 任意 OpenAI 兼容代理(librechat.yaml 里声明) | yaml `endpoints.custom`,通过 OpenAI SDK + 改 `baseURL` 实现 |
| **Tools** | 内置工具(web search / DALL-E / wolfram / ...) | [packages/api/src/tools/](packages/api/src/tools/) |
| **Agents** | 多 step + tool calling,跨多 LLM call 编排 | 依赖 `@librechat/agents`;入口 [api/server/routes/agents/](api/server/routes/agents/) |
| **MCP** | Model Context Protocol — 第三方工具 server 注入 | [packages/api/src/mcp/](packages/api/src/mcp/);schema [mcpServer.ts](packages/data-schemas/src/schema/mcpServer.ts);OAuth 支持 |
| **Skills** | 用户自上传的代码工具(类似 OpenAI Custom GPT 的 actions) | [api/server/routes/skills.js](api/server/routes/skills.js) + [packages/api/src/skills/](packages/api/src/skills/) |

支持的 endpoint 类型(`EModelEndpoint` 枚举,在 [packages/data-provider/src/schemas.ts](packages/data-provider/src/schemas.ts)):
- `openAI` / `azureOpenAI` / `anthropic` / `google` / `bedrock` / `custom` / `agents` / `assistants` / `bedrock` / `gptPlugins`(legacy)

---

## 10. 配置加载

### 10.1 三层

```
.env                         (process.env)
   │
   ▼
librechat.yaml               (YAML schema v1.3.11)
   │ 校验:packages/data-provider/src/config.ts
   ▼
MongoDB `config` collection  (运行时 admin 覆盖)
   │
   ▼
AppConfig (in-memory)        (api/server/services/Config/)
```

启动时:
1. 加载 `.env`
2. 读 [librechat.yaml](librechat.yaml)(可选,缺省走默认),按 `version` 字段对应的 zod schema 校验
3. 合并 MongoDB `config` collection 的运行时覆盖(若有)
4. 构造 `AppConfig`,缓存供整个进程使用

### 10.2 关键 .env 项(摘要)

| 类别 | 变量 |
|---|---|
| 服务 | `HOST` / `PORT` / `NODE_ENV` / `DOMAIN_CLIENT` / `DOMAIN_SERVER` |
| 加密 | `CREDS_KEY` / `CREDS_IV` / `JWT_SECRET` / `JWT_REFRESH_SECRET` |
| DB | `MONGO_URI` / `MEILI_HOST` / `MEILI_MASTER_KEY` / `RAG_API_URL` |
| LLM keys | `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_KEY` / `*_REVERSE_PROXY` |
| 认证 | `ALLOW_EMAIL_LOGIN` / `ALLOW_REGISTRATION` / `*_CLIENT_ID` / `*_CLIENT_SECRET` |
| 可观测性 | `METRICS_SECRET` / `OTEL_*` / `LOG_LEVEL` |

完整模板见 [dist-images/.env.example](dist-images/.env.example) / 上游的 `.env.example`。

---

## 11. 部署

### 11.1 Docker Compose 5 服务

| 服务 | 镜像 | 角色 | 必要性 |
|---|---|---|---|
| `api` | `graupelchat:latest`(本仓库构建) | Express + 前端 dist | 必需 |
| `mongodb` | `mongo:8.0.20` | 主数据库 | 必需 |
| `meilisearch` | `getmeili/meilisearch:v1.35.1` | 全文搜索 | 必需(搜索功能依赖) |
| `vectordb` | `pgvector/pgvector:0.8.0-pg15` | RAG 向量存储 | 仅用 RAG 时必需 |
| `rag_api` | `librechat-rag-api-dev-lite:latest` | Python embedding/检索服务 | 仅用 RAG 时必需 |

详见 [dist-images/docker-compose.yml](dist-images/docker-compose.yml) + [dist-images/README.md](dist-images/README.md)。

### 11.2 离线交付包

[dist-images/](dist-images/) 含 `graupelchat-images.tar.gz`(5 镜像合并,~1.76 GB)+ `docker-compose.yml` + `.env.example` + 部署文档。`docker load -i graupelchat-images.tar.gz` 即可在无外网服务器加载(rag_api 容器首次仍需联网拉 embedding 模型)。

### 11.3 反向代理要求(SSE)

生产前置 nginx/Caddy 必须设置:
- `proxy_buffering off`(否则 SSE 被缓冲不流式)
- `proxy_read_timeout 600s`(长回复)
- `proxy_set_header Host / X-Real-IP / X-Forwarded-For / X-Forwarded-Proto`

### 11.4 Graupel 目标部署

stage 5 launch 后(参 [stage-5-launch spec](docs/superpowers/specs/2026-05-21-graupel-stage-5-launch.md)):
- 应用层:**Hetzner** + **Coolify**(自动部署)
- DB:**MongoDB Atlas**(托管)
- CDN / WAF:**Cloudflare**
- 文件存储:**Cloudflare R2**(替代当前 local FS / S3)
- 错误监控:**Sentry**
- 产品分析:**PostHog**

---

## 12. Graupel fork divergences

> 完整设计:[docs/superpowers/specs/2026-05-21-graupel-mvp-design.md](docs/superpowers/specs/2026-05-21-graupel-mvp-design.md)

### 12.1 与上游的关键差异

| 领域 | 上游 LibreChat | Graupel 决策 |
|---|---|---|
| **品牌** | LibreChat | **Graupel**(repo 即将改名)。内部 schema/collection 名保持 LibreChat 原样以避免迁移 |
| **Endpoints (砍)** | OpenAI / Anthropic / Google / Bedrock / Vertex / Ollama / Assistants / Custom / Agents | **保留** OpenAI / Anthropic / Google / Custom / Agents;**砍** Bedrock / Vertex / Ollama / OpenAI Assistants(`EModelEndpoint` 枚举值保留以反序列化老对话,UI 入口去掉) |
| **Auth providers (砍)** | Discord / Apple / Facebook / SAML / LDAP / OpenID | **保留** Local password(UI 折叠) / Google / GitHub;**新增** Email Magic Link(参 [stage-2 spec](docs/superpowers/specs/2026-05-21-graupel-stage-2-magic-link.md)) |
| **Agents + MCP** | 默认显示 | **默认隐藏**,仅 Pro 用户可见(stage 3 plan gating) |
| **支付** | 无 | **MVP 不接 Stripe**;plan 变更通过 admin API / CLI;事件驱动 `applyPlanChange()` 是唯一入口 |
| **Quota / 配额** | balance schema | 新增 `Subscription` / `Quota` / `UsageLog`;原子 check-and-increment(单 `findOneAndUpdate`) |
| **Marketing 站** | 无 | 新增 SSG(vike)落地页 + pricing + waitlist + 法务页面(stage 4) |
| **i18n 规则** | 仅改 `en/translation.json`,其他语言由 locize 自动同步 | Graupel **同时改 `zh-Hans`**(中文用户为主,无 locize),其他语言仍走 locize |

### 12.2 新增 collection(MVP 上线时落地)

| schema | 作用 | 写入方 |
|---|---|---|
| `LoginToken` | magic-link 临时 token + 防枚举 | stage 2 |
| `Subscription` | 用户订阅状态(plan + period) | `applyPlanChange()` 唯一入口 |
| `Quota` | 配额计数器(per user × resource × period) | 路由层原子 `$inc` |
| `UsageLog` | 成本审计(per user × model × day) | 内部审计,**不暴露给用户** |
| `AuditLog` | 关键操作日志(plan 变更、权限变更) | admin 操作 |
| `WaitlistEntry` | 落地页 waitlist | marketing 端点 |
| `ContactSubmission` | 联系表单 | marketing 端点 |

### 12.3 Stage 进度表(本表是预算与里程碑,非实时状态)

| Stage | 范围 | 预算工时 | spec |
|---|---|---|---|
| **1 Fork & Rebrand** | 改名、清理品牌、部署管线就绪 | 20-30h | [stage-1](docs/superpowers/specs/2026-05-21-graupel-stage-1-fork-rebrand.md) |
| **2 Magic Link Auth** | 邮件 magic link、Resend 集成、anti-enumeration | 15-25h | [stage-2](docs/superpowers/specs/2026-05-21-graupel-stage-2-magic-link.md) |
| **3 Plan Gating** | Subscription / Quota / `applyPlanChange()` | 25-35h | [stage-3](docs/superpowers/specs/2026-05-21-graupel-stage-3-plan-gating.md) |
| **4 Marketing 站** | landing / pricing / 法务 / waitlist (vike SSG) | 20-30h | [stage-4](docs/superpowers/specs/2026-05-21-graupel-stage-4-marketing.md) |
| **5 Launch** | Sentry / PostHog / Atlas 备份 / 邀请制 beta | 15-25h | [stage-5](docs/superpowers/specs/2026-05-21-graupel-stage-5-launch.md) |
| 合计 | 105-130h(~10.5-13 周 @10h/周) |  | |

实时进度 / 检查 PR 关闭情况以仓库 issue/PR 为准,不在文档里维护(避免文档腐败)。

---

## 13. 测试架构

### 13.1 工具

- **Jest**,每个 workspace 独立运行(`cd <ws> && npx jest <pattern>`)
- **mongodb-memory-server** — 后端跑真实内存 MongoDB
- **`@modelcontextprotocol/sdk`** 真实 SDK — MCP 测试不 mock SDK 内部
- 前端用 [test/layout-test-utils](client/test/) 渲染组件(`__tests__/` 与组件同目录)

### 13.2 哲学(摘自 CLAUDE.md)

1. **真实代码优先**:能跑真依赖就别 mock(数据库、MCP、内部 service)
2. **Spy 优于 mock**:断言函数被调用 + 参数,不替换实现
3. **只 mock 不可控的边界**:外部 HTTP API、限流服务、不确定的系统调用
4. 测试覆盖 loading / success / error 三态(UI 流和数据流都是)

### 13.3 关键测试文件位置

| 域 | 位置 |
|---|---|
| Backend route + middleware | `api/server/{routes,middleware}/__tests__/*.spec.js` |
| Backend service (TS) | `packages/api/src/<domain>/*.spec.ts` |
| Schema methods | `packages/data-schemas/src/methods/*.spec.ts` |
| Frontend 组件 | `client/src/components/<area>/__tests__/*.spec.tsx` |
| Data-provider 共享 | `packages/data-provider/src/*.spec.ts` |

---

## 14. 术语 & 参考

### 14.1 项目内文档

- [CLAUDE.md](CLAUDE.md) — 工作约定 + Graupel fork context + 上游编码规范
- [docs/superpowers/specs/](docs/superpowers/specs/) — Graupel 5 阶段设计稿(MVP 设计 + 各阶段实现细节)
- [dist-images/README.md](dist-images/README.md) — 离线部署包说明

### 14.2 上游参考

- LibreChat 官方文档 https://www.librechat.ai/docs
- LibreChat 配置参考 https://www.librechat.ai/docs/configuration/librechat_yaml
- `librechat.example.yaml`(项目根)— v1.3.11 完整配置模板

### 14.3 关键术语

| 术语 | 含义 |
|---|---|
| **Endpoint** | LibreChat 中"一个 LLM provider 接入点"的统称(不是 HTTP endpoint) |
| **Custom Endpoint** | 通过 librechat.yaml 声明的 OpenAI 兼容代理 |
| **Agent** | LibreChat 自有的 multi-step + tool calling 实体,执行引擎是 `@librechat/agents` |
| **Assistant** | OpenAI Assistants API 的镜像(Graupel 计划砍) |
| **Skill** | 用户上传的代码工具,沙箱执行 |
| **MCP Server** | 通过 Model Context Protocol 暴露工具的第三方 server |
| **AppConfig** | 启动时合并 .env + yaml + DB config 后构造的运行时配置对象 |
| **applyPlanChange** | Graupel 唯一的 Subscription 写入入口(事件驱动,admin/CLI/未来 Stripe webhook 都经此函数) |
