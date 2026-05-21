# Graupel Stage 1 — Fork + 品牌剥离 + 部署管线

> **版本**: 0.1.0
> **创建日期**: 2026-05-21
> **状态**: Draft（待用户复审）
> **父 spec**: [2026-05-21-graupel-mvp-design.md](./2026-05-21-graupel-mvp-design.md)
> **预算**: 25-30 小时（约 2.5-3 周）

---

## 一、目标

把 LibreChat 上游 fork 成一个跑在自己域名、贴着 Graupel 品牌、零 LibreChat 痕迹的可运行版本，并搭好"push main → 5 分钟内自动上线"的 CI/CD 管线。

完成后，访客打开 `graupel.<tld>` 看到的应是一个名叫 Graupel 的 AI 工作台，可以注册（Local 密码或 Google）、登录、和 GPT/Claude/Gemini 聊天，HTTPS 自动续期，没有任何 "LibreChat" 字样。

---

## 二、范围与非范围

### 2.1 在范围内

- Fork 仓库 + 上游 remote 配置
- 全局品牌字符串替换（含代码、配置、文档、邮件模板、UI 文案）
- 视觉资产替换（logo、favicon、og 图、配色）
- 删除不需要的登录策略和 endpoint 代码
- 简化配置文件 `librechat.example.yaml` → `graupel.yaml`
- 部署管线：Hetzner + Coolify + Cloudflare（DNS/CDN/TLS）+ R2 + MongoDB Atlas
- GitHub Actions 自动部署
- 域名上线、HTTPS 证书自动续期

### 2.2 不在范围内（推到后续阶段）

- 邮件魔链登录（阶段 2）
- Plan / 配额 / Gating（阶段 3）
- 营销页 / 法务页（阶段 4）
- Sentry / PostHog / 备份（阶段 5）
- Stripe 与计费（阶段 6）

---

## 三、前置确认（开工前必须完成）

