# Graupel MVP 设计文档

> **版本**: 0.1.0
> **创建日期**: 2026-05-21
> **状态**: Draft（待用户复审）
> **作者**: 小天 + Claude（brainstorming 协作）
> **基于**: LibreChat fork

---

## 一、项目概述

### 1.1 产品定位

Graupel 是一个面向海外英语市场的多模型 AI 聚合工作台 SaaS 产品，对标 [use.ai](https://use.ai)。核心价值主张：

> **One subscription. All top AI models.**
>
> 通过单一订阅访问 GPT-5、Claude Opus 4.7、Gemini 3.1 Pro、Grok 4、DeepSeek 等顶级模型；附带文件分析、网络搜索、图像生成、语音输入输出等工作台能力。

### 1.2 目标用户

Power users、创业者、运营者、研究者——重度使用多个 AI 模型、希望在一个工作台完成研究/写作/编码/创作的高频用户。

### 1.3 商业模式

订阅制，参考 use.ai 价位（**MVP 阶段不接外部支付**，plan 通过内部 admin API 手动开通用作 invite-only beta；支付集成在 post-MVP 阶段 6 落地）：

| Plan | 价格 | 内容 |
|---|---|---|
| Free | $0 | 3 条试用消息，仅 cheap-tier 模型 |
| Trial | $1 / 7 天（post-MVP） | 全模型，配额受限 |
| Pro Monthly | $29.99 / 月（post-MVP） | 全模型 + 月度高额配额 |
| Pro Quarterly | $79.99 / 季（post-MVP） | 同上 + 折扣 |
| Pro Half-Year | $149.99 / 半年（post-MVP） | 同上 + 更大折扣 |

具体定价、配额数字在阶段 4 调研同行后最终确定。

---

## 二、已确认约束

| 维度 | 决定 | 影响 |
|---|---|---|
| 目标 | 商用 SaaS（最终订阅、收费），但 MVP 阶段先建立 Plan/配额骨架，**支付集成后置** | MVP 内部以 admin API 手动开通 plan；Stripe 等支付接入抽出为 post-MVP 阶段 6 |
| 市场 | 海外为主，英语优先 | Resend / GDPR / 邮件魔链 |
| MVP 主打 | 同质跟随 use.ai："一个订阅访问所有顶级模型" | 砍差异化功能（Deep Research、Projects、连接器市场）到 v2 |
| 承载形式 | Fork LibreChat 直接改 | 保留 upstream remote 仅 cherry-pick 关键修复，不周期 merge |
| 投入规模 | 一个人兼职，10 小时/周 | 各阶段任务切到 20-40 小时；MVP 上线时间线约 10.5-13 周（去 Stripe 后压缩，Stripe 接入推到 post-MVP 阶段 6） |
| 品牌名 | **Graupel** | 域名已购；German "soft hail" |

---

## 三、整体架构与改造原则

### 3.1 仓库与上游策略

- 在用户 GitHub 账号下 fork LibreChat 主仓库为 `graupel` 独立仓库
- 全局替换 `LibreChat`/`librechat` → `Graupel`/`graupel`（package.json `name`、README、所有引用）
- 保留 `upstream` remote 指向 LibreChat 官方
- **同步策略**：仅按需 cherry-pick 关键安全修复；不周期 merge upstream main，避免 merge hell
- 主开发分支：`main`；每个阶段一条 feature 分支，PR 回 main 后部署

### 3.2 代码边界（继承项目 CLAUDE.md）

- 新业务代码（订阅、计费、魔链、营销 backend）一律 **TypeScript**，写在 [packages/api/](../../packages/api/)
- [api/](../../api/) 仅作薄包装调进 packages/api
- 新数据模型放 [packages/data-schemas/](../../packages/data-schemas/)
- 共享类型放 [packages/data-provider/](../../packages/data-provider/)
- 前端代码在 [client/src/](../../client/src/)，新功能优先放在 feature 子目录

### 3.3 功能砍/留清单

| 模块 | 决定 | 原因 |
|---|---|---|
| OpenAI / Anthropic / Google / xAI / DeepSeek 核心 endpoint | 保留 | MVP 卖点 |
| Custom OpenAI 兼容 endpoint | 保留 | 接 Mistral / Together / 自托管 |
| Bedrock / Vertex / Ollama | **砍** | 复杂度/成本高，SaaS 用户用不到 |
| OpenAI Assistants endpoint | **砍** | 与自建 Agents 重叠且锁死 OpenAI |
| Agents + MCP | **保留但默认隐藏** | Pro plan 的 power user 卖点 |
| Web Search、文件上传/RAG、TTS/STT、Image Gen、Memory | 保留 | use.ai 同款 |
| Local 密码登录 | 保留（兜底，UI 默认隐藏） | 魔链失败时备用 |
| Google 登录 | 保留 | 海外主流 |
| 邮件魔链登录 | **新增** | 阶段 2 实现 |
| GitHub 登录 | 保留 | 开发者用户群高频使用，目标人群匹配 |
| Discord / Facebook / Apple / SAML / LDAP / OpenID | **砍** | 消费 SaaS 不需要 enterprise SSO |
| Balance / Transaction（token 计费） | 砍掉前端展示；后端 UsageLog 替代 | LibreChat 原本按 token 充值的模型与 Graupel 的 plan/配额范式不一致；阶段 3 用 UsageLog 做内部成本核算，不再向用户暴露 token 余额 |

### 3.4 计费模型

**混合模型**（避免按 token 精细收费——用户讨厌不可预测）：

- 各 plan 限制**可访问模型集合**（最重要的 gating 维度）
- 各 plan 限制**月度 messages 上限**（防滥用，不公开 token 数字）
- 各 plan 限制**高级功能开关**（Agents / Image Gen / Voice / Web Search）

**模型成本控制（用户重点关注）**：每个模型在配置里标 `costTier`（cheap / mid / expensive），各 plan 声明能访问哪些 tier。Free 用户只能用 cheap（GPT-5-mini、Claude Haiku、DeepSeek、Gemini Flash），防止亏成本。

### 3.5 部署形态

| 组件 | 选型 | 起步成本 |
|---|---|---|
| 应用编排 | Coolify（self-host PaaS） on Hetzner CCX13 | $13/月 |
| 数据库 | MongoDB Atlas | 开发期 free，上线 M10 ~$60/月 |
| 文件 / 对象存储 | Cloudflare R2（S3 兼容） | 按用量，~$0-5/月 |
| 邮件 | Resend（魔链 + 营销邮件统一） | 3000 条/月 free，超出 $20/月 |
| DNS / CDN / TLS | Cloudflare | 免费 |
| 错误监控 | Sentry | 5K events/月 free |
| 产品分析 | PostHog | 1M events/月 free |
| **总起步成本** | — | **~$15/月**（上线后约 $80-100/月） |

---

## 四、MVP 5 阶段路线图

预算锚定 105-130 小时（10 小时/周 × 10.5-13 周）。每阶段一条 feature 分支。各阶段预估见对应 stage spec：[Stage 1](./2026-05-21-graupel-stage-1-fork-rebrand.md) 25-30h、[Stage 2](./2026-05-21-graupel-stage-2-magic-link.md) 20-25h、[Stage 3](./2026-05-21-graupel-stage-3-plan-gating.md) 25-30h、[Stage 4](./2026-05-21-graupel-stage-4-marketing.md) 20-25h、[Stage 5](./2026-05-21-graupel-stage-5-launch.md) 15-20h。

### 阶段 1 — Fork + Graupel 化 + 部署管线

**目标**：一个跑在自己域名、贴着 Graupel 品牌、零 LibreChat 痕迹的可用版本。

**关键任务**：

- Fork LibreChat 到 `graupel` 仓库，保留 `upstream` remote
- 全局替换品牌字符串（package.json、README、配置默认值、UI 字符串、邮件模板）
- 替换视觉资产：logo、favicon、配色（client/public/、tailwind theme）
- 删除登录策略代码：Discord、Apple、Facebook、SAML、LDAP、OpenID（GitHub 保留）
- 删除 endpoint 代码：Bedrock、Vertex、Ollama、Assistants
- 简化 [librechat.example.yaml](../../librechat.example.yaml) → `graupel.yaml`，仅留要开放的模型
- 部署管线：
  - Coolify 部署到 Hetzner CCX13
  - Cloudflare DNS + TLS
  - Cloudflare R2 替换文件存储
  - MongoDB Atlas（开发期 free tier）
- GitHub Actions：push main → Coolify webhook → 自动部署

**交付物**：`graupel.<tld>` 在线，能注册登录（Local / Google / GitHub），可正常和 GPT/Claude/Gemini 聊天。

**验收**：

- 访问域名零 LibreChat 字样（含 robots.txt、og 图、错误页）
- push main 5 分钟内自动上线
- HTTPS 证书自动续期

**预估**：25-30 小时（2.5-3 周）。

---

### 阶段 2 — 邮件魔链登录

**目标**：用户输入邮箱 → 收链接 → 点击登录，无密码注册流程。

**关键任务**：

- 集成 [Resend](https://resend.com) SDK（魔链 + 后续营销邮件统一）
- [packages/api/](../../packages/api/) 新增 `magicLink` service：生成 token、签名、入库、发邮件
- [packages/data-schemas/](../../packages/data-schemas/) 新增 `LoginToken` schema：
  ```ts
  interface LoginToken {
    type: 'magic_link';
    user_email: string;       // normalized lowercase
    token_hash: string;       // bcrypt(token) — never store plaintext
    expires_at: Date;          // now + 15 min
    used_at: Date | null;      // single-use
    request_ip_hash: string;   // for abuse forensics
    request_ua: string;
    created_at: Date;
  }
  ```
  索引：`user_email + created_at`、`token_hash unique`、TTL on `expires_at`
- 后端路由：
  - `POST /auth/magic/request`
    - 速率限制：每邮箱 1 分钟 3 次、每 IP 1 小时 10 次（中间件层用 Redis 或 Mongo TTL）
    - 即使邮箱不存在也返回 200（防枚举）
    - 触发 Resend 发邮件，链接形如 `https://graupel.<tld>/auth/magic/verify?token=<plaintext>`
  - `GET /auth/magic/verify?token=<plaintext>`
    - 用 token 找 `LoginToken`（hash 比对）
    - 校验未过期、未使用
    - 创建 / 复用 user → 标记 token 已用 → 发 session cookie → 重定向至 `/chat`
- 前端：
  - 登录页改为单字段"输入邮箱" + 提交按钮
  - 提交后展示"check your email"卡片
  - 首次登录后弹 onboarding modal（设置展示名 + 模型偏好提示）
  - 把 Local 密码登录在 UI 上**降为兜底**入口（"sign in with password" 折叠链接）

**交付物**：邮箱魔链跑通注册 + 登录两条路径。

**验收**：

- token 15 分钟过期、单次有效
- 同邮箱 / IP 滥用请求自动 429
- 链接在不同浏览器/设备打开能正常完成登录（cookie SameSite=Lax）
- 首次和回归用户路径都正常

**预估**：20-25 小时（2-2.5 周）。

---

### 阶段 3 — Plan / 配额 / Gating 体系（**不含支付**）

**目标**：建立完整的多 plan + 模型 gating + 月度配额系统；plan 状态通过内部 admin API 管理。后续阶段 6 接 Stripe 时只需挂 webhook 触发现有 plan 切换逻辑。

**核心原则**：把 plan 切换设计成**事件驱动**——任意来源（admin API、未来的 Stripe webhook、手动脚本）都通过统一的 `applyPlanChange(userId, planCode, source, periodEnd)` 入口，确保支付集成时无需重写 gating 逻辑。

**关键任务**：

#### 3.1 Schema（去 Stripe 字段，但保留扩展点）

```ts
type PlanCode = 'free' | 'trial' | 'pro_m' | 'pro_q' | 'pro_h';
type CostTier = 'cheap' | 'mid' | 'expensive';
type SubStatus = 'active' | 'trialing' | 'expired' | 'admin_granted';

interface Plan {
  code: PlanCode;
  name: string;
  monthly_price_cents: number;      // 仅做展示和未来 Stripe 映射
  allowed_cost_tiers: CostTier[];
  monthly_message_limit: number;     // -1 = unlimited soft cap
  features: { agents: boolean; image_gen: boolean; voice: boolean; web_search: boolean };
}

interface Subscription {
  user_id: ObjectId;
  plan_code: PlanCode;
  status: SubStatus;
  source: 'admin' | 'stripe' | 'system_default';   // MVP 期只会出现 admin / system_default
  current_period_start: Date;
  current_period_end: Date;
  external_ref: string | null;       // 预留 stripe_subscription_id 等外部 ID
  granted_by: ObjectId | null;       // admin user id（追溯）
  created_at: Date;
  updated_at: Date;
}

interface Quota {
  user_id: ObjectId;
  period_start: Date;                // 用户当前订阅周期起点
  messages_used: number;
}
// 索引: Subscription { user_id, status: active }; Quota { user_id, period_start } unique
```

#### 3.2 模型成本配置

`graupel.yaml` 给每个模型加 `costTier` 字段（详细 tier 划分见 §5.1）。

#### 3.3 Plan Gating Middleware

[packages/api/](../../packages/api/) 新增 `gating` 模块：

```ts
async function checkAccess(user, model) {
  const sub = await getActiveSubscription(user.id);   // 无则返回隐式 free plan
  const plan = PLANS[sub.plan_code];

  if (!plan.allowed_cost_tiers.includes(model.costTier)) {
    throw new HttpError(402, 'UPGRADE_REQUIRED_MODEL');
  }

  if (plan.monthly_message_limit > 0) {
    const incremented = await Quota.findOneAndUpdate(
      { user_id: user.id, period_start: sub.current_period_start, messages_used: { $lt: plan.monthly_message_limit } },
      { $inc: { messages_used: 1 } },
      { new: true }
    );
    if (!incremented) throw new HttpError(402, 'UPGRADE_REQUIRED_QUOTA');
  }
}
```

⚠️ 注意 atomic check-and-increment：把上限校验和自增合并到同一个 `findOneAndUpdate`，避免 race condition。

#### 3.4 Admin API（MVP 期 plan 管理唯一入口）

[packages/api/](../../packages/api/) 新增 `admin/billing` 路由（用 admin role middleware 保护）：

- `POST /admin/users/:id/plan` — body: `{ plan_code, period_days }`，调用 `applyPlanChange()`
- `POST /admin/users/:id/quota/reset` — 手动重置当期配额
- `GET /admin/users/:id/subscription` — 查询当前 plan + 配额使用
- `GET /admin/usage?from=...&to=...` — 全局成本核算视图（按 user × model × day 聚合）

#### 3.5 用户前端

- 顶部用户菜单显示当前 plan 名称 + 配额进度条
- 模型选择器对不可用模型显示锁标 + tooltip "Available on Pro"（不抛错而是禁用，体验更好）
- 超限时弹窗：'You've reached your plan's limit.' + 文案"Contact us for early access"（MVP 期没有自助升级，用 mailto: 兜底）

#### 3.6 成本审计

新增 `UsageLog` collection（按 user_id × model_id × day 聚合 token 数）：

- 后端在每次模型调用结束后异步 upsert（不阻塞响应）
- 仅供内部成本核算 + 异常检测（单用户单日 token 暴涨 → 告警）
- 不暴露给用户

**交付物**：

- 完整 Plan/Subscription/Quota schema
- Plan gating middleware 接入所有模型调用入口
- Admin API 能开通/取消/重置 plan
- 前端 plan 状态条 + 锁定模型 UI
- UsageLog 后端记录

**验收**：

- 通过 admin API 给 user 开通 pro_m → 该用户立即能用 expensive tier 模型
- 通过 admin API 把 user 切回 free → 立即生效，下一次请求 expensive 模型返回 402
- 月度配额并发测试（10 个并发请求只有恰好 limit 数能成功）
- UsageLog 数据完整（24 小时内的所有调用都有记录）
- `applyPlanChange()` 是唯一变更入口（grep 全局调用源，仅 admin API + system bootstrap）

**预估**：25-30 小时（2.5-3 周）。

**详细 spec**: [2026-05-21-graupel-stage-3-plan-gating.md](./2026-05-21-graupel-stage-3-plan-gating.md)

---

### 阶段 4 — 营销页 + 法务页面

**目标**：从 Google 搜到落地页，用户 5 秒内理解卖点，10 秒内点击订阅。

**关键任务**：

- 技术选型：复用现有 [client/](../../client/) 的 Vite SPA，加 marketing routes，不引入 Next.js
  - 用 [vite-plugin-ssr](https://vite-plugin-ssr.com/)（现已改名为 vike）或 [react-snap](https://github.com/stereobooster/react-snap) 做静态预渲染，让 SEO 抓取
- 核心页面：
  - `/` Landing：hero（"Your AI Workspace, one subscription, all top models"）、模型 logo wall、4 大特性卡（Multi-LLM / Web Search / File Analysis / Voice）、CTA 主按钮**指向 waitlist 而非订阅**（MVP 期未开放支付）、placeholder testimonials
  - `/pricing` Plan 卡片（标"coming soon"或"join waitlist for early access"）+ FAQ（参考但不照抄 use.ai FAQ；从我们抓到的 i18n 文案能看到 use.ai 用的话术）
  - `/terms`、`/privacy`：从 [iubenda](https://www.iubenda.com/) / [Termly](https://termly.io/) 生成基础版本，再针对 AI/数据保留条款人工微调
  - `/cancellation` Cancellation Hub 占位（**post-MVP 阶段 6 接 Stripe 时**按 Stripe 政策 + FTC 要求补全；MVP 期可暂不上线此页）
  - `/contact` 简单邮件表单（提交到 Resend）
- Waitlist：landing 主 CTA 即 "join waitlist"，MVP 期是核心导流入口；waitlist 用户由 admin 手动批量发邀请并开通 plan
- SEO 基础：sitemap.xml、robots.txt、og 图（4 张：landing/pricing/about/share-default）

**交付物**：4 个核心页面 + 法务 + waitlist。

**验收**：

- Lighthouse SEO ≥ 90，Accessibility ≥ 90
- og:image 在 Twitter / LinkedIn 分享预览正常
- waitlist 提交能进 Resend audience

**预估**：20-25 小时（2-2.5 周）。

---

### 阶段 5 — 上线、监控、漏斗

**目标**：可观测、可追踪、可挽回流失。

**关键任务**：

- Sentry：前后端错误聚合（dsn 走环境变量）
- PostHog：MVP 期漏斗按 **waitlist → invite → 激活 → 留存** 设计（付费节点延后到阶段 6）；关键事件埋点：
  - `waitlist_joined`（email_hash, source, referrer）
  - `invite_sent` / `invite_activated`（admin 操作 + 用户首次登录）
  - `model_used`（model_id, plan_code, latency_ms）
  - `quota_exceeded`（user_id, plan_code, limit_type）
  - `plan_changed`（user_id, from_plan, to_plan, source）— 由 `applyPlanChange()` 统一发出
  - 阶段 6 接 Stripe 后再补 `subscription_started` / `subscription_canceled` / `trial_converted`
- 备份策略：MongoDB Atlas 自带快照 + 每日 mongodump 到 R2 + 每周一恢复演练（自动）
- 邮件营销自动化（Resend）：
  - 欢迎邮件（首次登录后立即）
  - Waitlist 进入确认邮件
  - Invite 发出邮件（admin 手动批量触发，含登录链接）
  - 流失挽回（连续 7 天未活跃）
  - 阶段 6 接 Stripe 后再补 trial 提醒、转化、取消挽回三套
- Status page（[Better Stack](https://betterstack.com/status-pages) 或 [Cronitor](https://cronitor.io/) free tier）
- 软上线：Indie Hackers / Product Hunt / Hacker News Show HN 准备（着重讲 waitlist 故事 + 早期 beta 邀请）

**交付物**：可观测的生产环境 + 邮件漏斗 + 第一批种子流量入口。

**验收**：

- 任意接口 500 错误 1 分钟内 Sentry 告警邮件
- PostHog 能看到完整漏斗转化率
- 备份恢复演练成功
- 收到第一批真实用户的注册邮件

**预估**：15-20 小时（1.5-2 周）。

---

## 五、关键技术要点

### 5.1 模型成本控制：cost tier 设计

```yaml
# graupel.yaml 模型 cost tier 划分（依据 OpenAI/Anthropic/Google/xAI 当前定价）
costTiers:
  cheap:        # < $1 / 1M output tokens
    - gpt-5-nano, gpt-5-mini
    - claude-haiku-4-5
    - gemini-2.5-flash, gemini-3-flash
    - deepseek-v4-flash
    - grok-3-mini
  mid:          # $1-10 / 1M output tokens
    - gpt-5
    - claude-sonnet-4-6
    - gemini-3-pro
    - deepseek-v4-pro
  expensive:    # > $10 / 1M output tokens
    - claude-opus-4-7, claude-opus-4-6
    - gpt-5-5, gpt-5-4
    - grok-4
```

各 plan 允许的 tier：

| Plan | cheap | mid | expensive |
|---|---|---|---|
| free | ✓（仅 3 条） | ✗ | ✗ |
| trial | ✓ | ✓ | ✓（有配额） |
| pro_m / pro_q / pro_h | ✓ | ✓ | ✓ |

### 5.2 Webhook idempotency（post-MVP 阶段 6）

延后到接 Stripe 时实现。设计预留：所有外部 webhook 在处理前先查 `ProcessedWebhook` collection，已处理过的 `event.id` 直接返回 200；ProcessedWebhook 加 `created_at` TTL 索引（30 天后自动清理）。MVP 期 plan 切换走 admin API（非幂等敏感场景），不需要这一层。

### 5.3 Quota 原子性

`messages_used` 必须用 `findOneAndUpdate` + `$inc` 原子操作，避免并发请求时计数丢失。当 `messages_used >= limit` 时拒绝调用；不要先读再写再校验（race condition）。

### 5.4 成本审计

后端按 (user_id, model_id, day) 记录 token 用量到独立 `UsageLog` collection，不暴露给前端，仅供：

- 内部成本核算
- 异常用户检测（某用户单日 token 暴涨）
- 模型 cost tier 重新分类的决策依据

### 5.5 魔链安全

- Token 用 `crypto.randomBytes(32).toString('base64url')` 生成
- 数据库只存 bcrypt hash，明文仅存在邮件链接里
- TTL 15 分钟 + 单次使用
- 每邮箱 1 分钟最多 3 次请求；每 IP 1 小时最多 10 次
- 邮箱不存在也返回 200（防枚举）

---

## 六、风险与未决项

| 风险 | 影响 | 缓解 |
|---|---|---|
| 模型供应商 ToU 限制 | 阻塞性 | 阶段 1 前确认 OpenAI / Anthropic / Google ToU 是否允许"AI Workspace"形式的二次打包；若不允许，需走 BYOK 模式（用户提供自己的 API key） |
| MVP 上线时无支付通道，无法验证付费意愿 | 中 | MVP 走 invite-only beta + waitlist，用 admin API 手动开 plan；通过用户访谈、留存、活跃度间接验证付费意愿，避免在没有付费数据的情况下乐观估计 |
| 法人实体（post-MVP 阶段 6 才阻塞） | 中 | 接 Stripe 之前完成 Stripe Atlas 注册（Delaware C corp，~$500），或考虑香港/新加坡公司；MVP 阶段无此阻塞 |
| 模型成本失控 | 严重 | 阶段 3 落地 cost tier gating；同时给每用户配 `daily_token_hard_cap`（即使在 plan 内）；MVP 期靠 admin 手动控发邀请数量兜底 |
| GDPR 数据保留 | 中 | 阶段 4 法务页明确数据保留策略（建议：对话默认 30 天，用户可手动延长/导出/删除） |
| LibreChat upstream 出现重大功能但与我们改动冲突 | 低 | 仅 cherry-pick 安全修复；其他更新除非必要不合并 |
| 投入预算超支（10 小时/周不够） | 中 | 阶段 3 复杂度最高，可考虑切成 3a（schema + admin API）/ 3b（gating middleware + 前端）降低单阶段压力 |
| 域名 / 品牌发音问题 | 低 | 营销文案标注 "[ˈɡraʊpəl]"；考虑域名备选（如果 graupel.com 已被占用） |

---

## 七、度量指标 & 成功标准

### 7.1 阶段验收（已在每阶段列出，此处汇总）

| 阶段 | 关键指标 |
|---|---|
| 1 | 域名上线、零品牌泄漏、CI/CD 通畅 |
| 2 | 魔链转化率 > 80%（请求 → 完成登录） |
| 3 | Plan gating 测试用例 100% 通过；admin API 切换 plan 即时生效；并发配额测试无超发 |
| 4 | Lighthouse SEO/A11y ≥ 90 |
| 5 | 监控覆盖率（错误捕获 + 漏斗埋点） |

### 7.2 MVP（invite-only beta）30 天目标

MVP 不接支付，因此用**留存与活跃度**而非付费转化作为验证信号；付费指标延后到阶段 6（Stripe 接入后）观察。

- 邀请码激活率 ≥ 60%（发出 → 完成首次登录 + 发出 1 条消息）
- 7 日留存 ≥ 40%、30 日留存 ≥ 20%
- 单用户日均消息数 ≥ 3（衡量真实使用强度，不是注册即弃）
- 高 cost tier 模型在所有调用中占比 ≤ 30%（验证 cost gating 设计是否合理）
- Waitlist 转 invite 用户中，主动表达"愿意为此付费"意向 ≥ 30%（通过反馈邮件/问卷）
- 平均单用户日 token 消耗 ≤ Pro 月费目标的 30%（成本/COGS 健康度预估）

具体数字仅作目标参照，会随真实数据调整。Stripe 接入后再补 trial 转化率、Pro 转化率等付费指标。

---

## 八、版本与变更

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-05-21 | 0.1.0 | 初稿（基于 brainstorming 共识） |

---

## 九、后续步骤

1. 用户复审本 spec → 确认 / 修改
2. 用户复审 5 个分阶段 spec（stage-1 到 stage-5）→ 确认 / 修改
3. 调用 `superpowers:writing-plans` skill 为**阶段 1**写详细实施计划
4. 进入实施
5. 每阶段完成后，复审 + 决定是否进入下一阶段
6. 阶段 5 上线后，进入 invite-only beta，跑 1-2 月收集用户反馈与活跃度数据
7. 数据健康 → 启动 **post-MVP 阶段 6**：Stripe Atlas 注册 → Stripe 集成（Customer/Subscription/Webhook）→ 通过 `applyPlanChange()` 复用现有 gating → 切到自助订阅
