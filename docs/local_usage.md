# LibreChat × pwc_tars 本地執行指南（Dev / Production）

> **3080 = 後端 API（同時也吐出「production 打包好的前端」）；3090 = 前端 dev server（Vite，即時熱更新）。**

---

## 0. 架構心智模型（先懂這個，後面就不會亂）

```
packages/data-provider ─┐
packages/data-schemas  ─┼─► 編譯成各自的 dist/ ─► 被 /api(後端) 與 /client(前端) 引用
packages/api           ─┘
packages/client        ─┘

/api  (Express 後端)  ── 跑在 :3080 ── 同時把 client/dist(打包好的前端) 當靜態網站吐出
/client (React 前端) ── dev 時跑在 :3090 (Vite)，正式時則被 build 成 client/dist
```

關鍵事實：
1. **`packages/*` 是「先編譯成 dist 才被用」**。改了 `packages/*`，一定要重新 `build:該套件`，否則 /api 和 /client 用到的還是舊的 dist。
2. **`:3090`(dev) 才有熱更新**；`:3080` 看到的是「上次 `client build` 的結果」，不重建就永遠是舊畫面。
3. 兩種模式都需要後端 `:3080` 在跑（3090 的前端會把 API 請求 proxy 到 3080）。

---

## 1. 前置服務（兩種模式都要先有）

| 服務 | 用途 | 啟動方式 | 檢查 |
|---|---|---|---|
| **MongoDB** (:27017) | LibreChat 的使用者/對話資料庫 | `docker start chat-mongodb`（已存在）<br>或 `docker run -d --name chat-mongodb -p 27017:27017 -v "$(pwd)/data-node:/data/db" mongo:8.0.20 mongod --noauth` | `nc -z localhost 27017` |
| **pwc_tars** (:5000) | 登入 / 專用腦 / 知識庫的真正後端 | 由 pwc_tars 專案自己啟動 | `curl localhost:5000/api/auth/sso/status` |
| **環境變數** | `.env` 內 `TARS_AUTH_URL=http://localhost:5000`（已設）、`MONGO_URI=mongodb://127.0.0.1:27017/LibreChat` | — | — |

> 每個長駐指令請各自開「一個獨立終端機分頁」並保持開著。關掉分頁＝關掉那個服務。

---

## 2. 模式一：Dev（開發時用這個，最即時）★ 推薦

**用途**：邊改邊看。前端改動秒更新（HMR）。
**看的網址**：`http://localhost:3090`

**第一次 / 改過 `packages/*` 後**，先建一次套件：
```bash
npm run build:data-provider
npm run build:data-schemas
npm run build:api
```

**終端機 A — 後端**（常駐）：
```bash
npm run backend:dev      # nodemon，改 /api 的 .js 會自動重啟；跑在 :3080
```

**終端機 B — 前端 dev server**（常駐）：
```bash
npm run frontend:dev     # Vite HMR；跑在 :3090
```

→ 瀏覽器開 **http://localhost:3090**

### Dev 模式下「改了東西要做什麼」
| 改到哪 | 要做的事 |
|---|---|
| `client/**`（React 前端） | **什麼都不用做**，存檔即熱更新 |
| `/api/**`（後端 JS） | nodemon 自動重啟，等一兩秒即可 |
| `packages/data-provider` | `npm run build:data-provider` → **重啟終端機 B 的 `frontend:dev`**（Vite 不會自動重抓套件 dist）→ 後端 A 也會自動重啟 |
| `packages/data-schemas` | `npm run build:data-schemas` → 重啟後端 A |
| `packages/api` | `npm run build:api` → 重啟後端 A |
| 多個 / 不確定 | `npm run build`（turbo 全部重建）→ 重啟 A、B |

> 重點：**Vite 不會自動偵測 `packages/*/dist` 的變更**。所以只要動到 `packages/*`，dev 前端(B)就要手動重啟才看得到。

---

## 3. 模式二：Production build（只用 :3080 單一服務）

