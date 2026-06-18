# 完成 Stage 1 删减:砍 Graph/SharePoint + 彻底清 OpenID 登录残留

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 把 stage 1 没做干净的端点/auth 删减真正完成 —— 砍掉 Microsoft Graph / SharePoint / Entra 集成,并清掉 OpenID 登录的全部残留(stage 1 删了 `openidStrategy.js` 却留下多处 `require` → 启动即 `MODULE_NOT_FOUND`),让换肤后的 main 能干净启动、测试通过、零悬空引用。

**Architecture:** 从当前 main 切工作分支 `chore/finish-stage-1`,merge `stage-1/fork-rebrand`(换肤+已删社交登录),在其上分 task 砍除+清理+验证,最后 ff 合并回 main。不在过时的 stage-1 分支上做,也不让 main 中途处于 broken 状态。

**Tech Stack:** JS(api/)+ TypeScript(packages/)+ React(client/)。Jest(后端测试用 no-AVX 前缀 `LD_LIBRARY_PATH="$HOME/.local/ssl1.1/usr/lib/x86_64-linux-gnu" MONGOMS_VERSION=4.4.18`)。

## Global Constraints

- **保住本地 people-search**:`searchPrincipals` 是 local + entra 两条独立路径,只删 entra 分支,`db.searchPrincipals`(本地)必须完整保留(共享权限的 people-picker 依赖它)。
- **不 bulk 删 `OPENID_REUSE_TOKENS` 条件块**:该 env 在 8+ 处用,多数有非-OpenID 分支必须保留(refresh/logout/image-validation)。只删 Graph/OpenID-login 专属逻辑。
- **删 `packages/api/src/utils/graph.ts` 前**:先 grep 确认没有 MCP server 配置使用 `{{LIBRECHAT_GRAPH_ACCESS_TOKEN}}` 占位符(该机制是通用 MCP 功能,非仅 SharePoint)。Graupel 无 Entra 登录 → 占位符永远无法解析 → 删除是正确行为,但要确认现有配置没依赖它。
- **每个改动后 grep 验证零悬空**(见各 task 验证 + Task 5 总验证)。
- 删文件 + 清引用要同步;不留孤儿 import。

## 删除/编辑总清单来源

本 plan 的删除/编辑项基于一次 exhaustive 摸排(file:line 精确)。**因为执行在 merge stage 1 之后的状态上,而摸排基于 main,stage 1 可能已删掉部分文件(如 OpenID 登录 UI/strategy)** —— 每个 task 的实现者**先 grep 核实当前是否存在,再删改**,map 作为起点而非盲目照搬。

---

## Task 0(controller 前置,非 subagent):建分支 + merge + 解决文本冲突

- [ ] 建工作分支并发起 merge:
```bash
cd /data/lidongyu/projects/LibreChat
git checkout main && git checkout -b chore/finish-stage-1
git merge --no-ff stage-1/fork-rebrand   # 产生 6 个冲突
```
- [ ] 解决 6 个冲突:
  - `api/strategies/openidStrategy.js` / `openidStrategy.spec.js` / `openIdJwtStrategy.spec.js`(modify/delete)→ **取删除**(`git rm`),OpenID 登录整体要砍。
  - `api/server/socialLogins.js`(content)→ 取 stage 1 版本(删 Discord/FB/Apple/SAML/LDAP/OpenID wiring,保留 Google/GitHub/local)。
  - `.env.example`(content)→ 合并:保留 main 新增 env + stage 1 删社交/OpenID env。
  - `client/src/components/Chat/Footer.tsx`(content)→ 两边都在去 LibreChat,取 Graupel 品牌版。
- [ ] `git commit`(此时仍 broken:Graph 等还 require 已删的 openidStrategy。后续 task 修)。记录此 commit 为 BASE。

> 此 task 由 controller 手工完成(merge 冲突需判断),不派 subagent。

---

## Task 1:砍 SharePoint 前端

**Files — 删除:**
- `client/src/components/SharePoint/SharePointPickerDialog.tsx`、`client/src/components/SharePoint/index.ts`
- `client/src/hooks/Files/useSharePointPicker.ts`、`useSharePointToken.ts`、`useSharePointDownload.ts`、`useSharePointFileHandling.ts`
- `client/src/data-provider/Files/sharepoint.ts`
- `client/src/components/SidePanel/Agents/config.ts`(全文件是 SharePoint picker 配置类型 `ExtFilters`/`IItem`/`SPPickerConfig` —— 先确认无其他非-SharePoint 导出,再删)
- `packages/client/src/svgs/SharePointIcon.tsx`

