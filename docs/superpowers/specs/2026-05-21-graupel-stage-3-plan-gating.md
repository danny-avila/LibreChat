# Graupel Stage 3 — Plan / 配额 / Gating 体系（不含支付）

> **版本**: 0.1.0
> **创建日期**: 2026-05-21
> **状态**: Draft（待用户复审）
> **父 spec**: [2026-05-21-graupel-mvp-design.md](./2026-05-21-graupel-mvp-design.md)
> **预估**: 25-30 小时（约 2.5-3 周）

---

## 一、目标

建立完整的**多 plan + 模型 gating + 月度配额**系统，让模型访问受 plan 控制，月度消息数受配额控制，但 plan 本身在 MVP 期通过内部 admin API 手动开通（不接 Stripe）。

**最高优先级原则**：把 plan 切换抽象成**事件驱动**——任何来源（admin API、未来的 Stripe webhook、CLI 脚本）都通过同一个入口 `applyPlanChange()`，让阶段 6 接 Stripe 时**完全不需要重写 gating / 配额逻辑**，只需在 webhook handler 里调用既有入口。

---

## 二、范围与非范围

### 2.1 在范围内

- `Plan` / `Subscription` / `Quota` / `UsageLog` schema
- `PLANS` 常量定义（5 种 plan 配置）
- 模型 `costTier` 配置（在 `graupel.yaml`）
- `applyPlanChange()` 统一入口
- `checkAccess()` gating middleware（atomic check-and-increment）
- Admin API 路由组：开通 / 撤销 / 重置 / 查询
- 用户前端：plan 状态 + 配额条 + 锁定模型 UI
- UsageLog 异步记录 token 消耗

### 2.2 不在范围内

- Stripe Customer / Subscription / Webhook（阶段 6）
- 自助升级 / 取消页面（阶段 6）
- Trial 自动转 Pro 的定时任务（阶段 6）
- 邀请码体系（阶段 5 营销层考虑，本阶段不设）

---

## 三、数据模型

### 3.1 类型定义

```ts
// packages/data-provider/src/types/billing.ts
export type PlanCode = 'free' | 'trial' | 'pro_m' | 'pro_q' | 'pro_h';
export type CostTier = 'cheap' | 'mid' | 'expensive';
export type SubStatus = 'active' | 'trialing' | 'expired' | 'admin_granted';
export type PlanChangeSource = 'admin' | 'stripe' | 'system_default' | 'cli';

export interface PlanConfig {
  code: PlanCode;
  name: string;                      // 用户可见名："Pro Monthly"
  monthly_price_cents: number;       // 仅展示和未来 Stripe 映射
  allowed_cost_tiers: CostTier[];
  monthly_message_limit: number;     // -1 = unlimited
  features: {
    agents: boolean;
    image_gen: boolean;
    voice: boolean;
    web_search: boolean;
  };
}
```

### 3.2 PLANS 常量

```ts
// packages/api/src/billing/plans.ts
export const PLANS: Record<PlanCode, PlanConfig> = {
  free: {
    code: 'free',
    name: 'Free',
    monthly_price_cents: 0,
    allowed_cost_tiers: ['cheap'],
    monthly_message_limit: 3,           // 3 条试用
    features: { agents: false, image_gen: false, voice: false, web_search: false },
  },
  trial: {
    code: 'trial',
    name: 'Trial',
    monthly_price_cents: 100,
    allowed_cost_tiers: ['cheap', 'mid', 'expensive'],
    monthly_message_limit: 100,
    features: { agents: true, image_gen: true, voice: true, web_search: true },
  },
  pro_m: {
    code: 'pro_m',
    name: 'Pro Monthly',
    monthly_price_cents: 2999,
    allowed_cost_tiers: ['cheap', 'mid', 'expensive'],
    monthly_message_limit: 2000,
    features: { agents: true, image_gen: true, voice: true, web_search: true },
  },
  pro_q: {
    code: 'pro_q',
    name: 'Pro Quarterly',
    monthly_price_cents: 7999,
    allowed_cost_tiers: ['cheap', 'mid', 'expensive'],
    monthly_message_limit: 2000,
    features: { agents: true, image_gen: true, voice: true, web_search: true },
  },
  pro_h: {
    code: 'pro_h',
    name: 'Pro Half-Year',
    monthly_price_cents: 14999,
    allowed_cost_tiers: ['cheap', 'mid', 'expensive'],
    monthly_message_limit: 2000,
    features: { agents: true, image_gen: true, voice: true, web_search: true },
  },
};
```

