# Graupel Stage 5 — 上线、监控、漏斗

> **版本**: 0.1.0
> **创建日期**: 2026-05-21
> **状态**: Draft（待用户复审）
> **父 spec**: [2026-05-21-graupel-mvp-design.md](./2026-05-21-graupel-mvp-design.md)
> **预估**: 15-20 小时（约 1.5-2 周）

---

## 一、目标

把前 4 阶段的产出打磨到可以正式 invite-only 上线的状态：可观测（Sentry / PostHog）、可恢复（备份 + 演练）、可挽回流失（邮件自动化 + waitlist 邀请闭环）、可对外发声（status page + soft launch 渠道）。

完成后 Graupel 进入 invite-only beta，跑 1-2 月收集留存与活跃度数据，验证产品 fit，再决定是否启动阶段 6 接 Stripe。

---

## 二、范围与非范围

### 2.1 在范围内

- Sentry 前后端错误聚合 + 告警
- PostHog 漏斗 + 关键事件埋点
- MongoDB 备份 + 每周恢复演练
- Resend 邮件营销自动化（欢迎、waitlist 确认、邀请、流失挽回）
- Status page（Better Stack 或 Cronitor）
- Admin 后台：waitlist 邀请批处理 + 用户活跃监控
- 数据保留实现（与阶段 4 法务页对齐）
- Soft launch 准备：Indie Hackers / Product Hunt / Show HN 物料
- `/healthz`、`/readyz` 健康检查端点接入 Coolify + status page

### 2.2 不在范围内

- Stripe 接入与付费指标（阶段 6）
- 多区域部署 / 高可用（v2，根据用户增长决定）
- Customer Support 工单系统（v2，先用 support@ 邮箱兜底）
- Multi-language 营销页（v2）

---

## 三、监控 & 告警

### 3.1 Sentry

#### 接入

- 注册 Sentry org（free tier 5K events/月）
- 创建两个 project：`graupel-backend`（Node）、`graupel-frontend`（React）
- DSN 走环境变量 `SENTRY_DSN_BACKEND`、`SENTRY_DSN_FRONTEND`，注入到 Coolify 与 client build

#### 后端集成

```ts
// packages/api/src/observability/sentry.ts
import * as Sentry from '@sentry/node';
Sentry.init({
  dsn: process.env.SENTRY_DSN_BACKEND,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,                  // 10% transaction 采样
  profilesSampleRate: 0.1,
  beforeSend(event) {
    // 移除 PII：邮箱、对话内容
    return scrubPII(event);
  },
});
```

`scrubPII` 黑名单：
- `request.body.email` → `[REDACTED]`
- `request.body.message`、`response.body.message` → `[REDACTED]`
- IP → 仅保留 /24 网段（如 `203.0.113.42` → `203.0.113.0/24`）

#### 前端集成

```ts
// client/src/observability/sentry.ts
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN_FRONTEND,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 0.05,
  replaysSessionSampleRate: 0,            // 不录 session（隐私 + 成本）
  replaysOnErrorSampleRate: 0.1,          // 仅错误时录 10%
  beforeSend(event) {
    return scrubPII(event);
  },
});
```

#### 告警规则

- Backend 任意 5xx → 邮件告警（即时）
- Frontend unhandled error 1 分钟 > 10 次 → 邮件
- 数据库连接错误 → 邮件 + Slack（Slack 阶段晚期再加）
- 模型 SDK 调用失败率 1 小时 > 20% → 邮件（说明某家供应商可能出问题）

### 3.2 PostHog

#### 接入

- 注册 PostHog cloud（free 1M events/月）
- 创建 project，token 走环境变量

#### 漏斗设计（MVP 期 invite-only）

```
1. landing_visited     ← marketing 页面 PV
2. waitlist_joined     ← /waitlist 提交成功
3. invite_sent         ← admin 操作触发
4. invite_clicked      ← 邀请邮件链接 click
5. login_completed     ← 魔链 verify 成功
6. first_message_sent  ← 用户在 /chat 发出第一条消息（核心激活事件）
7. day7_active         ← D7 仍活跃（cohort 表，不是单事件）
```

漏斗在 PostHog UI 配置 funnel：1 → 6（激活漏斗），跨度 30 天。

#### 关键事件埋点

| 事件 | 触发位置 | 关键属性 |
|---|---|---|
| `landing_visited` | 自动（PostHog autocapture） | path, referrer |
| `waitlist_joined` | `POST /marketing/waitlist` 成功 | interests[], source |
| `invite_sent` | admin 后台批量发邀请 | batch_size |
| `invite_clicked` | 邀请邮件链接 → 落 /login?invite=xxx | invite_id |
| `login_completed` | 魔链 verify 成功 | user_id, signup vs signin |
| `model_used` | 模型调用入口 | model_id, plan_code, latency_ms, success |
| `quota_exceeded` | gating 抛 402 时 | plan_code, limit_type |
| `plan_changed` | applyPlanChange 内部 | from_plan, to_plan, source, granted_by |
| `first_message_sent` | 用户首次发消息 | model_id |
| `feature_used` | image gen / voice / web search 等使用时 | feature_name |
| `error_shown` | 前端展示 error toast 时 | error_code |

