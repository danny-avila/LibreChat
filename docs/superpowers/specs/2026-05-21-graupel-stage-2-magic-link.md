# Graupel Stage 2 — 邮件魔链登录

> **版本**: 0.1.0
> **创建日期**: 2026-05-21
> **状态**: Draft（待用户复审）
> **父 spec**: [2026-05-21-graupel-mvp-design.md](./2026-05-21-graupel-mvp-design.md)
> **预估**: 20-25 小时（约 2-2.5 周）

---

## 一、目标

落地"用户输入邮箱 → 收链接 → 点击即登录"的无密码注册/登录路径，把 Local 密码登录降为兜底。同时把 Resend 集成做扎实，让阶段 5 的营销/事务邮件可以直接复用。

---

## 二、范围与非范围

### 2.1 在范围内

- Resend SDK 集成 + 发信域名 SPF/DKIM/DMARC 配置
- `LoginToken` schema + 索引 + TTL
- `magicLink` service（生成/校验/邮件触发）
- `POST /auth/magic/request` + `GET /auth/magic/verify` 路由
- 速率限制（per-email + per-IP）
- 防枚举：邮箱不存在也返回 200
- 前端登录页改造（魔链为主，密码为折叠兜底）
- 首次登录 onboarding modal（展示名 + 模型偏好提示）
- 邮件模板（HTML + 纯文本双版）

### 2.2 不在范围内

- Plan / 配额相关（阶段 3）
- 营销邮件 / 自动化（阶段 5）
- Onboarding 后的引导教程（阶段 4 营销页统一处理）
- "Sign in with Google" / GitHub 登录改造（阶段 1 已存在的不动）

---

## 三、前置确认

| 项 | 行动 | 阻塞性 |
|---|---|---|
| Resend 账号 | 注册 + 创建 API key（限制为 sandbox 测试 key + production key 各一） | 阻塞 |
| 发信域名 | 在 Cloudflare DNS 加 SPF / DKIM / DMARC（Resend dashboard 给出 record） | 阻塞 |
| 发信邮箱 | 选 `noreply@graupel.<tld>` 作 from；保留 `support@graupel.<tld>` 做 reply-to | 阻塞 |
| 阶段 1 部署管线已就绪 | Coolify 实例可加环境变量 + 重启 | 阻塞 |

---

## 四、技术设计

### 4.1 数据模型

[packages/data-schemas/](../../packages/data-schemas/) 新增 `LoginToken` schema：

```ts
interface LoginToken {
  type: 'magic_link';                    // 预留扩展（password_reset 等）
  user_email: string;                    // 已 normalize: 全小写 + trim
  token_hash: string;                    // bcrypt(token) — 数据库永远不存明文
  expires_at: Date;                      // now + 15 min
  used_at: Date | null;                  // null 未使用，Date 已使用（用于审计）
  request_ip_hash: string;               // sha256(ip + secret_salt)，便于滥用追溯且不存原始 IP
  request_ua: string;                    // 截断到 256 字节
  created_at: Date;
}

// MongoDB 索引：
// 1. { token_hash: 1 } unique          — 校验时按 hash 命中
// 2. { user_email: 1, created_at: -1 } — 速率限制查询
// 3. { expires_at: 1 } TTL              — 自动清理过期记录（15 分钟后）
// 4. { used_at: 1 } sparse              — 用于审计已使用的 token
```

**为什么不直接复用 LibreChat 自带的密码重置 token？**

LibreChat 的 password-reset token 表语义不同（绑定已有用户、重置密码用途、TTL 1h）。混用会让"已注册 / 未注册"分支变复杂，并且魔链需要"邮箱不存在也返回 200"的防枚举行为，重置不需要。两套独立模型反而更清晰。

### 4.2 Token 生成与校验

```ts
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

// 生成（在 service 里）
const plaintext = randomBytes(32).toString('base64url'); // 43 字符
const tokenHash = await bcrypt.hash(plaintext, 12);
await LoginToken.create({ /* ... */ token_hash: tokenHash });
const link = `https://graupel.<tld>/auth/magic/verify?token=${plaintext}`;

// 校验（在路由里）
// ⚠️ bcrypt 不能直接 findOne by hash，因为 bcrypt 每次 hash 不同；
// 必须遍历同邮箱的活跃 token 逐个 compare。
// 解决方案：在 token 里编码 user_email，verify 时按 email 拿候选集，再 bcrypt.compare 逐个比对。
//
// 折中方案（推荐）：使用 SHA-256 而非 bcrypt — token 本身已是 256-bit 高熵随机串，
// 不需要慢哈希抗暴力（暴力破解 token 不现实）；SHA-256 允许直接 findOne by hash。