具体配额数字仍是占位，会在阶段 4 调研同行 + 阶段 5 真实数据后调整。改 PLANS 是一行常量改动，不需要数据迁移。

### 3.3 Mongo schemas

```ts
// packages/data-schemas/src/schema/subscription.ts
export interface Subscription {
  _id: ObjectId;
  user_id: ObjectId;
  plan_code: PlanCode;
  status: SubStatus;
  source: PlanChangeSource;             // MVP 期只会出现 admin / system_default / cli
  current_period_start: Date;
  current_period_end: Date;
  external_ref: string | null;          // 预留 stripe_subscription_id
  granted_by: ObjectId | null;          // admin user id
  metadata: Record<string, string>;     // 自由扩展（备注、邀请码 ID 等）
  created_at: Date;
  updated_at: Date;
}

// 索引：
// 1. { user_id: 1, status: 1 }                 — 查询 active subscription
// 2. { user_id: 1, current_period_start: -1 } — 查询历史 plan
// 3. { external_ref: 1 } sparse                — 阶段 6 Stripe 反查


// packages/data-schemas/src/schema/quota.ts
export interface Quota {
  _id: ObjectId;
  user_id: ObjectId;
  period_start: Date;                   // 当前订阅周期起点（与 Subscription.current_period_start 对齐）
  messages_used: number;
  created_at: Date;
  updated_at: Date;
}

// 索引：
// 1. { user_id: 1, period_start: 1 } unique  — atomic findOneAndUpdate 命中点


// packages/data-schemas/src/schema/usageLog.ts
export interface UsageLog {
  _id: ObjectId;
  user_id: ObjectId;
  model_id: string;                     // 'gpt-5', 'claude-opus-4-7' 等
  day: Date;                            // 当天 0:00 UTC，做粗粒度聚合
  prompt_tokens: number;
  completion_tokens: number;
  call_count: number;
  estimated_cost_cents: number;         // 后端按 modelPricing 表估算
  updated_at: Date;
}

// 索引：
// 1. { user_id: 1, model_id: 1, day: 1 } unique  — upsert 命中点
// 2. { day: 1 }                                  — 按日期聚合查询
// 3. { day: 1 } TTL 90 天                         — 90 天后自动清理（aggreggate 完成度足够，不留长期明细）
```

### 3.4 用户当前 plan 解析

`getActiveSubscription(userId)`：

```ts
async function getActiveSubscription(userId: ObjectId): Promise<Subscription> {
  const sub = await Subscription.findOne({
    user_id: userId,
    status: { $in: ['active', 'trialing', 'admin_granted'] },
    current_period_end: { $gt: new Date() },
  }).sort({ current_period_end: -1 });

  if (!sub) {
    return SYSTEM_DEFAULT_FREE_SUBSCRIPTION; // 内存里的常量，避免每次写"隐式 free"记录
  }
  return sub;
}
```

`SYSTEM_DEFAULT_FREE_SUBSCRIPTION`：

```ts
const SYSTEM_DEFAULT_FREE_SUBSCRIPTION = {
  plan_code: 'free',
  source: 'system_default',
  current_period_start: startOfMonth(new Date()),
  current_period_end: endOfMonth(new Date()),
  // ...
};
```

**为什么不每次给新用户写一条 free Subscription？**

- 节省写入：99% 用户永远是 free，写 record 是浪费
- 更简单的 plan 切换语义：从 free 升级 = create new active subscription；降级到 free = expire current
- 数据库里"没有 active subscription" ≡ free，单一事实源

---

## 四、`applyPlanChange()` 统一入口

### 4.1 签名