**Files — 编辑(去引用):**
- `client/src/data-provider/Files/index.ts`:删 `export * from './sharepoint'`
- `client/src/hooks/Files/index.ts`:删 4 个 SharePoint hook 导出
- `client/src/components/Chat/Input/Files/AttachFileMenu.tsx`:删 SharePointIcon/hook/Dialog import、`sharePointEnabled`/dialog state、菜单项 push、`<SharePointPickerDialog>` 渲染
- `client/src/components/SidePanel/Agents/FileContext.tsx` 和 `FileSearch.tsx`:同上(去 SharePoint import/state/菜单项/渲染)
- `packages/client/src/svgs/index.ts`:删 `export { default as SharePointIcon }`
- `client/src/data-provider/Auth/queries.ts`:删 `useGraphTokenQuery`(保 `useGetUserQuery`)
- 测试:`AttachFileMenu.spec.tsx`、`FileContext.spec.tsx`、`FileSearch.spec.tsx` 去 SharePoint mock/用例

- [ ] **实现**:先 `grep -rn "SharePoint\|sharepoint\|useSharePoint\|graphToken" client/src packages/client/src` 列出当前所有引用,逐个删除文件 + 清引用。
- [ ] **验证**:
  - `grep -rn "SharePoint\|sharepoint\|useSharePoint" client/src packages/client/src --include=*.ts --include=*.tsx | grep -v node_modules` → 空
  - `cd /data/lidongyu/projects/LibreChat && npx eslint client/src/components/Chat/Input/Files/AttachFileMenu.tsx client/src/components/SidePanel/Agents/FileContext.tsx client/src/components/SidePanel/Agents/FileSearch.tsx` → exit 0
  - 相关前端测试(`cd client && npx jest AttachFileMenu FileContext FileSearch`)→ 过
- [ ] **commit**:`refactor(stage1): remove SharePoint file picker frontend`

---

## Task 2:砍 Graph 后端 + Entra people-search(保 local)

**Files — 删除:**
- `api/server/services/GraphApiService.js`、`GraphTokenService.js`、`GraphApiService.spec.js`

**Files — 编辑:**
- `api/server/controllers/AuthController.js`:删 GraphTokenService import + `graphTokenController` 函数 + 其 export
- `api/server/routes/auth.js`:删 `graphTokenController` import + `/graph-token` 路由
- `api/server/controllers/PermissionsController.js`:删 `entraIdPrincipalFeatureEnabled`/`searchEntraIdPrincipals` import;在 `searchPrincipals` 删 `useEntraId` 块 + `if (useEntraId && ...)` 整段;响应 `sources` 去 entra;`source` 判断恒 `'local'`。**保留 `db.searchPrincipals` 本地路径**。
- `api/server/services/PermissionService.js`:删 6 个 GraphApiService import;删 `ensurePrincipalExists` 的 entra guard;删 `ensureGroupPrincipalExists` 的 `source === 'entra'` 块(保 local 路径);删 `syncUserEntraGroupMemberships` 函数 + export
- `api/server/routes/config.js`:删 `sharePointFilePickerEnabled` + 4 个 SharePoint config 字段
- `api/package.json`:删 `@microsoft/microsoft-graph-client` 依赖
- 测试:`PermissionService.spec.js`(去 entra import/mock + `syncUserEntraGroupMemberships` describe)、`PermissionsController.spec.js`(去 entra mock)、`AuthController.spec.js`(去 graph-token 测试)、`config.spec.js`(去 sharePoint 断言)