| 项 | 行动 | 阻塞性 |
|---|---|---|
| LibreChat 许可证 | 复核 LICENSE 是否允许商业 fork（已知是 [ISC + 名称使用限制](https://github.com/danny-avila/LibreChat#license)；`LibreChat` 名称受保护，所以必须改名） | 阻塞 |
| 模型供应商 ToU | 阅读 OpenAI / Anthropic / Google / xAI / DeepSeek 的"reseller / wrapper"条款，确认是否允许聚合订阅二次售卖；如不允许某家，需 BYOK 模式备选 | 阻塞 |
| 域名所有权 | `graupel.<tld>` 已购，登记到 Cloudflare 接管 DNS | 阻塞 |
| Hetzner 账号 | 注册 + 实名 + 加信用卡，开 CCX13 实例 | 阻塞 |
| MongoDB Atlas 账号 | 注册 + 创建 free tier cluster（dev 用） | 阻塞 |
| Cloudflare R2 | 开通 R2、生成 access key | 阻塞 |
| Resend 账号 | 注册 + 验证发信域名（提前给阶段 2 用） | 非阻塞，但越早做越好 |

---

## 四、关键任务分解

### 4.1 仓库初始化

1. 在 GitHub 用户账号下点 "Fork" `danny-avila/LibreChat` → 重命名为 `graupel`（settings → rename）
2. 本地 clone：
   ```bash
   git clone git@github.com:<user>/graupel.git
   cd graupel
   git remote add upstream git@github.com:danny-avila/LibreChat.git
   git fetch upstream
   ```
3. 验证 `git remote -v` 输出 origin（自己 fork）+ upstream
4. 创建分支 `stage-1/fork-rebrand`，所有改动走 PR 合回 main

**同步策略文档**：在仓库根加一份 `UPSTREAM.md` 简述：
- 仅 cherry-pick 安全 / bugfix 类 commit
- 不周期 merge upstream main
- 每月 1 次 review upstream changelog 决定是否 cherry-pick

### 4.2 品牌字符串全局替换

#### 4.2.1 用 ripgrep 摸清范围

```bash
rg -i 'librechat' --stats > /tmp/librechat-references.txt
rg -i 'libre chat' --stats >> /tmp/librechat-references.txt
```

预期命中：`package.json`、`README.md`、`config/`、`api/`、`client/src/`、邮件模板、错误页、og 图、`.env.example`、CI 文件等。

#### 4.2.2 分类替换

按风险从低到高的顺序：

**A. 配置 / metadata**（低风险，纯文本）
- `package.json` 所有 workspace 的 `name` / `description`
- `README.md`、`CHANGELOG.md`（保留 LibreChat 原始历史，加 Graupel fork 记录）
- `.github/`、`turbo.json`、CI 配置里的项目名
- `librechat.example.yaml` → `graupel.yaml`（同时改默认 endpoint 名 `LIBRECHAT_*` → `GRAUPEL_*`）

**B. 用户可见文本**（中风险，要对照截图）
- 所有 `client/src/locales/*/translation.json` 里的品牌字符串（**只改 en**，其他语言交给翻译流程，但要标记为 stale）
- HTML title / meta、错误页文案
- 邮件模板（验证邮件、密码重置）
- 浏览器 manifest（`<link rel="manifest">`）

**C. 域名 / URL**（中风险）
- `LIBRECHAT_*` 环境变量名 → `GRAUPEL_*`，`.env.example` 同步
- 文档里的 librechat.ai 链接

**D. 代码内部命名**（高风险，可能影响行为）
- 谨慎判断：类名、函数名里包含 `LibreChat` 的，是否真的需要改？
- 原则：**只改对外可见的**。内部数据库 collection 名、内部函数名如果包含 `librechat`，保留不动以减少风险——已存在的数据迁移成本不值得为了完美而付出。
- Logger 的 service name、Sentry tag 等可改可不改，倾向于改成 `graupel` 方便区分。

#### 4.2.3 验证替换完整性

```bash
rg -i 'librechat' . --glob '!node_modules' --glob '!*.lock' --glob '!UPSTREAM.md' --glob '!CHANGELOG.md'
```

剩余命中应当只是：
- UPSTREAM.md / CHANGELOG.md 里追溯 fork 关系的文字
- 内部代码（按 4.2.2 D 决定保留的部分）

如果有意外残留，逐个判断是否需要改。

### 4.3 视觉资产替换

#### 4.3.1 设计草稿

阶段 1 不做精致 brand book，先用临时但一致的视觉：

- **Logo**: 一个简洁文字 mark（`Graupel` 字样 + 一颗六角"软雹"图标，可用 [Iconoir](https://iconoir.com/) 的 snowflake / hexagon 改）
- **配色**: 主色 cool gray + 一抹 ice blue（与"软雹"语义一致），用 Tailwind 标准色（`slate` + `sky`）开局
- **字体**: 直接用 LibreChat 已有的（Inter 或 system stack），不引新字体

#### 4.3.2 替换文件清单

| 文件 | 用途 |
|---|---|
| `client/public/assets/favicon-32x32.png` / `favicon-16x16.png` | 浏览器 tab 图标 |
| `client/public/apple-touch-icon.png` | iOS 添加到主屏 |
| `client/public/manifest.webmanifest` | PWA manifest（含 name、icons、theme_color） |
| `client/public/og-image.png` | 默认社交分享图 |
| `client/public/robots.txt` | 改成 Graupel + sitemap URL（sitemap 阶段 4 加） |
| `client/src/components/svg/Logo.tsx`（或类似） | 顶部导航 logo |
| 邮件模板里的 logo 引用 | 阶段 2 重点处理，本阶段先把临时 logo URL 替进去 |

#### 4.3.3 配色

不动 Tailwind theme 文件结构，仅在 `tailwind.config.js` 的 `theme.extend.colors` 里加一组 brand color，把 LibreChat 原有 brand color 替换为 Graupel 自己的；其他 design tokens 保留以减少回归风险。

### 4.4 删除不需要的代码

#### 4.4.1 登录策略代码

砍掉：Discord、Apple、Facebook、SAML、LDAP、OpenID。

按需在 `api/server/socialLogins/` 下逐个删除策略文件、对应路由、对应前端按钮组件、对应 `.env` 引用、对应文档段落。

**保留**：Local（密码）、Google、GitHub、Magic Link（阶段 2 加）。

#### 4.4.2 Endpoint 代码

砍掉：Bedrock、Vertex、Ollama、OpenAI Assistants。

涉及：
- `api/server/services/Endpoints/<endpoint>/` 整个目录
- `packages/data-provider/src/config.ts` 里的 endpoint 类型（保留枚举值兼容性，但实现剥离）
- 配置文件里的相关字段
- 前端 endpoint 选择器里隐藏入口
- 文档段落删除

**注意**：Endpoint 枚举值（`EModelEndpoint`）是 schema 字段，老对话可能引用。删枚举会破坏老数据反序列化——更稳妥的做法是**保留枚举但移除实现/UI 入口**，等阶段 5 上线一段时间后再考虑彻底清理。

#### 4.4.3 配置精简

`librechat.example.yaml` 复制为 `graupel.yaml.example`，只保留 MVP 要开放的：
- OpenAI（GPT-5 系列）
- Anthropic（Claude Opus / Sonnet / Haiku 4.x 系列）
- Google（Gemini 3.x）
- xAI（Grok 3.x / 4）
- DeepSeek

每个模型先**不加 `costTier` 字段**（阶段 3 才用）；本阶段保持配置最小可跑。

### 4.5 部署管线

#### 4.5.1 Hetzner 实例

- 选 Hetzner Cloud CCX13（专用 vCPU，2c/8g/80gb，~$13/月）
- 装 Ubuntu 22.04 LTS
- 通过 Coolify 一键脚本安装 Coolify
- 在 Hetzner Cloud Firewall 只放行 22 / 80 / 443
- 用户从本地用 SSH key 登入；禁用密码登录

#### 4.5.2 Coolify 项目配置

- 在 Coolify 新建一个 application，类型 Docker Compose
- 仓库 source: `github.com/<user>/graupel`，分支 `main`
- 把 LibreChat 自带的 `docker-compose.yml` 改名为 `graupel-compose.yml`，调整：
  - 服务名 `librechat-api` → `graupel-api`
  - image tag 改成自己 build 的（Coolify 会负责）
  - 卷名前缀改 graupel
- Coolify Webhook URL → 配置到 GitHub repo Settings → Webhooks
- 环境变量在 Coolify UI 设置（Mongo URI、API keys、JWT secrets 等）；**不要进 git**

#### 4.5.3 Cloudflare DNS / TLS

- 在 Cloudflare 把 `graupel.<tld>` nameserver 接管
- 加一条 A 记录指向 Hetzner 公网 IP
- TLS 走 Cloudflare 边缘证书（Full strict 模式）+ Coolify 自带 Let's Encrypt 双层兜底
- 开 "Always Use HTTPS"
- HSTS 阶段 5 再开（避免上线初期出错锁死）

#### 4.5.4 Cloudflare R2 替换文件存储

- LibreChat 默认是 Firebase / 本地存储，改成 S3 兼容的 R2
- 在 Coolify 环境变量里设：
  - `STORAGE_PROVIDER=s3`（或 LibreChat 对应的 key）
  - `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`
  - `S3_BUCKET=graupel-uploads-prod`
  - `S3_ACCESS_KEY` / `S3_SECRET_KEY`
- 在 R2 dashboard 创建 bucket、设 public 不开（私有，签名 URL 访问）
- 测试上传一张图，验证签名 URL 可访问、TTL 生效

#### 4.5.5 MongoDB Atlas

- 创建 free tier M0 cluster（dev 期）
- 设白名单 IP 为 Hetzner 实例公网 IP（不要 0.0.0.0/0）
- 创建独立的 database user `graupel-app`，权限 readWrite on `graupel` 数据库
- 把 connection string 配到 Coolify 环境变量
- 上线时升级到 M10（~$60/月，提供备份和 dedicated 资源）—— 这个升级由阶段 5 触发

#### 4.5.6 GitHub Actions 自动部署

`.github/workflows/deploy.yml`：

```yaml
on:
  push:
    branches: [main]
jobs:
  trigger-coolify:
    runs-on: ubuntu-latest
    steps:
      - name: POST to Coolify webhook
        run: curl -fsS -X POST ${{ secrets.COOLIFY_DEPLOY_WEBHOOK }}
```

配 secret `COOLIFY_DEPLOY_WEBHOOK` 为 Coolify 给的 deploy URL。

也保留 build / test 工作流（运行 `npm run build`、`cd api && npx jest`、`cd packages/api && npx jest`），失败阻塞合并。

---

## 五、风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 全局替换误伤 schema 字段名导致老数据无法读 | 严重 | 只改用户可见字符串和配置；schema/数据库内部命名保留 |
| 删除 endpoint 代码破坏老对话反序列化 | 中 | 保留 `EModelEndpoint` 枚举值，仅移除实现和 UI 入口 |
| Coolify webhook 被恶意触发反复部署 | 低 | webhook URL 用 secret token；GitHub IP 白名单（未来阶段 5 加） |
| Cloudflare + Let's Encrypt 双证书冲突 | 中 | Cloudflare 用 Full strict，Coolify 出口仍带 LE 证书做边到边加密；测试时用 https://www.ssllabs.com/ssltest/ 跑一遍 |
| MongoDB Atlas free tier 资源不足导致登录卡顿 | 低 | 仅 dev 用；阶段 5 上线前升 M10 |
| 全局替换有遗漏（角落里的 librechat 字样上线被人发现） | 中 | 上线前 ripgrep 扫一次 + 浏览所有面向用户的页面、邮件、错误状态人工 review |

---

## 六、验收标准

- [ ] `git remote -v` 同时显示 origin 和 upstream
- [ ] 仓库根目录有 `UPSTREAM.md` 文档说明同步策略
- [ ] `rg -i librechat` 在用户可见区（README、UI、邮件、og、配置示例）零命中
- [ ] `graupel.<tld>` 可访问，TLS A 级（[ssllabs.com](https://www.ssllabs.com/ssltest/)）
- [ ] 注册 + 登录（Local 密码 / Google / GitHub）三条路径正常
- [ ] 与 GPT-5 / Claude / Gemini 各跑一段对话不报错
- [ ] 上传一张图片到对话能持久化（R2 验证）+ 重启服务后仍可下载
- [ ] push 一个 trivial commit 到 main，5 分钟内 Coolify 完成部署
- [ ] HTTPS 证书在 Cloudflare 和 Coolify 双层都自动续期（手动模拟把证书过期或检查 cron）
- [ ] favicon、og 图、manifest 三处品牌一致

---

## 七、交付物

- `github.com/<user>/graupel` 仓库（fork from LibreChat），main 分支可部署
- `graupel.<tld>` 在线、HTTPS、零品牌泄漏
- Coolify 实例运行中、webhook 触发正常
- R2 bucket 跑文件上传
- MongoDB Atlas dev cluster 跑数据
- `UPSTREAM.md`、`graupel.yaml.example`、`.env.example` 三份文档完整

---

## 八、依赖与衔接

**前置依赖**：三、前置确认全部 ✅

**后置触发**：本阶段完成 → 阶段 2（邮件魔链登录）开工。阶段 2 假设：
- Resend 账号 + 发信域名已就绪
- 部署管线可用（Coolify 加环境变量重启即可）
- 数据库可写入新 collection

---

## 九、版本与变更

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-05-21 | 0.1.0 | 初稿 |