```ts
// packages/api/src/billing/applyPlanChange.ts
interface PlanChangeArgs {
  user_id: ObjectId;
  plan_code: PlanCode;
  source: PlanChangeSource;
  period_days?: number;              // 默认按 plan_code 推算（pro_m=30, pro_q=90, pro_h=180, trial=7）
  external_ref?: string;             // 阶段 6 Stripe 传 sub id
  granted_by?: ObjectId;             // admin user id
  metadata?: Record<string, string>;
}

interface PlanChangeResult {
  subscription: Subscription;
  quota: Quota;
  previous_plan: PlanCode | null;
}

async function applyPlanChange(args: PlanChangeArgs): Promise<PlanChangeResult>;
```

### 4.2 内部行为

1. 找当前 active subscription
2. 如有，标记为 `expired`（保留历史，不删）
3. 创建新 Subscription：
   - period_start = now
   - period_end = now + period_days
4. 创建对应 Quota record（`messages_used: 0`，`period_start` 与 Subscription 对齐）
5. 发 PostHog 事件 `plan_changed`（含 from/to/source）—— 阶段 5 落地后启用
6. 返回结果

### 4.3 幂等性

- 同一 `external_ref` 不重复处理（阶段 6 用，MVP 期 admin 调用不传 external_ref）
- admin API 不需要幂等（人工触发，重试由人决定）

### 4.4 哪些路径必须走它

⚠️ **不允许任何代码直接 `Subscription.create` / `Subscription.update`**。所有 plan 状态变更必须经过 `applyPlanChange()`。

验收时 grep 全仓：
```bash
rg 'Subscription\.(create|insert|update|findOneAndUpdate)' packages/ api/
```

应当只在 `applyPlanChange.ts` 内部命中（以及必要的迁移脚本）。

---

## 五、Gating Middleware

### 5.1 接入点

LibreChat 的所有模型调用都经过 `api/server/services/Endpoints/<endpoint>/buildOptions.js` 类似的入口；阶段 1 已统一了 endpoint 列表，本阶段在统一入口前加一层 middleware：

```ts
// packages/api/src/billing/gating.ts
export async function checkAccess(user: User, requestedModel: string): Promise<void> {
  const sub = await getActiveSubscription(user._id);
  const plan = PLANS[sub.plan_code];
  const model = MODEL_REGISTRY[requestedModel];
  if (!model) throw new HttpError(404, 'UNKNOWN_MODEL');

  // 1. cost tier check
  if (!plan.allowed_cost_tiers.includes(model.cost_tier)) {
    throw new HttpError(402, 'UPGRADE_REQUIRED_MODEL', {
      current_plan: plan.code,
      required_tier: model.cost_tier,
    });
  }

  // 2. feature flag check（如果模型属于某个 feature 类别，比如 image_gen）
  if (model.feature && !plan.features[model.feature]) {
    throw new HttpError(402, 'FEATURE_NOT_AVAILABLE', { feature: model.feature });
  }

  // 3. quota check + atomic increment
  if (plan.monthly_message_limit > 0) {
    const result = await Quota.findOneAndUpdate(
      {
        user_id: user._id,
        period_start: sub.current_period_start,
        messages_used: { $lt: plan.monthly_message_limit },
      },
      {
        $inc: { messages_used: 1 },
        $setOnInsert: { created_at: new Date() },
        $set: { updated_at: new Date() },
      },
      { new: true, upsert: true }
    ).catch((err) => {
      // 如果是并发 upsert 冲突（duplicate key），重试一次
      if (err.code === 11000) return retryQuotaIncrement(user._id, sub, plan);
      throw err;
    });

    if (!result) {
      throw new HttpError(402, 'UPGRADE_REQUIRED_QUOTA', {
        used: plan.monthly_message_limit,
        limit: plan.monthly_message_limit,
      });
    }
  }
}
```

⚠️ 几个关键设计：

- **`upsert: true` + `$setOnInsert`**：第一次调用时 Quota 不存在，自动建；后续调用走 update 路径
- **并发 upsert 的 duplicate key 处理**：两个并发请求都走 upsert 时一个会失败，捕获 11000 重试一次（重试用 update-only 路径）
- **不是先读再校验**：`messages_used: { $lt: limit }` 作为 update 的 filter，让 MongoDB 在原子操作里完成"小于上限就 +1"，超过上限自然 update 0 行
- **不在 catch 块里 swallow 异常**：除了 11000 重试，其他错误一律向上抛

### 5.2 Refund 设计

如果模型调用本身失败（比如供应商 5xx），是否要把 quota 扣减回滚？

