# Graupel 图像工作台(Image Workspace)设计

> **日期**: 2026-06-23 ｜ **作者**: 小天 ｜ **类型**: 功能设计(MVP 功能补齐 · 阶段3 之一)
>
> **关联**: [MVP 路线图](../2026-06-17-mvp-roadmap.md) §5 阶段3「MVP 功能补齐 · ① 图片生成入口」；对标 use.ai 图像页。

---

## 1. 概述与目标

新增一个**独立的「图像」工作台页**(非聊天线程),让普通用户无需进入 Agent 即可生成图片。完整复刻 use.ai 的图像页:左侧栏入口「图像」→ 独立页面(描述框 + 模型选择器 + 宽高比 + 参考图上传/编辑 + 语音输入 + 生成按钮)+ 下方「我的图像」历史画廊。

**目标**: 达到 ChatGPT/use.ai 级的基础生图体验,作为 Graupel MVP 的差异化基础功能之一。

## 2. 范围

**做**:
- 左侧栏新增「图像」导航入口 + 新前端路由 `/images`。
- 独立图像页:描述框、生图模型选择器(多引擎)、宽高比选择、参考图上传(图生图/编辑)、生成按钮、语音输入。
- 「我的图像」画廊:当前用户的历史生成,游标分页,点击查看大图/下载。
- 后端:经 gptsapi v3 异步预测 API 生图(submit→poll→下载转存);异步生图端点 + 结果轮询端点 + 画廊查询端点。
- 复用现有 `File` 模型与文件存储策略(R2/本地)持久化生成结果。

**不做(YAGNI)**:
- 批量生成、图生视频、风格预设库、社区/公开画廊、跨会话/聊天内引用生成图。
- 不新建数据库集合。
- 不接计费门控(仅留检查点,见 §9)。

## 3. 用户体验(对标 use.ai)

页面布局(主区,自上而下):
1. 标题 + 副标题:「描述您想要生成的图像,或上传照片并使用 AI 编辑」。
2. **描述输入框**:多行,placeholder「输入图像描述...」;支持语音输入(🎤,复用现有 STT)。
3. **控制行**(描述框下方):
   - **参考图**(默认「无」):可上传一张图作为编辑/参考来源 → 触发图生图/编辑。
   - **宽高比**:`1:1`(默认)、`16:9`、`9:16`、`4:3`、`3:4`。
   - **模型选择器**:默认 `gemini-3-pro-image-preview`(Nano Banana Pro);可切换其它引擎(见 §5)。
   - **生成**按钮(主操作)。
4. **「我的图像」画廊**:网格展示历史生成;空态「您还未生成任何图像」;点击打开大图(prompt/model 信息 + 下载)。

生成流程:填描述 →(可选上传参考图)→ 选模型/宽高比 → 点生成 → 页面显示生成中 → 完成后图片入画廊顶部。

## 4. 架构总览

gptsapi 生图是**异步预测模式**(submit → poll,实测 ~40s),故采用 **async-lite**:提交立即返回 prediction id,前端轮询我方结果端点;结果端点在 gptsapi 返回 `completed` 时**下载临时图 → 转存我方存储 → 落 File**。避免 ~40s 长请求被 Cloudflare(~100s 上限)截断,且不引入后台 worker。

```
[client/src] 路由 /images
   ImageWorkspace ─ submit mutation ─→ POST /api/images/generate ─→ { predictionId }
                  ─ poll query ──────→ GET  /api/images/result/:predictionId ─→ { status, file? }
   ImageGallery   ─ list query ──────→ GET  /api/images?cursor=...           ─→ { images, nextCursor }
                                                              │ 调用(注入依赖)
                                                              ▼
[api/server/routes/images.js] 薄 wrapper:注入 gptsapi 配置 / saveImageFile(存储策略) / File 模型方法
                                                              ▼
[packages/api/src/images] (TS, 业务核心)
   - submitGeneration(args, deps) → POST gptsapi /api/v3/{vendor}/{model}/{text-to-image|image-edit} → predictionId
   - fetchResult(predictionId, deps) → GET gptsapi /api/v3/predictions/{id}/result
        completed → 下载 outputs[0] → deps.saveImageFile → deps.createFileRecord(context=image_generation) → File
                                                              ▼
   gptsapi.net v3 异步预测 API + 现有文件存储策略(R2/本地) + File 集合
```