- [ ] **实现**:先 `grep -rn "GraphApiService\|GraphTokenService\|entraId\|searchEntraId\|syncUserEntra" api/server --include=*.js | grep -v node_modules` 列引用,删服务 + 清引用,**逐一确认本地 people-search 路径未动**。
- [ ] **验证**:
  - `grep -rn "GraphApiService\|GraphTokenService\|entraIdPrincipal\|searchEntraId\|syncUserEntra" api/server --include=*.js | grep -v ".spec.js"` → 空
  - `grep -rn "db.searchPrincipals\|searchPrincipals" api/server --include=*.js | grep -v spec` → 仍在(本地保留)
  - `cd /data/lidongyu/projects/LibreChat && LD_LIBRARY_PATH="$HOME/.local/ssl1.1/usr/lib/x86_64-linux-gnu" MONGOMS_VERSION=4.4.18` 跑 `cd api && npx jest PermissionService PermissionsController` → 过
  - `npx eslint api/server/controllers/PermissionsController.js api/server/services/PermissionService.js api/server/routes/auth.js api/server/routes/config.js` → exit 0
- [ ] **commit**:`refactor(stage1): remove Microsoft Graph services and Entra people-search`

---

## Task 3:清 OpenID 登录残留 + Graph 占位符机制

> 前提:Task 0 已 `git rm` openidStrategy.js/.spec/openIdJwtStrategy.spec。本 task 清掉所有还 `require` 它的地方 + OpenID 登录分支。**注意 Global Constraints:OPENID_REUSE_TOKENS 不 bulk 删,只删 OpenID-login/Graph 专属逻辑。**

**Files — 编辑:**
- `api/server/controllers/auth/oauth.js`:删 `syncUserEntraGroupMemberships` import;把 OpenID 分支替换为只 `setAuthTokens`(Graupel 无 OpenID 登录)
- `api/server/services/MCP.js`:删 `getGraphApiToken` import + `graphTokenResolver` 选项
- `packages/api/src/mcp/MCPManager.ts`:删 `GraphTokenResolver` import、`preProcessGraphTokens` import、`graphTokenResolver` 参数/选项、`preProcessGraphTokens` 调用块(改用 rawConfig 直传,同 isDbSourced 分支)
- `packages/api/src/utils/oidc.ts`:删 `GRAPH_TOKEN_PLACEHOLDER`、`DEFAULT_GRAPH_SCOPES` 常量(保留其余 OpenID-MCP-env 处理函数,`env.ts` 仍用)
- `packages/api/src/utils/graph.ts` + `graph.spec.ts`:**删除**(先按 Global Constraints grep 确认无 MCP 配置用 GRAPH_ACCESS_TOKEN 占位符)
- `packages/api/src/utils/index.ts`:删 `export * from './graph'`
- `api/server/controllers/AuthController.js`(refresh)、`LogoutController.js`、`api/server/controllers/admin/auth.js`:删/改其中 `getOpenIdConfig`/openidStrategy 相关的 OpenID-login 分支(这些路径在 Graupel 无 OpenID 登录下是死的;删 OpenID 分支,保留 local/其他 provider 分支)
- `api/server/socialLogins.js`:删 `setupOpenId`(若 Task 0 未完全去除);确认 passport 无 `openidJwt` 注册残留
- 测试:`MCP.spec.js`(去 GraphTokenService mock)、`MCPManager.test.ts` + `mcp.spec.ts`(去 graphTokenResolver 用例)、`oauth.spec.js`(去 syncUserEntra mock/用例)

- [ ] **实现**:`grep -rn "openidStrategy\|openIdJwtStrategy\|getOpenIdConfig\|graphTokenResolver\|preProcessGraphTokens\|GRAPH_TOKEN_PLACEHOLDER" api packages --include=*.js --include=*.ts | grep -v node_modules` 列全部,逐一清理。每删一个 OpenID-login 分支,确认保留了 local/google/github 分支。
- [ ] **验证**(关键:启动不崩):
  - `grep -rn "openidStrategy\|openIdJwtStrategy\|getOpenIdConfig\|graphTokenResolver\|preProcessGraphTokens\|GRAPH_TOKEN_PLACEHOLDER" api packages --include=*.js --include=*.ts | grep -v node_modules | grep -v ".spec\|__tests__\|.test."` → 空
  - 模块可加载(无 MODULE_NOT_FOUND):`cd /data/lidongyu/projects/LibreChat && node -e "require('./api/server/routes/auth')" && node -e "require('./api/server/controllers/AuthController')"` → 无报错
  - `cd api && LD_LIBRARY_PATH="..." MONGOMS_VERSION=4.4.18 npx jest MCP oauth AuthController` → 过
  - `cd packages/api && npx tsc -p tsconfig.json --noEmit` → exit 0;`cd packages/api && npx jest src/mcp` → 过