**MVP 阶段决策：不回滚**。原因：
- 实现复杂度高（需要请求级的 transaction context）
- 实际失败率 < 1%，对配额影响可忽略
- 用户在错误页可以 contact support 手动加回（admin API 已支持）

### 5.3 接入位置

LibreChat 的 endpoint 调用大致流程：

```
client → api/server/routes/messages.js
       → BaseClient.sendMessage
       → endpoint-specific client (OpenAIClient.sendCompletion 等)
       → 实际 SDK 调用
```

`checkAccess()` 应该插在 **BaseClient.sendMessage** 入口（最早的统一点），失败抛 402 让前端展示锁定/超限提示。

---

## 六、Admin API

### 6.1 鉴权

复用 LibreChat 已有的 `role: 'ADMIN'` 字段（packages/data-schemas 的 user schema 应该已有）。所有 `/admin/*` 路由套 `requireRole('ADMIN')` middleware。

MVP 期 admin user 只有用户本人一个，通过环境变量 `BOOTSTRAP_ADMIN_EMAIL` 在系统启动时把对应 email 的 user role 设为 ADMIN（如果用户存在）。

### 6.2 路由清单

```
POST   /admin/users/:id/plan
       body: { plan_code, period_days?, metadata? }
       response: { subscription, quota }
       calls applyPlanChange({ source: 'admin', granted_by: req.user._id })

DELETE /admin/users/:id/plan
       (把 user 当前 active subscription 标记 expired，回到 system_default free)
       不调用 applyPlanChange——直接 update status 即可（这是 cancel，不是 change）

POST   /admin/users/:id/quota/reset
       body: { messages_used?: 0 }
       response: { quota }

GET    /admin/users/:id/subscription
       response: { subscription, quota, plan_config }

GET    /admin/usage
       query: from=YYYY-MM-DD, to=YYYY-MM-DD, group_by=user|model|day
       response: aggregated UsageLog 数据
       (供本人核算成本，不公开)

GET    /admin/users
       query: q=email_or_name, plan_code?, page?, per_page?
       response: 分页 user 列表（含当前 plan）
```

所有 admin 路由都要：
- HTTPS only
- IP 白名单（用户本人开发机 IP + 临时移动办公 IP 列表，存环境变量）
- 操作日志（写到 AuditLog collection——LibreChat 没有自带，本阶段顺手加）

### 6.3 AuditLog（顺带做）

```ts
interface AuditLog {
  _id: ObjectId;
  actor_id: ObjectId;             // admin user id
  action: string;                 // 'plan.grant', 'plan.cancel', 'quota.reset'
  target_user_id: ObjectId;
  payload: Record<string, unknown>;
  created_at: Date;
}
```

每个 admin 写操作前后异步写一条 AuditLog。阶段 6 接 Stripe 时 webhook handler 也写 AuditLog（actor 用 `system:stripe`）。

### 6.4 CLI 兜底

万一某天 admin user role 自己丢了或 admin API 路由有 bug，需要个兜底通道。提供 `node scripts/grant-plan.js <email> <plan_code> <days>`：

- 直接连 Mongo 调 `applyPlanChange({ source: 'cli', granted_by: null })`
- 用环境变量里的 root admin 凭据
- 写 AuditLog actor 设为 `system:cli`

---

## 七、用户前端

### 7.1 顶部导航

加一块"plan badge + 配额条"：

```
┌──────────────────────────────────────────────────────┐
│ Graupel Logo    [chat list]            [Pro · 1247/2000 messages] [user avatar] │
└──────────────────────────────────────────────────────┘
```

- Plan badge 颜色按 tier 区分（Free=灰、Trial=橙、Pro=蓝）
- 配额条把 used/limit 数字直接展示，hover tooltip 提示重置时间（period_end）
- 点 badge 跳到 `/account/plan` 页

### 7.2 模型选择器

- 拉取 user 的 active subscription（用 React Query 缓存 5 分钟）
- 对每个模型计算 `accessible: boolean`
- 不可用模型显示锁标 🔒 + tooltip "Available on Pro"
- 不可用模型禁用而非隐藏（让用户看到完整模型列表，理解"升级能解锁"）

### 7.3 超限弹窗

