# Stage 3 — Billing 核心实现计划(基础层)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 落地 Stage 3 计费系统的**基础层** —— 共享类型 + `PLANS` 常量 + 4 个 schema(Subscription/Quota/UsageLog/AuditLog)+ `applyPlanChange()` 统一入口 + `modelPricing`。这是后续 gating / admin API / 前端 / usage 接入的前置(它们是独立 sub-plan)。

**Architecture:** `packages/data-provider/src/types/billing.ts`(共享类型)→ `packages/data-schemas`(4 schema,沿用已验证的 note factory 模式:`createXModel` + `createXMethods` + 注册进 `createModels`/`createMethods`)→ `packages/api/src/billing`(PLANS / applyPlanChange / modelPricing)。`applyPlanChange()` 是 Subscription 的**唯一**写入口。

**Tech Stack:** TypeScript(packages)、Mongoose、Jest + `mongodb-memory-server`(no-AVX 前缀 `LD_LIBRARY_PATH="$HOME/.local/ssl1.1/usr/lib/x86_64-linux-gnu" MONGOMS_VERSION=4.4.18`)。

## Global Constraints

- 共享类型在 `packages/data-provider/src/types/billing.ts`;复用、不重复定义。
- schema 沿用 note 的 factory 模式(参考 `packages/data-schemas/src/schema/note.ts` + `models/note.ts` + `methods/note.ts` + 在 `models/index.ts`/`methods/index.ts` 注册)。**Graupel 单租户**:不调用 `applyTenantIsolation`。
- **`applyPlanChange()` 是 Subscription 的唯一写入口**(spec §4.4):除它之外不允许 `Subscription.create/update/findOneAndUpdate`。grep 验收:`grep -rn "Subscription.*\.(create|insertMany|findOneAndUpdate|updateOne|updateMany)" packages api | grep -v node_modules` 仅命中 applyPlanChange 内部 + cancel 路径(后续 admin sub-plan)。
- Never `any`;避免 `unknown`/`as unknown as T`。
- 配额数字按 spec §3.2 占位(待 stage 4/5 调)。
- 本 plan **不含**:`checkAccess()` gating、admin 路由、前端 UI、usage 接入 BaseClient、cron(均后续 sub-plan)。本层只提供它们要用的类型/常量/schema/methods/入口函数。

## File Structure

- `packages/data-provider/src/types/billing.ts` + 导出
- `packages/api/src/billing/plans.ts`(PLANS) + `plans.spec.ts`
- `packages/data-schemas/src/schema/{subscription,quota,usageLog,auditLog}.ts`
- `packages/data-schemas/src/types/{subscription,quota,usageLog,auditLog}.ts` + 导出
- `packages/data-schemas/src/models/{...}.ts` + 注册进 `models/index.ts`
- `packages/data-schemas/src/methods/{...}.ts` + 注册进 `methods/index.ts` + spec
- `packages/api/src/billing/{applyPlanChange,modelPricing}.ts` + spec + `index.ts` 导出

---

## Task 1: 共享类型 + PLANS 常量

**Files:**
- Create `packages/data-provider/src/types/billing.ts`; export from `packages/data-provider/src/types/index.ts`
- Create `packages/api/src/billing/plans.ts`; export from `packages/api/src/index.ts`
- Create `packages/api/src/billing/plans.spec.ts`

**Interfaces — Produces:** `PlanCode`/`CostTier`/`SubStatus`/`PlanChangeSource`/`PlanConfig`(types/billing.ts);`PLANS: Record<PlanCode, PlanConfig>`(plans.ts)。

