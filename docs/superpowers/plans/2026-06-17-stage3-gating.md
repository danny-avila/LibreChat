# Stage 3 — Gating 实现计划(checkAccess 接入)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 落地 Stage 3 gating(spec §5)——`MODEL_REGISTRY`(模型→cost_tier)+ `checkBillingAccess()`(三层校验:cost tier / feature / 原子配额)+ 接入 `BaseClient.sendMessage` + error codes,让模型访问受 plan 控制、月度消息受配额控制。

**Architecture:** `packages/api/src/billing/modelRegistry.ts`(静态 model→cost_tier 表,与 `modelPricing.ts` 同模式)+ `gating.ts`(`checkBillingAccess`,复用 billing 核心的 `getActiveSubscription`/`incrementQuota`/`PLANS`,依赖注入 db methods)。接入点 = `BaseClient.sendMessage`(`api/app/clients/BaseClient.js`,紧邻现有 `checkBalance`)。错误用现有 `checkBalance` 的 `throw new Error(JSON.stringify({code,...}))` 模式,经 SSE error 事件到前端;新 error codes 加进 `ErrorTypes` enum。

**Tech Stack:** TypeScript(packages/api)+ JS(api/ BaseClient 薄接入)+ Jest(no-AVX 前缀)。

## Global Constraints

- 复用 billing 核心:`getActiveSubscription`/`SYSTEM_DEFAULT_FREE_SUBSCRIPTION`/`PLANS`(@librechat/api)、`incrementQuota`/`getActiveSubscriptionRecord`(`~/models`,依赖注入,prove via checkBalance 模式)。
- **配额原子性**:用 billing 核心已验证的 `incrementQuota`(findOneAndUpdate $inc + 上限 filter),`checkBillingAccess` 不自己写配额逻辑。
- **不回滚配额**(spec §5.2):模型调用失败不退配额(<1% 失败率,admin 手动补)。
- **`this.user` 是 string** → 传给 db methods 前 `new mongoose.Types.ObjectId(this.user)`。
- **用 `this.modelOptions?.model ?? this.model`**(真实 LLM 模型),不用 `getResponseModel()`(agents 端点返回 agent.id,不在 registry)。
- **feature 参数化**:MVP 所有模型是 text endpoint,feature 不可从 endpoint 推导。`checkBillingAccess` 接受可选 `featureFlag` 参数;`BaseClient.sendMessage` 传 `undefined`(feature 检查 MVP 为 no-op);未来 agents/voice/image 入口各自传。
- **unknown model → 'mid'**(free 拒、paid 允)+ `logger.warn`(安全默认,不放行 free)。
- Never `any`;error throw 用 JSON 字符串(对齐 checkBalance)。

## File Structure

- Create `packages/api/src/billing/modelRegistry.ts` + export from `packages/api/src/index.ts`
- Create `packages/api/src/billing/gating.ts`(`checkBillingAccess`)+ export
- Create `packages/api/src/billing/gating.spec.ts`
- Modify `packages/data-provider/src/config.ts`(`ErrorTypes` enum + 3 codes)
- Modify `api/app/clients/BaseClient.js`(接入 checkBillingAccess,紧邻 checkBalance)
- Test: `api/app/clients/__tests__/`(gating 接入集成测试,或扩展现有 BaseClient 测试)

---

## Task 1: MODEL_REGISTRY + checkBillingAccess

**Files:** Create `packages/api/src/billing/modelRegistry.ts`, `gating.ts`, `gating.spec.ts`; export both from `packages/api/src/index.ts`.

**Interfaces — Produces:**
- `MODEL_REGISTRY: Record<string, { cost_tier: CostTier; feature?: FeatureKey }>`, `getModelTier(modelId): CostTier`(unknown→'mid'+warn)
- `checkBillingAccess(args: { userId, modelId, featureFlag?: FeatureKey }, deps: { getActiveSubscriptionRecord, incrementQuota }): Promise<void>`(throws on deny)