边界遵循 CLAUDE.md:业务核心在 `packages/api`(TS);`/api` 仅薄 wrapper 注入真实依赖;前端共享类型/端点在 `packages/data-provider`。

## 5. 引擎与模型(gptsapi v3 异步预测 API)

gptsapi 生图**不走** OpenAI 兼容 `/v1/images/generations`,而是其专有 v3 异步预测接口(已实测确认):

- **提交(text-to-image)**:`POST https://api.gptsapi.net/api/v3/{vendor}/{model}/text-to-image`
  body `{ prompt(必需,≤20000), aspect_ratio(auto|1:1|9:16|16:9|4:3|3:4), 以及 per-model 参数 }` → `{ code:200, data:{ id, status:'created', urls:{ get } } }`
- **编辑(image-edit)**:`POST .../{vendor}/{model}/image-edit`,body 加参考图 URL 数组(**可访问 URL**)。**参数名按 vendor 不同**:gemini = `images`,gpt-image-2 = `input_urls`(最多 16 张)。
- **轮询**:`GET https://api.gptsapi.net/api/v3/predictions/{id}/result` → `data.status: created→processing→completed|failed`,完成时 `data.outputs:[图片URL]`、`data.error`。
- **输出为临时 CDN URL**(如 `tempfile.aiquickdraw.com` / `oss-us.gptproto.com`)→ **必须下载转存**到我方 R2/本地,不外链。
- 配置:host = `https://api.gptsapi.net`(新增 `GPTSAPI_BASE_URL` 或常量);鉴权 `Authorization: Bearer ${GPTSAPI_KEY}`(复用 .env 现有 key)。

**已实测确认的引擎**(MVP 选择器,`IMAGE_MODELS` 类型化常量,易增删):

| 模型 id | 路径 vendor/model | per-model 参数 | 编辑(参考图参数名) | 默认 |
|---|---|---|---|---|
| `gemini-3-pro-image-preview`(Nano Banana Pro) | `google/gemini-3-pro-image-preview` | `output_format`(png/jpeg) | ✅ `images` | ✅ |
| `gpt-image-2` | `openai/gpt-image-2` | `resolution`(1K/2K/4K) | ✅ `input_urls`(≤16) | |

- `IMAGE_MODELS` 常量在 `packages/api/src/images/models.ts`,每项:`{ id, label, vendor, supportsEdit, editImagesKey: 'images'|'input_urls', paramKey: 'output_format'|'resolution', paramValues, default? }`。service 据此拼路径与 body。
- 参数约束(写入校验):`gpt-image-2` 的 `1:1` 不能转 4K;`aspect_ratio` 为 `auto`/未填仅 1K。
- 前端不硬编码,经 `GET /api/images/models` 获取列表/默认值/能力(是否支持 edit、可选参数、约束)。
- 默认引擎 `gemini-3-pro-image-preview` 对齐 use.ai 的 Nano Banana 定位。其它模型(gemini-2.5-flash-image-hd、grok-imagine-image 等)路径确认可用后追加进常量即可。

## 6. 后端设计

### 6.1 TS service(`packages/api/src/images/`)
DI 风格(对齐 billing `applyPlanChange`)。拆两个纯函数 + 一个 http 客户端:
- `client.ts`:`submitPrediction({ model, prompt, aspectRatio, modelParam, imageUrls? }, cfg) → { predictionId }`(POST v3 text-to-image / image-edit,按 `IMAGE_MODELS` 拼 vendor/model 路径 + per-model 参数 + per-vendor 编辑参数名);`getPrediction(predictionId, cfg) → { status, outputs, error }`(GET v3 result)。`cfg = { baseUrl, apiKey }`。仅这层做 HTTP(测试中 mock)。
- `service.ts`:
  - `submitGeneration(args)`:校验 `args.model ∈ IMAGE_MODELS`、`prompt` 非空、参数约束(§5)、edit 时 `imageUrls` 非空且模型 `supportsEdit` → 调 `submitPrediction` → 返回 `{ predictionId, model, prompt }`。
  - `resolveResult(predictionId, deps)`:`getPrediction` → 若 `processing/created` 原样返回 `{ status }`;若 `failed` 抛错;若 `completed` → 下载 `outputs[0]`(`deps.fetchImage(url)`)→ `deps.saveImageFile(buffer, meta)` → `deps.createFileRecord({ context:'image_generation', model, metadata:{ imageGen:{ prompt, predictionId } }, width,height,... })` → 返回 `{ status:'completed', file }`。**幂等**:落 File 前先按 `metadata.imageGen.predictionId` 查重,已存在则直接返回该 File(防前端重复轮询重复落库)。