import { createHash } from 'node:crypto';
const tokenHash = createHash('sha256').update(plaintext).digest('hex');
// findOne({ token_hash: tokenHash, used_at: null, expires_at: { $gt: new Date() } })
```

**最终选型**：用 SHA-256 而非 bcrypt。原因：
- token 本身是 32 字节高熵随机串，离线暴力不可行
- SHA-256 让 `findOne({ token_hash })` 成为 O(1) 索引查询
- bcrypt 的"慢哈希抵抗暴力"价值在弱密码场景，对随机 token 是不必要开销且阻碍索引

### 4.3 路由设计

#### 4.3.1 `POST /auth/magic/request`

请求 body：`{ email: string }`

流程：
1. **输入校验**：email 格式合法（用 `email-validator` 或 zod 的 email schema）；不合法返回 400
2. **normalize**：trim、toLowerCase
3. **速率限制**（中间件）：
   - 每 email：1 分钟内最多 3 次（用 Redis ZSET 或 Mongo 临时 collection 统计 `created_at` 滑窗）
   - 每 IP：1 小时内最多 10 次
   - 命中限制返回 429（明确返回，不混入 200，让攻击者无法刷）
4. **生成 token + 入库**：上面 4.2 流程
5. **触发 Resend 发邮件**：
   - **不阻塞响应**：用 fire-and-forget 模式（`void sendMagicLinkEmail(...).catch(logger.error)`），但同步等到 token 入库成功
   - 邮件失败不向用户暴露（避免邮箱枚举：能发 vs 不能发暴露邮箱是否存在）
6. **响应**：永远返回 `200 { ok: true }`，不区分邮箱是否注册过（防枚举）

**注意**：MVP 不区分 sign-up 与 sign-in：
- 邮件链接被点击时，如果 user 不存在 → 创建 user
- 如果 user 存在 → 登录已有账号
- 这样 `/auth/magic/request` 完全不需要查 user collection，进一步降低枚举风险

#### 4.3.2 `GET /auth/magic/verify?token=<plaintext>`

流程：
1. 从 query 取 token
2. 计算 sha256(token) → 查 LoginToken
3. **缺失/过期/已用 → 重定向到 `/login?error=invalid_or_expired_link`**（不抛 4xx，让前端展示友好页）
4. 命中：
   - 把 token 标记为 `used_at = now()`（防止双重使用，**先标记再创建 user**，原子性确保哪怕用户连点两次只生效一次）
   - 用 `findOneAndUpdate` 配合 `used_at: null` 条件做 atomic claim
   - 找用户：`User.findOne({ email: token.user_email })`
     - 不存在 → 创建（默认 displayName 取 email 前缀；emailVerified=true，因为魔链本身是验证）
     - 存在 → 直接用
   - 发 session cookie（沿用 LibreChat 既有 JWT/session 机制；SameSite=Lax、HttpOnly、Secure）
   - 重定向到 `/chat`（首次用户带 `?welcome=1` query 触发 onboarding modal）

#### 4.3.3 速率限制实现

LibreChat 项目里已经有 [express-rate-limit](https://www.npmjs.com/package/express-rate-limit) 和 Redis 连接，复用即可。

```ts
// per-email limiter（key 是 normalized email）
const emailLimiter = rateLimit({
  windowMs: 60_000,
  max: 3,
  keyGenerator: (req) => normalizeEmail(req.body.email),
  message: { error: 'Too many requests, try again in a minute' },
  standardHeaders: true,
});

// per-IP limiter（key 是 client IP）
const ipLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 10,
  keyGenerator: (req) => req.ip,
});