- [ ] **commit**:`refactor(stage1): remove OpenID login remnants and Graph token placeholder`

---

## Task 4:清 types / config / schema / locales 收尾

**Files — 删除:** `packages/data-provider/src/types/graph.ts`(TGraph* 类型)

**Files — 编辑:**
- `packages/data-provider/src/config.ts`:删 4 个 SharePoint `TStartupConfig` 属性
- `packages/data-provider/src/api-endpoints.ts`:删 `graphToken` endpoint
- `packages/data-provider/src/data-service.ts`:删 `getGraphApiToken`
- `packages/data-provider/src/keys.ts`:删 `graphToken` QueryKey
- `packages/data-provider/src/types/queries.ts`:删 `GraphTokenParams`/`GraphTokenResponse`;`PrincipalSearchResponse.sources` 去 `entra`
- `packages/data-provider/src/accessPermissions.ts`:`source` enum/类型去 `'entra'`(保 `'local'`)
- `packages/data-schemas/src/schema/group.ts`:`enum: ['local','entra']` → `['local']`(**注意 Explore 风险#7**:若 DB 已有 `source:'entra'` 记录会校验失败 —— 本 MVP 无 Entra 登录、不应有此类记录,但实现者确认后再收紧;如有顾虑保留 enum 但代码不再写入 entra)
- `packages/data-schemas/src/types/group.ts`:`source` 联合类型去 `'entra'`
- `packages/api/src/index.ts`:删 graph 相关 re-export(若有)
- locales:16 个 `client/src/locales/*/translation.json` 删 7 个 SharePoint/download keys(`com_files_download_*`、`com_files_sharepoint_picker_title`、`com_files_upload_sharepoint`)。**仅改英文 key 是项目惯例,但这是删除已有 key,16 语言同删以免孤儿**。

- [ ] **实现**:grep 核实后逐一删改。
- [ ] **验证**:
  - `grep -rn "TGraph\|graphToken\|sharePointFilePicker\|'entra'\|\"entra\"" packages/data-provider/src packages/data-schemas/src --include=*.ts` → 仅剩合理项(如 legacy 注释),无活引用
  - `npm run build:data-provider` → 成功;`cd packages/data-schemas && npx tsc -p tsconfig.json --noEmit` → 0
  - `grep -rn "com_files_sharepoint\|com_files_upload_sharepoint" client/src/locales` → 空
- [ ] **commit**:`refactor(stage1): drop Graph/SharePoint types, config and locale keys`

---

## Task 5(controller):全面验证 + 合并 main

- [ ] 跑全部"零悬空"验证 grep(Task 1-4 的 grep 全空)。
- [ ] 后端关键入口可加载:`node -e "require('./api/server')"`(或最小启动检查)无 MODULE_NOT_FOUND。
- [ ] 跑受影响测试套件(api + packages),lint + typecheck 全绿。
- [ ] 换肤抽查:`grep -ril "librechat" client/src --include=*.tsx | head`(仅剩合理的内部引用)、`package.json` name = graupel-chat。
- [ ] 合并:`git checkout main && git merge --ff-only chore/finish-stage-1`(ff,因为 chore 从 main 切+加 commit)。
- [ ] **不 push**,先报告 controller 复验结果,push main 由人确认。

---

## Self-Review

- **覆盖**:对照 §删除/编辑总清单,Task 1(SharePoint 前端)/2(Graph 后端+Entra)/3(OpenID 残留+Graph 占位符)/4(types/config/locales)覆盖摸排的 A 删除 + B 27 编辑 + E 测试更新;C(local people-search)在 Task 2 明确保留;D 验证命令分散到各 task + Task 5。
- **风险**:Global Constraints 锁定三个关键陷阱(local search、OPENID_REUSE_TOKENS 非 Graph 分支、Graph 占位符通用性);group schema enum 收紧带 DB 记录风险提示。
- **基线差异**:每 task 要求"先 grep 核实当前引用再删改",处理 merge 后状态与摸排(基于 main)的差异。

## 执行说明

Task 0 与 Task 5 由 controller 手工做(merge 冲突 + 合并 main 需判断);Task 1-4 派 subagent 实现 + 每 task 两段式 review。Task 顺序:0 → 1/2/3/4(2 依赖 3 的 openid 上下文,建议 2→3 顺序;1、4 可较独立)→ 5。
