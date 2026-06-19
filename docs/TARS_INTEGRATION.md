# pwc_tars 整合說明

本 repo 是 **LibreChat 作為 `pwc_tars` 產品(UI/UX 層)** 的整合版本。`pwc_tars`(`/Users/liaopoyu/Downloads/pwc_tars`)已具備 LLM 服務、知識庫、SQL agent 等後端能力

- **pwc_tars 是認證與使用者/權限的來源**;LibreChat 不重實作,而是對接。
- **pwc_tars 技術棧**:Flask + PostgreSQL(SQLAlchemy)+ JWT;認證入口 `POST /api/auth/login`,以 **`username`** 登入。
- **整合原則**:LibreChat 端維持薄轉接層(`/api` 的 JS wrapper 呼叫 `packages/api` 的 TS 邏輯),**不**把 LibreChat 的 MongoDB 使用者庫換成 PostgreSQL —— 所有下游功能(對話、檔案、agents、餘額、權限)都以 MongoDB `User._id` 為外鍵。改採「驗證 pwc_tars + 在本地建立連動的影子使用者」。

> 詳細的工作區邊界、程式風格、rebuild 規則見根目錄 [CLAUDE.md](../CLAUDE.md)。

---

## 目前已整合的功能

| 功能 | 說明 | 關鍵檔案 |
|---|---|---|
| **登入委派** | 登入改打 pwc_tars Flask `POST /api/auth/login` 驗證帳密,成功後由 LibreChat 自簽 JWT + refresh | `packages/api/src/auth/tars.ts`、`api/strategies/tarsStrategy.js` |
| **影子使用者** | 驗證成功在 MongoDB 建立/同步一筆 `provider: 'tars'`、以 `tarsId` 對應 `sys_user.id` 的使用者 | `api/strategies/tarsStrategy.js` |
| **角色/權限保留** | 完整保留 pwc_tars 的 `role_id`、`user_group_id`、`menu_items` 到 `tars*` 欄位(不 flatten);`user.role` 另依 `role_id` 映射成 LibreChat ADMIN/USER | `packages/data-schemas/src/schema/user.ts` |
| **License 擋登入** | 登入回應 `license_status !== 'activate'` 時擋下 | `api/strategies/tarsStrategy.js` |
| **登出反向通知** | LibreChat 登出時 best-effort 通知 pwc_tars `POST /api/auth/logout`(更新 `last_active_at`) | `api/server/controllers/auth/LogoutController.js` |
| **SSO 登入 (LDAP)** | 登入頁依 pwc_tars `GET /api/auth/sso/status` 顯示「使用 SSO 登入 (LDAP)」勾選框;勾選則送 `use_sso: true` 走 LDAP bind | `client/src/components/Auth/LoginForm.tsx`、`api/server/routes/config.js` |

**尚未實作(Roadmap)**:OIDC/SAML(redirect 式)、`domain_ids`(專用腦範圍)、登入後即時 status/role 同步(refresh 輪詢)、聊天資料雙向同步(Mongo ↔ PostgreSQL)。

---

## 環境變數(`.env`)

| 變數 | 必填 | 說明 |
|---|---|---|
| `TARS_AUTH_URL` | ✅ | pwc_tars Flask 服務基底 URL。**設了才會啟用整個 tars 整合**(登入改走 pwc_tars、登入頁變 username、註冊/密碼重設自動關閉)。 |
| `TARS_ADMIN_ROLE_IDS` | ⬜ | 逗號清單;pwc_tars `role_id` 屬此集合者 → LibreChat `ADMIN`。預設 `1`(對應 pwc_tars 種子的 Admin 角色)。 |

沿用 LibreChat 既有(LibreChat 自簽自己的 token):`JWT_SECRET`、`JWT_REFRESH_SECRET`、`SESSION_EXPIRY`、`REFRESH_TOKEN_EXPIRY`。

啟用 `TARS_AUTH_URL` 時建議(且部分由程式強制):
- `ALLOW_REGISTRATION=false`、不啟用 `ALLOW_PASSWORD_RESET` —— 註冊/改密碼由 pwc_tars 管。