router.post('/auth/magic/request', emailLimiter, ipLimiter, handler);
```

**注意**：在 Cloudflare 后面，必须设 `app.set('trust proxy', 1)`（或对应 IP），否则 `req.ip` 永远是 Cloudflare 的 IP 导致 IP 限制失效。

### 4.4 邮件模板

Resend 支持 React Email：

```tsx
// packages/api/src/emails/MagicLinkEmail.tsx
export const MagicLinkEmail = ({ link, expiresInMin = 15 }) => (
  <Html>
    <Body>
      <Container>
        <Img src="https://graupel.<tld>/assets/email-logo.png" alt="Graupel" />
        <Heading>Sign in to Graupel</Heading>
        <Text>Click the button below to sign in. This link expires in {expiresInMin} minutes.</Text>
        <Button href={link}>Sign in</Button>
        <Text>If you didn't request this, you can safely ignore this email.</Text>
        <Text>Or copy this link: {link}</Text>
      </Container>
    </Body>
  </Html>
);
```

要点：
- HTML + 纯文本双版（Resend 会自动从 React Email 生成纯文本版）
- 主题：`Sign in to Graupel`（避免 spam-trigger 词汇如 "click here"）
- from: `Graupel <noreply@graupel.<tld>>`，reply-to: `support@graupel.<tld>`
- 链接里的 token 不可加 utm 参数（避免被 prefetch 工具误触发消耗 token）

### 4.5 前端改造

#### 4.5.1 `/login` 页面

替换为：

```
┌────────────────────────────────────┐
│         [Graupel logo]             │
│                                    │
│  Welcome to Graupel                │
│  Sign in to access all top AI      │
│  models in one place               │
│                                    │
│  [ Email                       ]   │
│                                    │
│  [   Send sign-in link    ]        │
│                                    │
│  ──── or ────                      │
│                                    │
│  [G] Continue with Google          │
│  [⌘] Continue with GitHub          │
│                                    │
│  Sign in with password (折叠链接)  │
└────────────────────────────────────┘
```

提交后切换到"check your email"卡片：

```
┌────────────────────────────────────┐
│  📬 Check your email               │
│                                    │
│  We sent a sign-in link to         │
│  user@example.com                  │
│                                    │
│  The link expires in 15 minutes.   │
│                                    │
│  Didn't get it? [Try again]        │
│  Wrong email? [Use different]      │
└────────────────────────────────────┘
```

#### 4.5.2 Onboarding modal

verify 成功重定向 `/chat?welcome=1` → 前端检测 query → 弹一次 modal：

- 输入展示名（默认从 email 前缀填）
- 选择常用模型偏好（不强制，用于个性化默认 endpoint，**用户可跳过**）
- 接受 ToS/Privacy 单 checkbox（必须勾，阶段 4 法务页存在后此 checkbox 链向 /terms /privacy）

modal 关闭后 `?welcome=1` 用 `replaceState` 移除避免刷新再弹。

#### 4.5.3 i18n 文案

只在 `client/src/locales/en/translation.json` 加新 key（其他语言 stale）：
- `com_auth_magic_link_send`
- `com_auth_magic_link_check_email`
- `com_auth_magic_link_expired`
- `com_auth_magic_link_invalid`
- `com_auth_password_fallback`
- `com_onboarding_welcome_title`
- ...

### 4.6 安全细节

| 关注点 | 措施 |
|---|---|
| Token 偷窃 | HTTPS only；URL 不出现在 referer（设置 `Referrer-Policy: no-referrer`） |
| Email 邮件被代理预读触发消费 | 链接是 GET 但需要点击——某些企业邮件防火墙会主动 fetch 链接做安全检查，导致 token 被消耗。**缓解**：verify 路由收到请求后展示一个"Click to sign in"中间页，真正消费 token 的是中间页里的 form POST，预读仅触发 GET 不消费 |
| 邮箱拼写错误注册 | 不阻塞——按"邮件是验证手段"逻辑，错邮箱收不到链接，不会建出错误 user |
| Token 重放 | `used_at` atomic claim 防止 |
| Token 暴力枚举 | 32 字节高熵随机 + per-IP 速率限制，碰撞与暴力都不可行 |
| 邮箱枚举 | request 路由对存在与不存在邮箱返回相同响应；**邮件实际是否发送也不让外部观察到差异**（不论存在与否都走相同的 token 生成 + 发邮件流程，user collection 在 verify 阶段才查询） |

**邮件预读问题的中间页方案**：

```
GET /auth/magic/verify?token=<t>
  ↓ 查 token，未消费 → 渲染 HTML 页面
  
HTML 中间页：
  ┌──────────────────────────────────┐
  │  Sign in to Graupel              │
  │                                  │
  │  Click below to complete sign-in │
  │  on this device.                 │
  │                                  │
  │  [   Continue   ]                │
  └──────────────────────────────────┘

POST /auth/magic/verify?token=<t>
  ↓ 真正消费 token
  Set-Cookie + redirect /chat