#### 注意

- 用户 distinct_id 用 `user._id`（登录后）+ anonymous PostHog id（未登录）；登录时调 `posthog.identify(user._id)` 合并
- 不发送 PII（邮箱、对话内容）—— PostHog properties 严格 allowlist

### 3.3 健康检查

加两个端点（如果 LibreChat 没现成，本阶段补；查仓库 git log 看到 `🩺 feat: Add Explicit Readiness Endpoints (#13212)` 已合，复用即可）：

- `GET /healthz` — 进程存活，返回 200 + `{ status: 'ok' }`
- `GET /readyz` — 依赖就绪（Mongo、Resend、R2 探活），返回 200 / 503

接到 Coolify 的 health check + status page 监测。

---

## 四、备份 & 灾难恢复

### 4.1 MongoDB 备份策略

#### 多层备份

- **第一层**：MongoDB Atlas 自带快照（M10+ 提供，每 6 小时自动）
- **第二层**：每日 mongodump 到 R2（保留 30 天）
- **第三层**：每周一恢复演练（自动化脚本）

#### `mongodump` 任务

```bash
# scripts/backup/dump-to-r2.sh
DATE=$(date -u +%Y%m%d-%H%M%S)
mongodump --uri="$MONGO_URI" --gzip --archive=/tmp/graupel-${DATE}.archive.gz
aws s3 cp /tmp/graupel-${DATE}.archive.gz \
    s3://graupel-backups-prod/$(date +%Y/%m)/graupel-${DATE}.archive.gz \
    --endpoint-url=$R2_ENDPOINT
rm /tmp/graupel-${DATE}.archive.gz
```

加到 Coolify scheduled task / 主机 cron，每日 03:00 UTC 跑。

#### 自动恢复演练

每周一 04:00 UTC 跑 `scripts/backup/restore-test.sh`：

1. 从 R2 拉最新 dump
2. 还原到独立 staging Mongo（Atlas 上单独建一个 staging cluster）
3. 跑一组 sanity checks：
   - User collection 行数 > 0
   - Subscription 字段完整
   - 最新 LoginToken 时间戳合理
4. 清理 staging
5. 任一 check 失败 → Sentry 告警

### 4.2 R2 文件

- R2 自带 versioning 开启
- 关键 bucket（用户上传、备份）保留 30 天版本
- 不做跨区域复制（成本与必要性不匹配）

### 4.3 配置 / Secrets

- Coolify 环境变量定期手动导出（`coolify secrets export` 或 UI 截图），存到 1Password / Bitwarden vault
- 切换主机 / 重装 Coolify 时凭 vault 恢复

### 4.4 Runbook

`docs/runbook-disaster-recovery.md`：

- 数据库丢数据：从 Atlas 快照还原 → 缺失窗口用 R2 mongodump 补
- 主机宕机：开新 Hetzner 实例 → Coolify install → 从 git + R2 + vault 重组
- DNS 故障：备用 nameserver（Cloudflare 自带 4 个 NS，单点故障概率低）
- 单家模型供应商挂：在 yaml 里临时禁用，前端展示 "service degraded"

每个步骤可执行命令 + 预期时间。

---

## 五、邮件自动化（Resend）

### 5.1 模板清单

| 触发 | 模板 | 内容要点 |
|---|---|---|
| 新用户首次登录 | `welcome.tsx` | 欢迎、quick start 3 步、support 联系 |
| Waitlist 提交 | `waitlist-confirm.tsx` | 确认收到、说明邀请节奏（1-2 周一批） |
| Invite 发出 | `invite.tsx` | 邀请链接（带预填邮箱直接走魔链）、plan 内容、有效期 7 天 |
| Day-7 不活跃 | `inactive-7d.tsx` | 友好提醒、推荐使用场景、unsubscribe |
| Plan changed by admin | `plan-updated.tsx` | 新 plan 内容、配额、生效时间 |

阶段 6 接 Stripe 后再补：trial start / trial ending / payment failed / cancellation 4 个模板。

### 5.2 触发机制

- 用户登录、waitlist 提交、admin 操作 → 直接在业务代码里同步触发
- Day-7 不活跃 → cron 每日扫一次：`User.find({ last_active_at: { $lt: now - 7d, $gt: now - 8d } })`
- 用户的"上次发邮件时间戳"记录在 `user.email_engagement.{template}.last_sent_at`，避免重复打扰

