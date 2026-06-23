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
- 后端:统一经 gptsapi 中转(OpenAI 兼容)生图;独立生图端点 + 画廊查询端点。
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
   - **模型选择器**:默认 `gemini-2.5-flash-image-hd`(对齐 Nano Banana);可切换其它引擎(见 §5)。
   - **生成**按钮(主操作)。
4. **「我的图像」画廊**:网格展示历史生成;空态「您还未生成任何图像」;点击打开大图(prompt/model 信息 + 下载)。

生成流程:填描述 →(可选上传参考图)→ 选模型/宽高比 → 点生成 → 页面显示生成中 → 完成后图片入画廊顶部。

## 4. 架构总览

```
[client/src] 路由 /images
   └─ ImageWorkspace(描述框+控制行) ── React Query mutation ──┐
   └─ ImageGallery(我的图像)        ── React Query query ─────┤
                                                              ▼
[api/server/routes] 薄 wrapper:                    POST /api/images/generate
   - 校验入参、注入真实依赖(存储/File 模型)        GET  /api/images?cursor=...
                                                              │ 调用
                                                              ▼
[packages/api/src/images] (TS, 业务核心)
   - service.generateImage(args, deps)  → 调 gptsapi /images,返回图片字节/URL
   - 依赖注入:saveImageFile(存储策略) + createFileRecord(File 模型)
                                                              │ 复用
                                                              ▼
   gptsapi.net (OpenAI 兼容 /images) + 现有文件存储策略(R2/本地) + File 集合
```

边界遵循 CLAUDE.md:业务核心在 `packages/api`(TS);`/api` 仅薄 wrapper 注入真实依赖;前端共享类型/端点在 `packages/data-provider`。

## 5. 引擎与模型(gptsapi 中转)

- 统一走 gptsapi.net OpenAI 兼容接口。复用 `.env` 现有变量:`IMAGE_GEN_OAI_BASEURL=https://api.gptsapi.net/v1`、`IMAGE_GEN_OAI_API_KEY=${GPTSAPI_KEY}`。
- 模型选择器列表(来自 gptsapi `/v1/models` 实测,**config 驱动**,可增删):
  | 模型 id | 说明 | 默认 |
  |---|---|---|
  | `gemini-2.5-flash-image-hd` | Nano Banana HD,快/省 | ✅ |
  | `gemini-3.1-flash-image-preview` | 新 Gemini 图 | |
  | `gemini-3-pro-image-preview` | 新 Gemini 图(Pro) | |
  | `gpt-image-2` | OpenAI 图,高质量 | |
  | `grok-imagine-image` | xAI 图 | |
- 模型列表与默认值作为**类型化常量** `IMAGE_MODELS`(`packages/api/src/images/models.ts`,易增删、类型安全,免 yaml schema 改动)。前端不硬编码,经轻量端点 `GET /api/images/models`(或并入 `GET /api/images` 的 config 字段)获取。

**⚠️ 待实现期验证(§12)**:上述模型是否都能经 OpenAI 兼容 `/images/generations` 调通。若某些(尤其 Gemini/Grok 图)在 gptsapi 上实际走 `/chat/completions` 图输出,则 service 内按 model 加 adapter 分支;选择器只暴露已验证可用的模型。

## 6. 后端设计

### 6.1 TS service(`packages/api/src/images/`)
- `service.ts`:`generateImage(args, deps)`,DI 风格(对齐 billing `applyPlanChange`)。
  - `args`: `{ userId: ObjectId; prompt: string; model: string; size: string; referenceImage?: Buffer | null }`
  - `deps`: `{ saveImageFile: (buffer, meta) => Promise<{ filepath; source }>; createFileRecord: (doc) => Promise<IFileLean> }`
  - 职责:校验 model 在白名单内 → 调 gptsapi(generate 或 edit,取决于有无参考图)→ 拿到图片字节 → 经 `deps.saveImageFile` 存储 → 经 `deps.createFileRecord` 落 File(`context: image_generation`、引擎 id 存现有顶层 `model` 字段、prompt 存 `metadata.imageGen.prompt`、`width/height`)→ 返回 File。