**用途**：模擬正式環境、或不想開兩個 server，只想用一個 `:3080`。
**看的網址**：`http://localhost:3080`

**完整建置（套件 + 前端一次到位）**：
```bash
npm run frontend
# 等同於：build:data-provider → build:data-schemas → build:api → build:client-package → cd client && npm run build
# 產物：client/dist（打包好的前端）
```

**啟動後端（會一併把 client/dist 當前端吐出）**：
```bash
npm run backend          # NODE_ENV=production，跑在 :3080
```

→ 瀏覽器開 **http://localhost:3080**

### Production 模式下「改了東西要做什麼」
| 改到哪 | 要做的事 |
|---|---|
| `client/**` 前端 | **`cd client && npm run build`**（或 `npm run frontend`）→ 重新整理瀏覽器 |
| `packages/*` | `npm run frontend`（含套件重建 + 前端重建）→ 重啟 `npm run backend` |
| `/api/**` 後端 | 重啟 `npm run backend`（Ctrl+C 再跑） |

> ⚠️ 你之前「3080 看不到更新」就是因為：production 前端是**預先打包的靜態檔**，改了 `client/` 卻沒重跑 `cd client && npm run build`，3080 自然永遠是舊畫面。

---

## 4. 一頁速查：我改了 X，要重建什麼？

| 改動範圍 | Dev(:3090) | Production(:3080) |
|---|---|---|
| `client/`（React） | 自動 HMR | `cd client && npm run build` |
| `/api/`（後端 JS） | nodemon 自動重啟 | 重啟 `npm run backend` |
| `packages/data-provider` | `build:data-provider` + 重啟前端 dev + 後端自動重啟 | `npm run frontend` + 重啟 backend |
| `packages/data-schemas` | `build:data-schemas` + 重啟後端 | `npm run frontend` + 重啟 backend |
| `packages/api` | `build:api` + 重啟後端 | `npm run frontend` + 重啟 backend |
| `client/src/locales`（翻譯） | 自動 HMR | `cd client && npm run build` |

---

## 5. 驗證新功能在哪裡（本次整合）

1. 用 **pwc_tars 帳號登入**（例：`Chris`；登入後 provider=tars）。
2. **專用腦選擇器**：對話頁上方，model 選擇器右邊的「No specialized brain」。
3. **專用腦／知識庫管理**：左下角**頭像** → 帳號選單 → **「Specialized Brains」**（僅 ADMIN+tars 可見）。

---

## 6. 常見問題（你剛好踩到的）

- **「3080 看不到更新」** → 你看的是 production，改了前端要 `cd client && npm run build`；或改用 `:3090` dev。
- **「整個打不開 / 一直轉」** → 後端 `:3080` 沒在跑。`curl localhost:3080/health` 應回 `200`；不是就重開 `npm run backend(:dev)`。在「自己的終端機分頁」跑、別關分頁。
- **「改了還是舊的」** → 硬重新整理瀏覽器 **Cmd+Shift+R**（清掉舊 bundle 快取），或開無痕視窗。
- **「dev 改了 packages 沒反應」** → Vite 不自動重抓套件 dist：`build:該套件` 後**重啟 `frontend:dev`**（必要時先刪 `client/node_modules/.vite` 再重啟）。
- **「Specialized Brains 選單沒出現」** → 沒用 tars admin 帳號登入，或前端是舊 bundle（重建 + 硬重新整理）。

---

## 7. 日常開發流程

開三個終端機分頁，各自常駐：
```bash
# 分頁 1：（第一次或改過 packages 才需要）建一次套件
npm run build:data-provider && npm run build:data-schemas && npm run build:api

# 分頁 2：後端
npm run backend:dev

# 分頁 3：前端（用這個網址 http://localhost:3090）
npm run frontend:dev
```
之後就只在 `client/` 和 `/api/` 改，幾乎都自動更新；只有動到 `packages/*` 才回去重建 + 重啟前端。
要交付/驗收正式版時，再 `npm run frontend` + `npm run backend` 用 `:3080` 看一次。
