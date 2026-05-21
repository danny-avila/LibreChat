# Graupel Stage 4 — 营销页 + 法务页面

> **版本**: 0.1.0
> **创建日期**: 2026-05-21
> **状态**: Draft（待用户复审）
> **父 spec**: [2026-05-21-graupel-mvp-design.md](./2026-05-21-graupel-mvp-design.md)
> **预估**: 20-25 小时（约 2-2.5 周）

---

## 一、目标

打造一组对外营销 + 法务页面，让访客 5 秒内理解 Graupel 卖点，10 秒内点击 "join waitlist"（MVP 阶段没有自助订阅）。同时把 Terms / Privacy / Cancellation 法务底线打好，为阶段 6 接 Stripe 时不需要重做这些页面铺路。

页面要 SEO 友好（HTML 静态预渲染）、快速（Lighthouse Perf ≥ 90）、可分享（og:image 完整）。

---

## 二、范围与非范围

### 2.1 在范围内

- 在现有 Vite SPA 中新增 marketing routes
- SSG / 预渲染（vike 或 react-snap，二选一）
- 5 个核心页面：`/`、`/pricing`、`/terms`、`/privacy`、`/cancellation`
- `/contact` 邮件表单（提交到 Resend audience 或后端转发）
- Waitlist：landing 主 CTA → 收集邮箱 + 兴趣点 → 入 Resend audience
- SEO 基础：sitemap.xml、robots.txt、og:image、structured data
- 可分享性：Twitter / LinkedIn / Slack 预览正常

### 2.2 不在范围内

- 完整 marketing site CMS（v2）
- 多语言营销（v2，但保留 i18n 结构）
- A/B 测试（阶段 5 上线后看数据决定）
- 博客 / changelog 公开（v2）

---

## 三、技术决策

### 3.1 不引入 Next.js

Graupel 当前栈是 Vite SPA + Express。引入 Next.js 会带来：
- 双 server（Express + Next）or 大改动
- 大量回归风险
- 时间预算炸

**决策**：复用现有 Vite SPA，加 marketing routes，用预渲染插件出静态 HTML。

### 3.2 SSG 工具选型