### 5.3 Unsubscribe

- 营销邮件（welcome、inactive、plan-updated）必须有 unsubscribe link
- Resend 自带 unsubscribe header；同时邮件底部明显文字链接
- 事务邮件（魔链、邀请）不需要 unsubscribe（用户主动触发的）
- `user.email_preferences.{marketing|transactional}` 控制是否发送，unsubscribe 触发后置 marketing=false

### 5.4 Deliverability 监测

- Resend dashboard 看 bounce rate、complaint rate
- bounce > 5% 或 complaint > 0.1% 立即停发并 review
- Postmaster Tools（Google）每周看一次

---

## 六、Admin 后台增强

阶段 3 已有 admin API，本阶段加最小 UI（在 `/admin/*` 路由下）：

### 6.1 Waitlist 批量邀请

```
[Waitlist Inbox]
  Filter: [interests checkbox] [date range] [invited: yes/no/all]
  
  [ ] [check all] | email | interests | joined | invited at
  ─────────────────────────────────────────────────
  [ ] alice@x.com  | research, code | 2d ago | -
  [ ] bob@y.com    | creative       | 1d ago | -
  ...
  
  [ Invite selected (N) with plan: [trial ▼] [period: 7 days]  ]
```

点击触发：
1. 对每个 selected entry 调 `applyPlanChange()` grant trial
2. 触发邀请邮件
3. 标记 `invited_at`
4. 写 AuditLog

### 6.2 用户活跃监控

```
[Users]
  Search: [email or name]   Filter: [plan_code ▼]
  
  email          | plan      | last_active   | msg this period | total cost
  alice@x.com    | trial     | 1h ago        | 23/100          | $0.42
  bob@y.com      | free      | 5d ago        | 3/3             | $0.01
  ...
  
  Click row → user detail page
```

User detail 页显示：
- Subscription 历史（来自 Subscription collection）
- Quota 当期使用
- UsageLog 按 model 分组（最近 30 天）
- AuditLog 涉及该 user 的操作历史
- 操作按钮：grant plan、cancel plan、reset quota、send password reset link、impersonate（dev only）

### 6.3 全局成本仪表

```
[Cost Dashboard]
  Today / Week / Month
  
  Total estimated cost: $42.18
  Active users: 87
  Avg cost per user: $0.48
  
  [Stacked bar by model]
  [Top 10 users by cost this period]
  [Anomaly alerts]
```

数据来自 UsageLog aggregate。

### 6.4 鉴权

复用阶段 3 的 `requireRole('ADMIN')` middleware。

UI 嵌入主 SPA 但走独立 layout（无 chat 侧栏，专注 admin 任务）。

---

## 七、Soft Launch 准备

### 7.1 Status Page