```

预读机器人通常只发 GET，不会真的点击 button 触发 POST，token 因此不被消费。

---

## 五、风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| Resend 邮件落 spam | 阻塞用户登录 | 上线前用 [mail-tester.com](https://www.mail-tester.com/) 跑分；SPF/DKIM/DMARC 完全配置；预热发信域名（前两周限量发） |
| 邮件预读消费 token | 用户点击时已 expired | 4.6 节中间页方案；同时把"重发链接"按钮做明显 |
| 速率限制在 Cloudflare 后失效 | IP 限制无效 | 设 `app.set('trust proxy', 1)` + 验证 `req.ip` 取的是真实 IP |
| 邮箱大小写差异导致重复账号 | user 数据重复 | normalize 强制 lower + 唯一索引 `{ email: 1 } unique` 在 user collection |
| 老 LibreChat 用户已存在密码登录账号，魔链能否登入同一账号 | 数据混淆 | verify 用 email 匹配现有 user，不区分注册渠道；同一 email 永远是一个 user |
| 用户邮箱拼错 → 收不到 → 频繁重发 | 体验差 | "check your email" 卡片明显显示输入的邮箱；提供 "wrong email" 链接退回 |
| 用户在 Gmail/Outlook 等点击安全扫描后又点击真实链接 → 已消费 | 中 | 中间页方案缓解；同时 verify 失败页明确提示"link already used or expired, click to send a new one" |

---

## 六、测试策略

### 6.1 单元测试（`cd packages/api && npx jest`）

- token 生成长度、字符集、SHA-256 hash 一致性
- normalize email：大小写、首尾空格、Unicode 边界
- 速率限制中间件：超阈值返回 429，未超阈值放行
- LoginToken atomic claim：并发两次 verify 同一 token，只有一次成功

### 6.2 集成测试（`mongodb-memory-server`）

- 完整请求 → 入库 → verify → 创建 user → 发 cookie 流程
- 过期 token 校验失败
- 已用 token 校验失败
- email 不存在场景仍返回 200（防枚举）
- 速率限制窗口滑动正确

### 6.3 端到端手动测试

| 场景 | 预期 |
|---|---|
| 新邮箱完整注册流程 | onboarding 弹出 |
| 已注册邮箱再次魔链登录 | 直接进 /chat 无 onboarding |
| 链接在不同浏览器打开（电脑请求 → 手机点击） | 手机能登录，cookie 在手机生效 |
| 链接在 incognito 窗口打开 | 同上 |
| 故意点两次链接 | 第二次显示 "already used" 友好页 |
| 等待 16 分钟后点击 | 显示 "expired" 友好页 |
| 1 分钟内对同邮箱发 4 次请求 | 第 4 次 429 |
| 故意填不存在的邮箱 | 仍显示 "check your email" 卡片（不暴露不存在） |
| 邮件源码 view（在 Gmail "show original"）| SPF/DKIM/DMARC 全 pass |

### 6.4 安全验证

- 用 Burp Suite / Caido 抓包验证：response 不泄漏邮箱是否存在的差异（响应大小、时间一致）
- 用 [security headers 扫描器](https://securityheaders.com/) 验证 `/login` 页 Referrer-Policy

---

## 七、验收标准

- [ ] Resend 发信域名 SPF/DKIM/DMARC 三项全 pass（mail-tester.com ≥ 9/10）
- [ ] LoginToken schema 落库 + 全部索引就位
- [ ] 单元 + 集成测试覆盖率 ≥ 80%（service + 路由）
- [ ] 防枚举行为：对存在和不存在邮箱响应完全一致（包括响应时间，差值 < 50ms）
- [ ] 速率限制可在 Cloudflare 后真实生效（伪造 X-Forwarded-For 不能绕过）
- [ ] 端到端 8 个手动场景全部通过
- [ ] 前端登录页 Lighthouse Accessibility ≥ 95
- [ ] Local 密码登录降级为折叠链接，但仍可工作（兜底）
- [ ] Onboarding modal 仅首次登录弹出（user record `onboarding_completed_at` 字段记录）

---

## 八、交付物

- `LoginToken` schema + 索引（packages/data-schemas）
- `magicLink` service（packages/api）
- 两条路由（packages/api + api 薄包装）
- Resend 集成 module + 邮件模板
- 前端改造：登录页、check-email 卡片、onboarding modal、Local 折叠
- 单元/集成测试套件
- 文档：`docs/auth-magic-link.md` 简述实现 + 运维注意点

---

## 九、衔接

**前置依赖**：阶段 1 上线、Resend + 发信域名就绪

**后置触发**：本阶段完成 → 阶段 3（Plan/配额/Gating）。阶段 3 假设：
- user collection 里所有用户都有有效 email（魔链注册保证）
- 邀请用户可以走"先注册账号 → admin 后台开 plan"路径
- email 通讯渠道已经稳定（阶段 5 营销邮件直接复用）

---

## 十、版本与变更

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-05-21 | 0.1.0 | 初稿 |