`.env.example` 內 `# pwc_tars Auth` 區塊已含這些範例。

---

## Docker / 網路設定

LibreChat 後端要連得到 pwc_tars 的 Flask,`TARS_AUTH_URL` 依「LibreChat 怎麼跑」而不同:

| LibreChat 跑法 | pwc_tars Flask 位置 | `TARS_AUTH_URL` |
|---|---|---|
| 本機 `npm run backend`(目前開發模式) | 本機 host | `http://localhost:5000` |
| docker `api` 容器 | 本機 host | `http://host.docker.internal:5000` |
| docker `api` 容器 | 同一 compose 網路內的服務 | `http://<pwc_tars_service>:<port>` |

> 目前 repo 的 `docker-compose.override.yml` 只把 `mongodb` / `meilisearch` 的 port 對外開放,讓本機 `npm run backend` 連得到;**不啟動官方 api image**。因此目前情境用 `http://localhost:5000` 即可。

若之後改成在 docker 內跑 LibreChat `api` 並要連 host 上的 pwc_tars,可在 `docker-compose.override.yml` 為 `api` 補設(範例):

```yaml
services:
  api:
    environment:
      - TARS_AUTH_URL=http://host.docker.internal:5000
      - TARS_ADMIN_ROLE_IDS=1
    extra_hosts:
      - "host.docker.internal:host-gateway"   # Linux host 需要;Docker Desktop 已內建
```

---

## 改 code 後怎麼重建 / 啟動

LibreChat 是 monorepo,`packages/*` 編譯成 `dist/` 才被 `/api` 與 `/client` 使用;`nodemon`(`backend:dev`)只 watch `/api`,**不會**自動重建 packages。

| 改到哪裡 | 要做什麼 |
|---|---|
| `/api`(後端 JS) | `backend:dev` 自動重啟;否則 `npm run backend` |
| `/client`(前端) | dev:`npm run frontend:dev`(3090,HMR);prod 3080:`cd client && npm run build` |
| `packages/data-provider` | `npm run build:data-provider` 後重啟後端 |
| `packages/data-schemas` | `npm run build:data-schemas` 後重啟後端 |
| `packages/api` | `npm run build:api` 後重啟後端 |
| 多處 / 不確定 | `npm run frontend`(全 build)+ `npm run backend` |
---

## 驗證(end-to-end)

前置:pwc_tars Flask + PostgreSQL 起來,`sys_user` 有一個 `status='active'` 的測試帳號;LibreChat 端設好 `TARS_AUTH_URL`,MongoDB 已啟動。

1. **設定旗標**:`curl http://localhost:3080/api/config` 應含 `"tarsAuth":true`;若 pwc_tars 啟用 LDAP,還會有 `"tarsSso":{"enabled":true,"type":"ldap"}`。
2. **登入頁**:`http://localhost:3080/login` 欄位為 **username**;LDAP 啟用時出現「Sign in with SSO (LDAP)」勾選框。
3. **登入**:用 pwc_tars 帳號登入 → 進入 `/c/new`;cookie 含 `refreshToken`、`token_provider=librechat`。
4. **影子使用者**:MongoDB `users` 該筆應有 `provider:'tars'`、`tarsId`、`role`、`tarsRoleId`、`tarsMenuItems`、`tarsMenuKeys`、`tarsStatus`。
   ```bash
   docker exec chat-mongodb mongosh LibreChat --quiet --eval \
     "db.users.find({provider:'tars'},{username:1,role:1,tarsRoleId:1,tarsStatus:1,tarsMenuKeys:1}).pretty()"
   ```
5. **角色治理**:在 pwc_tars 改該帳號角色,重新登入後 MongoDB `role` / `tarsMenuItems` 應同步更新。
6. **License / SSO**:pwc_tars 回 `license_status: deactivate` → 登入被擋;勾 LDAP 登入 → 後端送 `use_sso:true`。