- 选 [Better Stack](https://betterstack.com/status-pages) free（10 monitors，包含 https + ping，30s 间隔）
- Monitors：
  - https://graupel.<tld>/healthz
  - https://graupel.<tld>/readyz
  - https://api.openai.com/v1/models（模型供应商兜底）
  - https://api.anthropic.com/v1/messages（同上）
- 公开 URL：status.graupel.<tld>，加到 footer 链接
- 故障时自动发 incident 邮件给订阅用户

### 7.2 Soft Launch 渠道物料

#### Indie Hackers

- 在 [indiehackers.com](https://www.indiehackers.com/) 发一篇 "I built Graupel — one subscription, all top AI models" 帖
- 内容：背景（一人兼职）、动机（自己用 use.ai 觉得好但贵 / 同质化机会）、技术栈、当前指标、向社区求反馈
- 可附 waitlist 链接（不要太硬卖）

#### Product Hunt（不急于发，等阶段 6 接 Stripe 后效果更好）

- 准备物料：截图 4 张（landing / chat / pricing / model wall）、demo 视频 60s、taglines 3 条
- 选 Tuesday-Thursday 发，避开周末

#### Show HN（Hacker News）

- "Show HN: Graupel — fork of LibreChat as a multi-LLM SaaS"
- 重点讲技术决策和开源 fork 故事，HN 用户喜欢 transparency
- 准备应对 "this is just a wrapper" 的回应：列差异化（waitlist 故事、cost gating 设计、upcoming features）

#### Twitter / X

- 个人账号发布（用户已有跟随者最好）
- 串：1. 背景；2. 卖点；3. 当前指标；4. waitlist 链接

### 7.3 Beta 用户预期管理

- Welcome 邮件明确："this is invite-only beta, expect rough edges"
- /chat 顶部加一个可关闭的 banner："You're using Graupel beta — found a bug? <a href='mailto:support'>Tell us</a>"
- 收集反馈：考虑接 [Canny](https://canny.io/) free tier 或简单的 Google Form

---

## 八、数据保留实现

阶段 4 法务页明示了数据保留策略，本阶段实现：

### 8.1 对话默认 30 天

- Conversation schema 加 `expires_at: Date`（默认 created_at + 30 天）
- TTL 索引自动清理
- 用户可在 `/account/data` 页看每个 conversation 剩余时间，可手动延长 / 设永久 / 立即删除
- 删除是软删（`deleted_at` 字段），90 天后真删（合规、防止误操作）

### 8.2 Memory 数据独立

- LibreChat Memory 功能（如启用）走单独 schema，保留期延后 v2 决定（先永久，但用户可手动删）

### 8.3 用户导出 / 删除（GDPR）

- `GET /account/export` → 异步任务、生成 ZIP 含所有 conversations + user metadata + UsageLog 摘要 → R2 临时签名 URL → 邮件用户下载
- `DELETE /account` → 软删 user + cascading 软删所有 conversations / subscriptions → 90 天后真删（含 PII anonymization）

### 8.4 PostHog / Sentry 数据

- PostHog: 用户删账号时调 [PostHog delete person API](https://posthog.com/docs/api/people#delete-person) 触发删除
- Sentry: PII 已经在 beforeSend 里 scrub；用户删账号不需要再删 Sentry

---

## 九、风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| Sentry events 5K/月 free tier 上线后超量 | 中（账单意外） | 上线初期紧盯 events 数；超量先优化（采样率降低 / 抑制噪音 error）再考虑付费 |
| PostHog 1M events/月不够 | 低 | autocapture 关闭、关键事件白名单；超过再升 |
| 备份恢复演练自动化脚本本身有 bug，假装"恢复成功" | 严重 | 演练脚本要做实际数据 sanity check（不止 connection 测试，要查真实 collection 行数 / 字段） |
| Resend 邮件被误判为 spam（尤其大批 invite） | 中 | 分批发（一次不超 100 封），观察 bounce / complaint；提前预热发信域名 |
| Soft launch 流量爆，单台 CCX13 扛不住 | 中 | Coolify 容易加节点；准备一份 "scale up to CCX23" runbook；Cloudflare CDN 兜底静态资源 |
| Status page 自身宕机 | 低 | Better Stack 自带高可用 |
| Admin UI 被未授权访问 | 严重 | 路由层 IP 白名单 + role check 双层；操作全部进 AuditLog |
| 数据保留策略与法务页不一致 | 严重（法律风险） | 验收清单强制要求每条法务条款都有对应代码 / 配置 / 文档 |

---

## 十、验收标准

- [ ] Sentry 后端 + 前端接入；触发一个测试错误能在 Sentry 看到 + 邮件告警
- [ ] PostHog 接入；激活漏斗 5 步全部能在 funnel 视图里看到事件
- [ ] `/healthz` + `/readyz` 端点 OK，Coolify health check 接入，status page 4 个 monitor 全绿
- [ ] mongodump 每日跑、R2 看到归档；恢复演练成功 1 次
- [ ] Resend 5 封模板邮件全部能触发 + mail-tester ≥ 9/10
- [ ] Admin UI 三块（waitlist / users / cost）全部可用
- [ ] Waitlist 批量邀请闭环测试通过（自己用真实邮箱跑一次：waitlist → admin invite → 收到邮件 → 点击 → 登录 → 用 trial plan）
- [ ] 数据保留实现：30 天 TTL + 用户删除 + 用户导出三条路径都能跑
- [ ] Soft launch 物料就绪（IH 帖草稿、PH 截图、Show HN 草稿、Twitter 串）
- [ ] 首批 invite 发出（建议 20-30 人，自己 network 内）
- [ ] 7 天后 review 留存数据决定下一步

---

## 十一、交付物

- 监控接入：Sentry × 2 project、PostHog × 1 project
- 备份脚本 + 演练脚本 + runbook
- 5 封 Resend 邮件模板
- Admin UI 三页（waitlist / users / cost）
- Status page 公开 URL
- 数据保留实现 + GDPR 导出/删除路径
- Soft launch 物料文档
- `docs/runbook-disaster-recovery.md`、`docs/observability.md`

---

## 十二、衔接

**前置依赖**：
- 阶段 1-4 全部完成
- Resend、Sentry、PostHog、Better Stack 账号就绪
- waitlist 已经在收集（阶段 4）

**后置触发**：
- 进入 invite-only beta
- 1-2 月后基于留存数据决定是否启动**阶段 6**（Stripe + 自助订阅）
- 阶段 6 不在本 spec 范围；启动条件：MVP 30 天目标（[design.md §7.2](./2026-05-21-graupel-mvp-design.md#72-mvpinvite-only-beta30-天目标)）达成 ≥ 70%

---

## 十三、版本与变更

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-05-21 | 0.1.0 | 初稿 |