- `models.ts`:`IMAGE_MODELS` 白名单 + 默认值(或从配置读取)。
- 不引入 `any`;模型未在白名单 → 抛错(由 route 转 400)。

### 6.2 薄 Express 路由(`api/server/routes/images.js`,thin)
- `POST /api/images/generate`:鉴权(现有 `requireJwtAuth`)→ 解析 `{ prompt, model, aspectRatio, referenceFileId? }`(参考图经 multer 或引用已上传 file)→ 注入真实 `saveImageFile`(`getStrategyFunctions`)/`createFileRecord`(`~/models`)→ 调 service → 返回 `{ file }`。
- `GET /api/images?cursor=&limit=`:查当前用户 `context=image_generation` 的 File,按 `createdAt` 倒序游标分页 → 返回 `{ images, nextCursor }`。
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
  - `packages/data-provider/src/api-endpoints.ts` + `data-service.ts` 加生图/画廊端点;`types/` 加 `TImageGenRequest`/`TGeneratedImage` 类型(复用现有 File 类型扩展);`keys.ts` 加 QueryKey/MutationKey。
  - `client/src/data-provider/Images/{queries,mutations}.ts` → `index.ts` → 汇入 `client/src/data-provider/index.ts`。
- **交互**:生成 mutation 成功后 invalidate 画廊 query;loading/error 态完整呈现;所有文案走 `useLocalize`。

## 9. 计费门控(暂缓,留检查点)

- gating 当前**已暂停**(见 [gating 计划](../plans/2026-06-17-stage3-gating.md),Task 1 已落地、Task 2 待做)。
- 本期图像页**全员可用,不接门控**。
- 在 `service.generateImage` 入口留一个明确的 `// TODO(gating): checkBillingAccess(featureFlag: 'image_gen')` 检查点。最终归属(Pro 专属 / 免费基础)**先不定**,待 gating 阶段恢复时再决定并接线。

## 10. 错误处理

- gptsapi 调用失败 / 超时 / 配额:service 抛带语义的错误,route 转合适 HTTP 码 + 文案(前端用 `useLocalize` 提示)。
- 不静默失败:存储失败、File 落库失败都要冒泡并清理半成品(已存字节但落库失败 → 删存储)。
- 模型不在白名单 → 400。
- 参考图过大/格式不支持 → 400(复用现有 multer 限制)。

## 11. 测试策略(Jest,真实逻辑优先)

- **service(packages/api)**:用真实 DI(假 `saveImageFile`/`createFileRecord` spy + 真 File 模型经 mongodb-memory-server);mock 仅限 gptsapi 的 HTTP 调用(外部、不可控)。覆盖:成功落 File(context/metadata 正确)、未知模型拒绝、参考图走 edit 分支、上游错误冒泡。用 no-AVX 前缀跑(`LD_LIBRARY_PATH=... MONGOMS_VERSION=4.4.18`)。
- **route(api)**:鉴权、入参校验、画廊分页(真实 File 查询)。
- **前端**:`__tests__` 覆盖 ImageWorkspace 的 loading/success/error,画廊空态/有数据。

## 12. 待验证项(实现前 plan 阶段确认)

1. **per-model API 形态**:5 个模型是否都经 `/images/generations` 调通;Gemini/Grok 图是否需 `/chat/completions` 图输出 adapter。用一次真实调用验证,选择器只列已验证模型。
2. **图片返回形态**:gptsapi 返回 base64 还是 URL;若 URL 需下载再转存到我方存储(R2/本地),不外链。
3. **参考图编辑**:哪些模型支持 edit;不支持的模型在选了参考图时禁用或提示。
4. **宽高比映射**:OpenAI `size` vs Gemini `aspectRatio` 参数差异,在 service 内按 model 归一。

## 13. 工作量预估

- 后端 service + routes + 测试:~8-10h
- 前端页面 + 画廊 + data-provider:~10-12h
- 联调 + per-model 验证 + 文案:~4-6h
- **合计 ~22-28h**(契合路线图阶段3 单功能预算)。