- [ ] **Step 1: MODEL_REGISTRY** — `modelRegistry.ts` with `MODEL_REGISTRY` keyed by model id → `{ cost_tier }`, seeded for the 5 providers' models in `graupel.yaml.example` (cheap: gpt-5-mini/claude-haiku-4-5/gemini-2.5-flash(-lite)/grok-3-mini/deepseek-chat; mid: claude-sonnet-4-5/gemini-2.5-pro/grok-4/deepseek-reasoner; expensive: gpt-5/claude-opus-4-x). `getModelTier(modelId)` returns the tier or `'mid'` + `logger.warn` for unknown. `FeatureKey = 'agents'|'image_gen'|'voice'|'web_search'`. Import `CostTier` from `librechat-data-provider`.
- [ ] **Step 2: checkBillingAccess** — `gating.ts` per spec §5.1, but DI-shaped (mirror applyPlanChange's deps style):
```ts
export async function checkBillingAccess(
  args: { userId: string | Types.ObjectId; modelId: string; featureFlag?: FeatureKey },
  deps: { getActiveSubscriptionRecord: (uid) => Promise<ISubscriptionLean | null>; incrementQuota: (a) => Promise<IQuotaLean | null> },
): Promise<void>
```
Logic: `sub = await getActiveSubscription(userId, { getActiveSubscriptionRecord })` (reuse billing-core's getActiveSubscription — returns free default when none); `plan = PLANS[sub.plan_code]`; `tier = getModelTier(modelId)`. (1) if `!plan.allowed_cost_tiers.includes(tier)` → throw `Error(JSON.stringify({ code: 'UPGRADE_REQUIRED_MODEL', current_plan: plan.code, required_tier: tier }))`. (2) if `args.featureFlag && !plan.features[args.featureFlag]` → throw `{ code: 'FEATURE_NOT_AVAILABLE', feature: args.featureFlag }`. (3) if `plan.monthly_message_limit > 0`: `const q = await incrementQuota({ userId, periodStart: sub.current_period_start, limit: plan.monthly_message_limit })`; if `q == null` → throw `{ code: 'UPGRADE_REQUIRED_QUOTA', used: limit, limit }`.
- [ ] **Step 3: 失败测试** — `gating.spec.ts` with real `createMethods(mongoose)` + MongoMemoryServer (mirror applyPlanChange.spec): free user + expensive model → throws UPGRADE_REQUIRED_MODEL; free user + cheap model → passes 3×, 4th throws UPGRADE_REQUIRED_QUOTA; pro user (grant via applyPlanChange) + expensive → passes; featureFlag set + plan feature false → FEATURE_NOT_AVAILABLE; unknown model → treated as 'mid' (free denied). Assert thrown error's parsed `code`.
- [ ] **Step 4: 跑通** — `cd packages/api && LD_LIBRARY_PATH="$HOME/.local/ssl1.1/usr/lib/x86_64-linux-gnu" MONGOMS_VERSION=4.4.18 npx jest src/billing/gating.spec.ts` → pass; `npx tsc -p tsconfig.json --noEmit` → 0; eslint on the 2 new files → 0.
- [ ] **Step 5: commit** — `git commit -m "feat(billing): add MODEL_REGISTRY and checkBillingAccess gating"`

---

## Task 2: ErrorTypes + 接入 BaseClient.sendMessage

**Files:** Modify `packages/data-provider/src/config.ts`(`ErrorTypes` enum); Modify `api/app/clients/BaseClient.js`(接入). Test: gating 接入集成测试。

**Interfaces — Consumes:** `checkBillingAccess`(Task 1)、`~/models` 的 `getActiveSubscriptionRecord`/`incrementQuota`。

- [ ] **Step 1: ErrorTypes enum** — add `UPGRADE_REQUIRED_MODEL = 'upgrade_required_model'`, `UPGRADE_REQUIRED_QUOTA = 'upgrade_required_quota'`, `FEATURE_NOT_AVAILABLE = 'feature_not_available'` to the `ErrorTypes` enum in `packages/data-provider/src/config.ts` (~line 1947). `build:data-provider` after. (Frontend UpgradeModal rendering is a later frontend sub-plan; this step only registers the codes so SSE doesn't swallow them as generic errors. Use these exact string values as the `code` thrown in Task 1 — update Task 1's throw codes to match these enum string values if needed.)
- [ ] **Step 2: 接入 BaseClient** — in `api/app/clients/BaseClient.js` `sendMessage` (after `handleStartMethods`, adjacent to the existing `checkBalance` block ~line 542), add:
```js
const { checkBillingAccess } = require('@librechat/api');
// ... inside sendMessage, before/with checkBalance:
const billingModel = this.modelOptions?.model ?? this.model;
await checkBillingAccess(
  { userId: this.user, modelId: billingModel },   // userId string; checkBillingAccess casts to ObjectId internally
  { getActiveSubscriptionRecord: db.getActiveSubscriptionRecord, incrementQuota: db.incrementQuota },
);
```
(`db` is already `require('~/models')` at BaseClient.js:31. `checkBillingAccess` should cast `userId` to `mongoose.Types.ObjectId` internally — confirm Task 1 does this, or cast here.) The throw propagates out of sendMessage → caught in `request.js` → `denyRequest` → SSE `error` event with the JSON body, exactly like checkBalance.
- [ ] **Step 3: 集成测试** — add a test that exercises the gate via BaseClient (or a focused test of the wired call): a free user calling an expensive model gets the UPGRADE_REQUIRED_MODEL error surfaced; a within-quota cheap call proceeds. Mirror an existing BaseClient test setup; mock only the provider SDK call (`sendCompletion`), use real checkBillingAccess + real db methods (mongodb-memory-server) per the real-logic testing philosophy. If BaseClient is hard to unit-test in isolation, at minimum add a focused test asserting the wired `checkBillingAccess` is called with the right model + that its throw propagates.
- [ ] **Step 4: 跑通** — relevant jest (BaseClient/gating) with env prefix → pass; `build:data-provider` → ok; `cd api && npx eslint app/clients/BaseClient.js` → 0; `cd packages/api && npx tsc -p tsconfig.json --noEmit` → 0.
- [ ] **Step 5: commit** — `git commit -m "feat(billing): wire checkBillingAccess into BaseClient.sendMessage"`

---

## Self-Review

- **Spec 覆盖**:覆盖 spec §5(checkAccess 三层 + 接入 BaseClient.sendMessage + error codes)。配额原子性复用 billing 核心 incrementQuota(§5.1 已在 billing-core race-tested)。不回滚(§5.2)。
- **关键约束**:this.user cast ObjectId;用 modelOptions.model 非 agent.id;feature 参数化(MVP no-op);unknown model→mid;error 用 checkBalance throw 模式。
- **依赖注入**:checkBillingAccess 接受 db methods(对齐 applyPlanChange),BaseClient 从 ~/models 注入。
- **不含**(后续 sub-plan):admin API(开通/撤销/配额重置)+ CLI;前端 PlanBadge/QuotaBar/**UpgradeModal**(渲染 402)/ModelLockTooltip;usage 接入 BaseClient onComplete + cron 告警。本 plan 只让 gating 生效 + error code 可被前端识别(渲染留前端 sub-plan)。

## 后续 sub-plan

1. **Admin API + CLI**:`/admin/users/:id/plan` 等(调 applyPlanChange)+ requireRole('ADMIN') + AuditLog 接线 + cancel 路径 + `scripts/grant-plan.js`
2. **前端计费 UI**:PlanBadge / QuotaBar / UpgradeModal(渲染 3 个 error code)/ ModelLockTooltip + /account/plan
3. **Usage + cron**:recordUsage 挂 BaseClient onComplete hook(estimateCost)+ 每日成本告警 cron