调用返回 `402 UPGRADE_REQUIRED_QUOTA` 或 `UPGRADE_REQUIRED_MODEL` 时，前端拦截、弹 modal：

```
┌───────────────────────────────────────┐
│ You've reached your plan's limit      │
│                                       │
│ You've used 2000/2000 messages this   │
│ period. Pro plans are coming soon —   │
│ join the waitlist for early access.   │
│                                       │
│ [ Join waitlist ]  [ Contact us ]     │
└───────────────────────────────────────┘
```

按钮：
- "Join waitlist" → `/waitlist`（阶段 4 上线，本阶段先用占位）
- "Contact us" → mailto:`support@graupel.<tld>?subject=Need%20higher%20limit`

### 7.4 `/account/plan` 页

简单页面：
- 当前 plan 名称 + 价格（标 "currently free during beta"）
- 配额使用 + 剩余天数
- 历史 subscriptions 列表（来自 GET /me/subscriptions —— 简单加一个用户自己读的路由）
- "Manage subscription"（阶段 6 才有意义，MVP 期是占位文字 "Self-service billing coming soon"）

---

## 八、UsageLog 异步记录

### 8.1 触发点

每次模型调用**完成后**（成功或失败），从 BaseClient 的 `onComplete` hook 拿到 token usage：

```ts
// 异步上报，不阻塞响应
queueMicrotask(() => {
  recordUsage({
    user_id: user._id,
    model_id: model.id,
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
  }).catch((err) => logger.error('usage log failed', err));
});
```

### 8.2 写入逻辑

```ts
async function recordUsage(args) {
  const day = startOfDay(new Date());                // UTC
  const cost = estimateCost(args.model_id, args);    // 查 MODEL_PRICING 表

  await UsageLog.findOneAndUpdate(
    { user_id: args.user_id, model_id: args.model_id, day },
    {
      $inc: {
        prompt_tokens: args.prompt_tokens,
        completion_tokens: args.completion_tokens,
        call_count: 1,
        estimated_cost_cents: cost,
      },
      $set: { updated_at: new Date() },
      $setOnInsert: { user_id: args.user_id, model_id: args.model_id, day },
    },
    { upsert: true }
  );
}
```

### 8.3 MODEL_PRICING

```ts
// packages/api/src/billing/modelPricing.ts
export const MODEL_PRICING: Record<string, { prompt_per_1k_cents: number; completion_per_1k_cents: number }> = {
  'gpt-5': { prompt_per_1k_cents: 0.5, completion_per_1k_cents: 1.5 },
  'claude-opus-4-7': { prompt_per_1k_cents: 1.5, completion_per_1k_cents: 7.5 },
  // ... 完整列表
};
```

定价数据来源：阶段 1 收集供应商当前定价；阶段 5 上线前再 review 一次。

### 8.4 异常检测（轻量级）

加一个 cron（用 node-cron）每天凌晨跑：
- 查昨日 UsageLog 按 user 聚合
- 任何 user 单日 estimated_cost_cents > $5（500 cents）→ 发邮件告警给 admin
- 阈值通过环境变量 `DAILY_USER_COST_ALERT_CENTS` 调

---

## 九、风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 并发请求绕过配额（race condition） | 严重，可能让用户超用 | atomic findOneAndUpdate（5.1 设计），并发测试覆盖 |
| 迁移老用户：现有用户没有 Subscription record，登入直接抛错 | 中 | `getActiveSubscription` 返回隐式 free，不是 throw |
| applyPlanChange 调用源失控（绕过统一入口） | 严重，将来 Stripe 接入会冲突 | grep 验收 + lint rule（如可能） |
| Quota period_start 漂移（period 跨自然月时） | 中 | period_start 永远来自 Subscription.current_period_start，不依赖系统时间，旧周期的 Quota record 自然废弃 |
| AuditLog 写失败阻塞 admin 操作 | 低 | AuditLog 异步写、失败仅记 logger.error 不影响主流程 |
| MODEL_PRICING 与供应商实际计费差异大 | 中 | 仅做内部估算，与用户无关；阶段 5 上线后比对 OpenAI 月度账单校准 |
| Free 用户配额 3 条用完后再也不能聊任何模型，体验差 | 中 | 文案明确 "Free is for trial only"；超限弹窗里给清晰升级路径（即使 MVP 期是 mailto） |