| 工具 | 优点 | 缺点 |
|---|---|---|
| [vike](https://vike.dev/)（前 vite-plugin-ssr） | 官方维护、SSR/SSG 都支持、Vite 原生 | 引入会动 build 流程，与 LibreChat 现 setup 整合需要心智 |
| [react-snap](https://github.com/stereobooster/react-snap) | 零侵入，build 后用 puppeteer 抓静态 HTML | 已停维护多年；puppeteer 在 CI 体积大 |

**推荐**：vike（更现代，且未来可平滑切到部分页 SSR）。但如果 vike 接入超过 4 小时仍未跑通，**降级到 react-snap** 作为兜底。

### 3.3 路由策略

现有 Vite SPA 走 `react-router`，所有路由都进 SPA 入口。Marketing routes 加在同一 router 树下：

```
/                  ← marketing landing（预渲染）
/pricing           ← marketing pricing（预渲染）
/terms, /privacy   ← marketing 法务（预渲染）
/cancellation      ← marketing（预渲染）
/contact           ← marketing form（预渲染骨架）
/waitlist          ← marketing form（预渲染骨架）
/login             ← 已有，预渲染
/chat, /account/*  ← 应用页面，不预渲染（需登录）
```

vike 的 prerender API 列出要 SSG 的路由清单；其余继续 SPA 客户端渲染。

---

## 四、页面设计

### 4.1 `/` Landing

#### 结构

```
[Hero]
  Headline: Your AI Workspace, one subscription, all top models
  Subhead:  Access GPT-5, Claude Opus 4.7, Gemini 3.1 Pro, Grok 4, and more in one place.
  CTA primary:   [ Join the waitlist ]    ← 阶段 4 主 CTA
  CTA secondary: [ See pricing ]
  
[Model wall]
  Logo grid: OpenAI / Anthropic / Google / xAI / DeepSeek
  Below logos: "5 providers. 20+ models. One subscription."
  
[Feature cards × 4]
  • Multi-LLM chat — switch models mid-conversation
  • File analysis — drop in PDFs, images, docs
  • Web search — answers grounded in real-time data
  • Voice in/out — talk to AI hands-free
  
[How it works × 3 steps]
  1. Sign up with email
  2. Pick a model
  3. Get to work
  
[Why Graupel]
  vs ChatGPT Plus: more models
  vs API access: pay one bill, no token math
  vs use.ai etc: focus on overseas English market with $X positioning
  
[Pricing teaser]
  Cards from /pricing 简化版 + "see full pricing" link
  
[FAQ × 6-8]
  Pulled from common use.ai-style questions, paraphrased not copied
  
[Footer]
  Legal links / Contact / Social / Status / Cancel
```

#### 视觉

- 沿用阶段 1 配色（cool gray + ice blue）
- 字体：Inter（已有）
- 用 Framer Motion 做 hero 文字的轻量入场动画（避免炫技）
- Model logo 用各家品牌 SVG，注意每家 brand guideline——只用官方提供的品牌资产，避免商标侵权

#### 文案 source-of-truth

`client/src/locales/en/marketing.json`（独立 namespace 避免与 app 文案混）。

### 4.2 `/pricing`

```
[Pricing cards]
  Free        | Trial (post-MVP)  | Pro Monthly | Pro Quarterly | Pro Half-Year
  $0          | $1 / 7d           | $29.99/mo   | $79.99/q      | $149.99/6mo
  3 messages  | All models        | All models  | All models    | All models
  Cheap-tier  | 100 msg/mo        | 2000 msg/mo | 2000 msg/mo   | 2000 msg/mo
              | Limited features  | All features| All features  | All features
              | (coming soon)     | (coming soon)| (coming soon) | (coming soon)
              
  Primary CTA on every card during MVP: [ Join waitlist ]
  
[FAQ × 8-10]
  - What models do I get?
  - How does usage work?
  - Can I switch plans?
  - When does paid launch? → "Currently invite-only beta. Join waitlist for early access."
  - Refund policy
  - Cancellation
  - Data privacy
  - Enterprise / team plans
```

阶段 6 接入 Stripe 后，CTA 从 "Join waitlist" 切到 "Subscribe"。**Pricing 数字直接从 [stage 3 spec](./2026-05-21-graupel-stage-3-plan-gating.md) 的 PLANS 渲染**，不要硬编码——这样 PLANS 改了 pricing 页同步。

实现：构建时把 PLANS 序列化进 build artifact，pricing 页 import 静态数据；不需要 build-time API 调用。

### 4.3 `/terms` & `/privacy`

#### 来源

用 [iubenda](https://www.iubenda.com/) 或 [Termly](https://termly.io/) 生成模板（约 $9-30/月或一次性付费），再人工微调以下条款：

**`/terms` 重点条款**：
- 用户行为：禁止用 Graupel 做 illegal / abusive / spam（与 OpenAI Anthropic 各家 ToU 一致或更严）
- 知识产权：用户输入归用户所有，输出归用户所有；用户授予 Graupel 处理权（缓存、分析）
- 模型供应商免责：Graupel 仅做接口聚合，不为模型输出准确性背书
- 服务可用性：尽力而为，无 SLA（MVP 阶段）
- 终止条款：违规可立即终止；正常用户提前 30 天通知
- 法律适用：哪里登记法人就用哪里的法律（阶段 6 法人成立后改）

**`/privacy` 重点条款**：
- 收集什么数据：邮箱、对话内容、IP、UA
- 如何使用：服务运行、改进模型路由、防滥用
- 第三方：模型供应商（OpenAI/Anthropic/etc）会收到对话内容
- 数据保留：对话默认 30 天，用户可手动延长 / 导出 / 删除（GDPR 友好）
- Cookies：仅 essential（session、CSRF）；无 ad tracking（PostHog 走 anonymous mode）
- 用户权利：访问 / 删除 / 导出 / 申诉
- 联系方式：privacy@graupel.<tld>
- DPO（如必需）：阶段 6 法人成立后指定

#### 特殊条款（AI 特定）

- 模型输出免责声明（不是医疗/法律/金融建议）
- 用户输入数据可能被供应商用于训练？**默认配置应禁用供应商训练**（OpenAI / Anthropic 都支持 opt-out，配置在调用 API 时传 `data_policy` 等参数；privacy 页明确告知）
- Memory 功能（如启用）的数据保留独立于对话保留

### 4.4 `/cancellation`

MVP 期占位（无自助订阅）：

```
[Cancellation Hub]
  We're currently in invite-only beta. There's no paid subscription
  to cancel.
  
  When paid plans launch:
  - You'll be able to cancel anytime in [Account → Billing]
  - Cancellation is effective at end of current period
  - We don't offer pro-rated refunds, but you keep access until period end
  - Want to delete your account entirely? → [Delete account] (or contact us)
  
  Questions? [support@graupel.<tld>]
```

阶段 6 接 Stripe 时再补 Stripe Customer Portal 入口。

### 4.5 `/contact`

简单表单：
- Name (optional)
- Email
- Subject (dropdown: Sales / Support / Privacy / Other)
- Message (textarea)
- Submit

后端：`POST /marketing/contact` → 直接通过 Resend 发邮件给 `support@graupel.<tld>`，附原始内容；写一条 ContactSubmission record（防止 Resend 失败丢数据）。

防 spam：
- hCaptcha（[hcaptcha.com](https://www.hcaptcha.com/)，free tier 100 req/day 够用）
- 后端速率限制：每 IP 1 小时 5 次

### 4.6 `/waitlist`

集成到 landing 页 hero CTA 直接打开 modal 而不是跳页（减少摩擦）：

```
[Modal]
  Join the Graupel waitlist
  
  We're invite-only during beta. Drop your email and we'll let you in
  as soon as we have capacity.
  
  [ Email ............................. ]
  [ What do you want to use Graupel for? (optional) ]
    □ Research & writing
    □ Coding
    □ Creative work
    □ Other: ____
  
  [ Join waitlist ]
  
  By joining, you agree to receive product updates from Graupel.
  Unsubscribe anytime.
```

后端：
- `POST /marketing/waitlist` body: `{ email, interests }`
- normalize email；防枚举不重要（公开页面）
- 写到 Resend audience（用 Resend Audiences API），同时 Mongo 里写一条 WaitlistEntry record（持久化兜底）
- WaitlistEntry schema：`{ email, interests, source_referrer, source_ua, ip_hash, created_at, invited_at: Date | null }`
- 速率限制：每 IP 1 小时 3 次，每 email 1 次（已存在则更新 interests）
- 响应统一返回 200 with `{ ok: true }`，前端展示"You're on the list"卡片

阶段 5 邀请发出时，admin 后台从 WaitlistEntry 批量选 → 触发邀请邮件 → 标记 `invited_at`。

---

## 五、SEO

### 5.1 Meta tags（每页独立）

```html
<title>Graupel — One subscription, all top AI models</title>
<meta name="description" content="..." />
<meta property="og:title" content="..." />
<meta property="og:description" content="..." />
<meta property="og:image" content="https://graupel.<tld>/og/landing.png" />
<meta property="og:url" content="https://graupel.<tld>" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="canonical" href="https://graupel.<tld>" />
```

### 5.2 `og:image` 设计

4 张图：
- `og/landing.png` — Hero 视觉 + tagline
- `og/pricing.png` — Pricing cards 缩略图
- `og/share-default.png` — 兜底
- `og/about.png` — （如果有 about 页，本阶段未列入）

尺寸：1200 × 630。可用 [Vercel og-image-builder](https://og-image.vercel.app/) 或手画 Figma 模板。

### 5.3 sitemap.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://graupel.<tld>/</loc><priority>1.0</priority></url>
  <url><loc>https://graupel.<tld>/pricing</loc><priority>0.9</priority></url>
  <url><loc>https://graupel.<tld>/terms</loc><priority>0.3</priority></url>
  <url><loc>https://graupel.<tld>/privacy</loc><priority>0.3</priority></url>
  <url><loc>https://graupel.<tld>/cancellation</loc><priority>0.3</priority></url>
  <url><loc>https://graupel.<tld>/contact</loc><priority>0.5</priority></url>
</urlset>
```

build 脚本生成，不手维护。

### 5.4 `robots.txt`

```
User-agent: *
Allow: /
Disallow: /chat
Disallow: /account
Disallow: /admin
Disallow: /auth/
Sitemap: https://graupel.<tld>/sitemap.xml
```

### 5.5 Structured data

JSON-LD 嵌入页面：

- `/` 用 `Organization` + `WebSite` + `Product`
- `/pricing` 加 `OfferCatalog` 列出每个 plan 的 `Offer`

不依赖结构化数据，但 Google 富搜结果会用上。

---

## 六、性能

### 6.1 目标

- Lighthouse Performance ≥ 90（mobile + desktop）
- Lighthouse SEO ≥ 90
- Lighthouse Accessibility ≥ 90
- LCP < 2s
- 主页 HTML payload < 60KB（gzipped）

### 6.2 优化清单

- 图片用 AVIF / WebP，原 PNG 兜底；用 `<picture>` 自适应
- Logo wall 用内联 SVG（避免 N 个 HTTP 请求）
- 字体子集化（只载用得到的字符）+ font-display: swap
- 不在 marketing 页 bundle 里 import chat 应用代码（Vite code-splitting）
- 给 marketing routes 单独 bundle（vike 自动支持）
- og:image 图本身要 < 200KB（影响社交平台抓取速度）
- HTTP/2 + Brotli（Cloudflare 自动开）

### 6.3 可访问性

- 所有图都有 alt（model logos 写品牌名）
- 表单 label 明确
- 颜色对比度 ≥ 4.5:1（用 [coolors.co contrast checker](https://coolors.co/contrast-checker)）
- 键盘可达：所有交互元素 Tab 顺序合理
- ARIA：modal 用 `aria-modal="true"`，焦点管理正确

---

## 七、风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| vike 接入冲突 LibreChat 现有 build | 中 | 4 小时尝试上限；超时切换 react-snap 兜底 |
| 法务模板生成的 ToS / Privacy 不符合 GDPR | 严重 | 上线前找一位接触过 GDPR 的同行/律师朋友过一遍；预算允许的话花 $200-500 找 [TermsFeed](https://www.termsfeed.com/) 或当地律师 review |
| Model logo 商标问题 | 低 | 只用官方品牌资产、保持 brand guideline 比例；如有顾虑，改用文字"OpenAI / Anthropic / ..." 而非 logo |
| 营销文案与 use.ai 雷同被指控 | 低 | brainstorm 阶段已经摘了 use.ai 文案，作为 anti-pattern 用，不要照抄；自己重新表述 |
| Waitlist API 被刷暴 | 低 | hCaptcha + 速率限制；写入 Mongo 而非只 Resend 减少外部依赖 |
| 法务页和实际产品不一致（例如 privacy 写"对话存 30 天"但代码并未实现） | 中 | 法务条款必须有对应代码 / 配置兜底；阶段 4 完成时同步开"数据保留实现"工单到阶段 5 |

---

## 八、测试与验收

### 8.1 自动化

- Lighthouse CI 跑在 5 个核心页面，阈值 ≥ 90
- Playwright E2E：waitlist 提交 → Resend audience 验证 → Mongo 验证（用真实 Resend test key）
- 链接死链扫描：build 后 `linkinator` 全站爬一遍，零 404

### 8.2 手动

| 场景 | 预期 |
|---|---|
| Twitter 分享 https://graupel.<tld> | 显示正确 og:image + 标题 + 描述 |
| LinkedIn 分享 | 同上 |
| Slack unfurl | 同上 |
| 移动端 / iPhone 视图 | 全部页面无横向滚动、按钮可点 |
| 屏幕阅读器（VoiceOver）跑一遍 landing | 所有元素可读、跳转顺序合理 |
| 刷新 /pricing 直接打开（不通过 SPA 路由） | 直出静态 HTML 内容（验证 SSG 生效） |
| 关 JS 后访问 /pricing | 内容仍可读（验证非依赖 client hydration） |
| /privacy 和实际产品行为一致 | 列出的"30 天数据保留"等条款在阶段 5 真有实现或 backlog |
| Waitlist 提交后查看 Resend audience | 邮箱出现且 interests tag 正确 |

### 8.3 验收清单

- [ ] 5 个核心页面 + waitlist + contact 全部上线
- [ ] Lighthouse Perf / SEO / A11y 三项 ≥ 90（移动 + 桌面）
- [ ] og:image 三平台预览正常
- [ ] sitemap.xml + robots.txt 正确
- [ ] structured data 通过 [Google Rich Results Test](https://search.google.com/test/rich-results)
- [ ] 法务条款 review 完毕（即使是自审）
- [ ] Waitlist E2E 跑通（提交 → Resend + Mongo 双写）
- [ ] Pricing 数据从 PLANS 渲染而非硬编码

---

## 九、交付物

- `client/src/marketing/`：Landing、Pricing、Terms、Privacy、Cancellation、Contact、Waitlist 7 个页面
- vike 配置 + `prerender.ts` 列出预渲染路由
- `client/public/og/*.png`：4 张 og 图
- `client/public/sitemap.xml`、`robots.txt`
- `packages/api/src/marketing/`：waitlist 路由、contact 路由、Resend audience 集成
- `packages/data-schemas/src/schema/`：waitlistEntry.ts、contactSubmission.ts
- `client/src/locales/en/marketing.json`：营销文案
- `docs/marketing-pages.md`：法务条款来源 + 法务 review 记录 + 数据保留对应实现工单链接

---

## 十、衔接

**前置依赖**：
- 阶段 3 完成（PLANS 配置稳定，Pricing 页可从中渲染）
- Resend audiences API 已开通
- hCaptcha 账号

**后置触发**：阶段 5（上线 + 监控）。阶段 5 假设：
- waitlist 已经在收集邮箱
- 营销页已上线，flow 闭环为：访问 landing → join waitlist → admin 邀请 → 注册激活 → 监控漏斗

阶段 6 接 Stripe 时本阶段需做的小改动：
- pricing 页 CTA 从 "Join waitlist" 切到 "Subscribe"
- /cancellation 页加 Stripe Customer Portal 链接
- /privacy 加 "支付数据由 Stripe 处理"段落

---

## 十一、版本与变更

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-05-21 | 0.1.0 | 初稿 |