- [ ] **Step 1: 类型** — Create `packages/data-provider/src/types/billing.ts` verbatim from [spec §3.1](../specs/2026-05-21-graupel-stage-3-plan-gating.md#31-类型定义)(`PlanCode`/`CostTier`/`SubStatus`/`PlanChangeSource`/`PlanConfig`). Export via `export * from './billing'` in `types/index.ts`.
- [ ] **Step 2: PLANS** — Create `packages/api/src/billing/plans.ts` verbatim from spec §3.2 (5 plans: free/trial/pro_m/pro_q/pro_h). Import `PlanCode`/`PlanConfig` from `librechat-data-provider`. Export `PLANS` from `packages/api/src/index.ts`.
- [ ] **Step 3: 失败测试** — Create `plans.spec.ts`:
```ts
import { PLANS } from './plans';
const CODES = ['free', 'trial', 'pro_m', 'pro_q', 'pro_h'] as const;
describe('PLANS', () => {
  test('every PlanCode has a config with matching code', () => {
    for (const code of CODES) {
      expect(PLANS[code]).toBeDefined();
      expect(PLANS[code].code).toBe(code);
    }
  });
  test('free only allows cheap tier with 3-message limit', () => {
    expect(PLANS.free.allowed_cost_tiers).toEqual(['cheap']);
    expect(PLANS.free.monthly_message_limit).toBe(3);
    expect(PLANS.free.features.image_gen).toBe(false);
  });
  test('pro plans allow all tiers + all features', () => {
    for (const code of ['pro_m', 'pro_q', 'pro_h'] as const) {
      expect(PLANS[code].allowed_cost_tiers).toEqual(['cheap', 'mid', 'expensive']);
      expect(Object.values(PLANS[code].features).every(Boolean)).toBe(true);
    }
  });
});
```
- [ ] **Step 4: 跑通** — `cd packages/api && npx jest src/billing/plans.spec.ts` → pass; `npx tsc -p tsconfig.json --noEmit` → 0. (`build:data-provider` first so the types resolve.)
- [ ] **Step 5: commit** — `git commit -m "feat(billing): add billing types and PLANS constant"`

---

## Task 2: 4 个 schema + 类型 + model 注册

> 沿用 note 的 factory 模式。字段/索引 verbatim from [spec §3.3](../specs/2026-05-21-graupel-stage-3-plan-gating.md#33-mongo-schemas)。每个 schema:`types/X.ts`(IX + lean)→ `schema/X.ts`(mongoose)→ `models/X.ts`(createXModel,**不** applyTenantIsolation)→ 注册 `models/index.ts`。

**Files:** Create `types/{subscription,quota,usageLog,auditLog}.ts` + `schema/{...}.ts` + `models/{...}.ts`; modify `types/index.ts`(exports) + `models/index.ts`(import + createModels register). Test: `methods/billing.spec.ts`(schema-level validation, extended in Task 3).

**Interfaces — Produces:** `ISubscription`/`IQuota`/`IUsageLog`/`IAuditLog`(+ lean + param types);models `Subscription`/`Quota`/`UsageLog`/`AuditLog`.

- [ ] **Step 1: 写 4 个 schema + 类型 + model 工厂** — verbatim 字段/索引 from spec §3.3. Key indexes: Subscription `{user_id:1,status:1}` + `{external_ref:1}` sparse; Quota `{user_id:1,period_start:1}` **unique**(atomic 命中点); UsageLog `{user_id:1,model_id:1,day:1}` unique + `{day:1}` TTL 90 days; AuditLog `{actor_id:1,created_at:-1}`. Each model factory mirrors `models/note.ts` (no applyTenantIsolation). Register all four in `createModels` (`models/index.ts`) after the existing entries.
- [ ] **Step 2: 失败测试(schema 校验)** — Create `methods/billing.spec.ts` with a `describe('billing schemas')` block: each model creates a valid doc; required fields enforced; Quota `{user_id,period_start}` uniqueness rejects duplicate. (Use the `mcpServer.spec.ts`/`note.spec.ts` MongoMemoryServer setup pattern.)
- [ ] **Step 3: 跑通** — `cd packages/data-schemas && LD_LIBRARY_PATH="$HOME/.local/ssl1.1/usr/lib/x86_64-linux-gnu" MONGOMS_VERSION=4.4.18 npx jest src/methods/billing.spec.ts` → pass; `npx tsc -p tsconfig.json --noEmit` → 0.
- [ ] **Step 4: commit** — `git commit -m "feat(billing): add Subscription/Quota/UsageLog/AuditLog schemas"`

---

## Task 3: schema methods

**Files:** Create `methods/{subscription,quota,usageLog,auditLog}.ts`; modify `methods/index.ts`(import + AllMethods + return spread + export type, mirroring note). Extend `methods/billing.spec.ts`.

**Interfaces — Produces (consumed by applyPlanChange + later sub-plans):**
- subscription: `getActiveSubscriptionRecord(userId)`, `expireActiveSubscriptions(userId)`, `createSubscription(args)` (these are the ONLY subscription writers — applyPlanChange composes them; do NOT expose a generic update)
- quota: `createQuota({userId, periodStart})`, `incrementQuota({userId, periodStart, limit})`(atomic findOneAndUpdate `$inc` + `messages_used < limit` filter + upsert, returns null when over limit), `resetQuota({userId, periodStart})`
- usageLog: `recordUsage({userId, modelId, promptTokens, completionTokens, costCents})`(upsert `$inc`, per spec §8.2)
- auditLog: `writeAuditLog({actorId, action, targetUserId, payload})`

- [ ] **Step 1: 写 methods** — mirror `methods/note.ts` factory style. `incrementQuota` is the atomic core (spec §5.1): `findOneAndUpdate({user_id, period_start, messages_used: {$lt: limit}}, {$inc:{messages_used:1}, $setOnInsert:{created_at}, $set:{updated_at}}, {new:true, upsert:true})` with duplicate-key(11000) single retry. (checkAccess in a later sub-plan calls this; here just provide + unit-test it.)
- [ ] **Step 2: 聚合** — wire all four into `methods/index.ts` (import, `AllMethods &`, `createMethods` return spread, `export type`).
- [ ] **Step 3: 失败测试** — extend `billing.spec.ts`: getActive returns newest non-expired; expire marks active→expired; incrementQuota allows up to limit then returns null; concurrent incrementQuota (Promise.all of N calls) yields exactly `limit` successes (race test, spec §10.2); recordUsage upserts + accumulates; writeAuditLog persists.
- [ ] **Step 4: 跑通** — `cd packages/data-schemas && LD_LIBRARY_PATH="..." MONGOMS_VERSION=4.4.18 npx jest src/methods/billing.spec.ts` → pass; tsc 0.
- [ ] **Step 5: commit** — `git commit -m "feat(billing): add subscription/quota/usageLog/auditLog methods"`

---

## Task 4: applyPlanChange + getActiveSubscription

**Files:** Create `packages/api/src/billing/applyPlanChange.ts`(+ `getActiveSubscription` + `SYSTEM_DEFAULT_FREE_SUBSCRIPTION`); export from `packages/api/src/index.ts`. Create `applyPlanChange.spec.ts`.

**Interfaces:**
- Consumes: subscription/quota methods (Task 3) via injected db deps (mirror how `packages/api` consumes data-schemas methods — pass them in, or require from the methods module; check how an existing `packages/api/src` module calls db methods and follow it).
- Produces: `applyPlanChange(args: PlanChangeArgs): Promise<PlanChangeResult>`, `getActiveSubscription(userId): Promise<Subscription>`, `SYSTEM_DEFAULT_FREE_SUBSCRIPTION`.

- [ ] **Step 1: 实现** — verbatim logic from [spec §4.2](../specs/2026-05-21-graupel-stage-3-plan-gating.md#42-内部行为) + §3.4: applyPlanChange = expire active → create new Subscription(period from plan: pro_m=30/pro_q=90/pro_h=180/trial=7) → create Quota(messages_used:0, period_start aligned) → return {subscription, quota, previous_plan}. getActiveSubscription = newest active/trialing/admin_granted with current_period_end>now, else `SYSTEM_DEFAULT_FREE_SUBSCRIPTION` (in-memory const, spec §3.4). Idempotency on external_ref (spec §4.3) — MVP admin path omits it. PostHog event is a TODO comment (stage 5).
- [ ] **Step 2: 失败测试** — `applyPlanChange.spec.ts` (mongodb-memory-server): grant pro_m creates active sub + zeroed quota; second grant expires the first (only one active); getActiveSubscription returns the active one, else free default; period_days derived per plan_code.
- [ ] **Step 3: 跑通** — `cd packages/api && LD_LIBRARY_PATH="..." MONGOMS_VERSION=4.4.18 npx jest src/billing/applyPlanChange.spec.ts` → pass; tsc 0. Run the §4.4 grep — only applyPlanChange writes Subscription.
- [ ] **Step 4: commit** — `git commit -m "feat(billing): add applyPlanChange entry point and getActiveSubscription"`

---

## Task 5: modelPricing + estimateCost

**Files:** Create `packages/api/src/billing/modelPricing.ts`(MODEL_PRICING + estimateCost); export. Create `modelPricing.spec.ts`.

**Interfaces — Produces:** `MODEL_PRICING: Record<string, {prompt_per_1k_cents, completion_per_1k_cents}>`, `estimateCost(modelId, {promptTokens, completionTokens}): number`(cents).

- [ ] **Step 1: 实现** — `modelPricing.ts` from spec §8.3 shape. Seed entries for the 5 providers' models present in `graupel.yaml` (read it for the model id list; if a model lacks pricing, estimateCost returns 0 + a logger.warn). estimateCost = `(prompt/1000)*prompt_per_1k + (completion/1000)*completion_per_1k`, rounded to cents.
- [ ] **Step 2: 失败测试** — known model → correct cents; unknown model → 0; zero tokens → 0.
- [ ] **Step 3: 跑通** — `cd packages/api && npx jest src/billing/modelPricing.spec.ts` → pass; tsc 0.
- [ ] **Step 4: commit** — `git commit -m "feat(billing): add modelPricing and estimateCost"`

---

## Self-Review

- **Spec 覆盖**:本 plan 覆盖 spec §3(类型/PLANS/schema/getActiveSubscription)、§4(applyPlanChange)、§8.3(modelPricing)。**不含** §5 gating、§6 admin、§7 前端、§8.1-8.4 usage 接入/cron(后续 sub-plan,本层提供其依赖的 methods/常量/入口)。
- **关键约束**:applyPlanChange 唯一写入口(§4.4 grep);atomic incrementQuota(§5.1)在 Task 3 提供+race 测试;单租户不 applyTenantIsolation。
- **模式一致**:4 schema 全沿用 note 的 factory(schema→model→methods→双注册),implementer 参考 `note.ts` 三件套。
- **类型一致**:billing 类型在 data-provider,schema 类型在 data-schemas,applyPlanChange 用两者。

## 后续 sub-plan(本 plan 之后)

1. **Gating**:`checkAccess()`(用 incrementQuota)+ 模型 costTier 配置(graupel.yaml)+ MODEL_REGISTRY + 接入 BaseClient.sendMessage
2. **Admin API + CLI**:`/admin/*` 路由 + requireRole + grant-plan.js + AuditLog 接线 + cancel 路径
3. **前端**:PlanBadge / QuotaBar / UpgradeModal / ModelLockTooltip + /account/plan
4. **Usage 接入 + cron**:recordUsage 挂 BaseClient onComplete + 每日成本告警 cron