---

## 十、测试策略

### 10.1 单元测试

- PLANS 配置完整性（每个 plan_code 对应一个 PlanConfig）
- `applyPlanChange()` 正确创建/expire subscription、对应 Quota 重置
- `checkAccess()` 三层校验各自命中正确 error code
- MODEL_PRICING 对所有 graupel.yaml 里的模型都有 entry

### 10.2 集成测试（mongodb-memory-server）

- 完整的 plan 切换 → 配额重置 → 调用 → 自增 → 超限 → 升级再调用流程
- 并发配额测试：100 个 goroutine 同时调用，恰好 limit 个成功
- admin API 各端点的鉴权（非 admin 拒绝 403、admin 通过）
- AuditLog 写入完整性

### 10.3 端到端

| 场景 | 预期 |
|---|---|
| 新注册用户调 GPT-5（mid tier） | 402 UPGRADE_REQUIRED_MODEL，前端弹锁定提示 |
| 新注册用户调 Claude Haiku（cheap tier） | 通过，第 4 次抛 402 UPGRADE_REQUIRED_QUOTA |
| admin 给 user 开 pro_m | 立刻能调任何 tier，配额 2000 |
| admin 撤销 user plan | 立刻回 free，下次 expensive 调用抛 402 |
| 跨自然月 period 边界 | period_end 后第一次调用应当被拒（status=expired），admin 续 plan 后恢复 |
| 故意越过 applyPlanChange 直接 update Subscription | grep 验收发现违规，CI fail |

---

## 十一、验收标准

- [ ] 全部 schema + 索引落库
- [ ] PLANS 常量与文档一致
- [ ] `applyPlanChange()` 是唯一变更入口（grep 验收通过）
- [ ] gating middleware 接入所有模型 endpoint
- [ ] 并发配额测试 100 次零超发
- [ ] admin API 鉴权 + AuditLog 完整
- [ ] 用户前端：badge / 配额条 / 锁定模型 / 超限弹窗 4 处 UI
- [ ] UsageLog 异步记录、cron 异常告警可触发
- [ ] CLI 兜底脚本可单独运行
- [ ] 单元 + 集成测试覆盖率 ≥ 85%（billing 模块）
- [ ] 阶段 6 接入 checklist 文档（清单形式列出"接 Stripe 时只需要做的步骤"），方便未来交接

---

## 十二、交付物

- `packages/api/src/billing/`：plans.ts、applyPlanChange.ts、gating.ts、modelPricing.ts
- `packages/data-schemas/src/schema/`：subscription.ts、quota.ts、usageLog.ts、auditLog.ts
- `packages/data-provider/src/types/billing.ts`：共享类型
- `api/server/routes/admin/`：薄包装路由
- `client/src/components/billing/`：PlanBadge、QuotaBar、UpgradeModal、ModelLockTooltip
- `scripts/grant-plan.js`：CLI 兜底
- `docs/billing-architecture.md`：本阶段架构 + 阶段 6 接入指南
- 测试套件 + 文档

---

## 十三、衔接

**前置依赖**：
- 阶段 2 完成（用户都有有效 email；admin 用 email 唯一标识用户）

**后置触发**：
- 本阶段完成 → 阶段 4（营销页）。阶段 4 假设：
  - `/pricing` 页能从 PLANS 配置渲染（不需要再硬编码价格）
  - waitlist 提交后由 admin 后台手动 grant trial / pro
- 阶段 6（Stripe 接入）的 checklist：
  1. 装 stripe-node SDK
  2. 加 ProcessedWebhook collection（5.2 设计）
  3. 实现 webhook handler，每个 event type 映射到 `applyPlanChange()` 调用
  4. 加 Customer 关联：在 user schema 加 `stripe_customer_id`
  5. 加自助升级前端：`/billing` 页 + Stripe Checkout / Customer Portal 链接
  6. PostHog 事件补 subscription_started 等
  7. 法人实体注册（Stripe Atlas）
  
  **关键**：不会动 gating 逻辑、不会动 PLANS 常量、不会动 admin API。

---

## 十四、版本与变更

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-05-21 | 0.1.0 | 初稿 |