- `models.ts`:`IMAGE_MODELS` 常量 + `getImageModel(id)`(未知→抛错)。
- `deps`: `{ fetchImage:(url)=>Promise<{buffer,contentType}>; saveImageFile:(buffer,meta)=>Promise<{filepath,source,bytes}>; createFileRecord:(doc)=>Promise<IFileLean>; findFileByPrediction:(uid,pid)=>Promise<IFileLean|null> }`。不引入 `any`。

### 6.2 薄 Express 路由(`api/server/routes/images.js`,thin;async)
- `POST /api/images/generate`:鉴权(`requireJwtAuth`)→ 解析 `{ prompt, model, aspectRatio, modelParam?, referenceFileIds?[] }` → 若 edit:把已上传参考 File 解析为**可访问 URL**(见 §12)→ 调 `submitGeneration` → 返回 `{ predictionId }`(立即返回,不等生成)。
- `GET /api/images/result/:predictionId`:鉴权 → 注入真实 deps(`fetchImage`=带超时的 http get、`saveImageFile`=`getStrategyFunctions`、`createFileRecord`/`findFileByPrediction`=`~/models`)→ 调 `resolveResult` → 返回 `{ status, file? }`。前端按此轮询。
- `GET /api/images/models`:返回 `IMAGE_MODELS`(供前端选择器)。
- `GET /api/images?cursor=&limit=`:查当前用户 `context=image_generation` 的 File,`createdAt` 倒序游标分页 → `{ images, nextCursor }`。
- `POST /api/images/upload`(参考图):复用现有 multer + 文件存储,存为 File 并返回其 URL/id(供 edit 引用)。
- 在 `api/server/routes/index.js` 挂载 `/images`。

### 6.3 与现有 Agent 工具路径的关系
- 现有 `OpenAIImageTools.js`(Agent 端点生图)**保持可用,不破坏**。
- 可选(非阻塞):后续让该工具复用同一 TS service,消除重复。本期不强制重构,避免动 Agent 路径风险。

## 7. 数据模型(复用 `File`)

- 不新建集合。生成结果即 `File` 文档,字段映射(以真实 schema 为准):
  - `user`: 当前用户;`context`: `image_generation`(已存在枚举值)
  - `source`: 存储策略来源(local/s3/…);`filepath`/`filename`/`type`(mime)/`bytes`/`file_id` 由现有文件存储服务填充
  - `width` / `height`: 生成尺寸(已存在字段)
  - `model`: 引擎模型 id —— **复用 File 现有顶层 `model` 字段**(已存在)
  - prompt: **在 `metadata` 下新增命名空间子文档 `imageGen: { prompt: String }`**(与现有 `codeEnvRef` 并列,互不影响)。这是本设计**唯一的 schema 改动**(`packages/data-schemas/src/schema/file.ts` + 对应 `IMongoFile` 类型)。
- 画廊查询:`{ user, context: 'image_generation' }` + `sort({ createdAt: -1 })` + 游标分页。

## 8. 前端设计(`client/src`)

- **路由**:`client/src/routes/index.tsx` 在主 `Root` 布局下新增 `path: 'images'`(与 `c/:conversationId`、`search` 同级)。
- **侧栏入口**:左侧 Nav 新增「图像」链接(`useLocalize`,新增英文 key 如 `com_ui_images`),图标用现成 image 图标。
- **组件**(新建 `client/src/components/Images/`):
  - `ImageWorkspace.tsx`:描述框 + 控制行(参考图上传、宽高比 `Select`、模型 `Select`、语音、生成按钮)。
  - `ImageGallery.tsx`:网格 + 空态 + 大图预览/下载。
  - `index.ts` 导出。
- **data-provider**:
  - `packages/data-provider/src/api-endpoints.ts` + `data-service.ts` 加端点:submit / result / list / models / upload;`types/` 加 `TImageGenRequest`/`TImagePrediction`/`TGeneratedImage`/`TImageModel`(复用现有 File 类型扩展);`keys.ts` 加 QueryKey/MutationKey。
  - `client/src/data-provider/Images/{queries,mutations}.ts` → `index.ts` → 汇入 `client/src/data-provider/index.ts`。
- **交互(异步)**:submit mutation 拿到 `predictionId` → 用 React Query **轮询** `GET result/:predictionId`(`refetchInterval` ~3s,`enabled` 直到 `status==='completed'|'failed'`);completed 时停止轮询 + invalidate 画廊 query(新图入列)+ 清 loading;failed 显示错误。所有文案走 `useLocalize`。生成中页面显示占位/进度。

## 9. 计费门控(暂缓,留检查点)

- gating 当前**已暂停**(见 [gating 计划](../plans/2026-06-17-stage3-gating.md),Task 1 已落地、Task 2 待做)。
- 本期图像页**全员可用,不接门控**。
- 在 `service.generateImage` 入口留一个明确的 `// TODO(gating): checkBillingAccess(featureFlag: 'image_gen')` 检查点。最终归属(Pro 专属 / 免费基础)**先不定**,待 gating 阶段恢复时再决定并接线。

## 10. 错误处理

- gptsapi 提交失败 / 鉴权 / 配额:service 抛带语义错误,route 转合适 HTTP 码 + 文案(前端 `useLocalize`)。
- 轮询结果:gptsapi `status==='failed'`(读 `data.error`)→ result 端点返回 `{status:'failed', error}`,前端展示;前端轮询设**上限**(如 ~3min 仍未 completed → 超时提示,停止轮询)。
- 下载转存:`outputs[0]` 下载失败 / 存储失败 / File 落库失败都冒泡,不静默;已存字节但落库失败 → 删存储(无孤儿)。
- 模型不在白名单 / 参数违反约束(§5)/ edit 缺参考图 → 400。
- 参考图过大/格式不支持 → 400(复用现有 multer 限制)。

## 11. 测试策略(Jest,真实逻辑优先)

- **service(packages/api)**:真实 DI(`fetchImage`/`saveImageFile`/`createFileRecord`/`findFileByPrediction` 用 spy + 真 File 模型经 mongodb-memory-server);mock 仅限 `client.ts` 的 gptsapi HTTP(外部、不可控)。覆盖:`submitGeneration`(校验/约束/edit 缺图/拼路径与 body 含正确 per-model 参数与编辑参数名)、`resolveResult`(processing 直返、failed 抛错、completed 下载+落 File 且 context/model/metadata.imageGen 正确)、**幂等**(同 predictionId 重复 resolve 不重复落库)、上游错误冒泡。用 no-AVX 前缀跑(`LD_LIBRARY_PATH=... MONGOMS_VERSION=4.4.18`)。
- **route(api)**:鉴权、入参校验、画廊分页(真实 File 查询)。
- **前端**:`__tests__` 覆盖 ImageWorkspace 的 loading/success/error,画廊空态/有数据。

## 12. 待验证项(已大部确认;剩余实现期处理)

- ✅ **API 形态已确认**:gptsapi v3 异步预测(submit→poll),`gemini-3-pro-image-preview` 与 `gpt-image-2` 的 text-to-image / image-edit 均实测可用;输出为临时 CDN URL。
- ⚠️ **参考图 URL 可达性(edit)**:`image-edit` 的 `images`/`input_urls` 须为 gptsapi 可访问的 URL。需确认我方上传文件的存储(R2 公有读 / 签名 URL / 本地需公网可达端点)能给出 gptsapi 拉得到的 URL;本地开发若不可达,edit 在该环境降级提示。
- ⚠️ **轮询节奏/超时**:`refetchInterval` 与前端超时上限实测调优(实测 ~40s,4K 可能更久)。
- ➕ **追加模型**:其它图模型(`gemini-2.5-flash-image-hd`、`grok-imagine-image` 等)的 v3 路径/参数确认可用后加入 `IMAGE_MODELS`。

## 13. 工作量预估

- 后端 service + routes + 测试:~8-10h
- 前端页面 + 画廊 + data-provider:~10-12h
- 联调 + per-model 验证 + 文案:~4-6h
- **合计 ~22-28h**(契合路线图阶段3 单功能预算)。
