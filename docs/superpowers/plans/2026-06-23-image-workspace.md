# Image Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a use.ai-style dedicated "Images" workspace page that generates images via gptsapi's async v3 prediction API, persists results as `File` records, and shows a "My Images" gallery.

**Architecture:** Async-lite. Frontend `POST /api/images/generate` → returns `predictionId` immediately; frontend polls `GET /api/images/result/:predictionId`; the result endpoint, when gptsapi reports `completed`, downloads the temp image, re-stores it to our storage (R2/local), and creates a `File` (`context: image_generation`). Business logic is TypeScript in `packages/api/src/images/`; `/api` holds thin Express wrappers injecting real storage/DB deps. Reuses the existing `File` model + storage strategies.

**Tech Stack:** TypeScript (`packages/api`, `packages/data-schemas`, `packages/data-provider`) · JS (`/api` Express) · React + React Query (`client`) · Jest + mongodb-memory-server · axios.

**Spec:** [docs/superpowers/specs/2026-06-23-graupel-image-workspace-design.md](../specs/2026-06-23-graupel-image-workspace-design.md)

## Global Constraints

- **gptsapi v3 async API** (verified live), host `https://api.gptsapi.net`, auth `Authorization: Bearer ${GPTSAPI_KEY}`:
  - Submit text-to-image: `POST /api/v3/{vendor}/{model}/text-to-image`, body `{ prompt, aspect_ratio, <paramKey>:<value> }`.
  - Submit image-edit: `POST /api/v3/{vendor}/{model}/image-edit`, body adds reference-URL array under per-vendor key (`images` for google, `input_urls` for openai, ≤16).
  - Poll: `GET /api/v3/predictions/{id}/result` → `data.status` (`created`→`processing`→`completed`|`failed`), `data.outputs:[url]`, `data.error`.
  - Submit response shape: `{ data: { id, status, urls:{get} } }`.
- `aspect_ratio` ∈ `auto|1:1|9:16|16:9|4:3|3:4`. `gpt-image-2`: `resolution` ∈ `1K|2K|4K` (1:1 cannot be 4K; `auto`/unset → 1K only). `gemini-3-pro-image-preview`: `output_format` ∈ `png|jpeg`.
- **Output URLs are temporary** (`tempfile.aiquickdraw.com`, `oss-us.gptproto.com`) → MUST download + re-store; never store the temp URL as the File's path.
- **Reuse `File` model**, `context: 'image_generation'` (existing enum). Persist permanently via `createFile(data, true)` (the `true` disables the 1h TTL). The ONLY schema change is adding `metadata.imageGen` (Task 2).
- **Idempotent** result resolution: before creating a File, look it up by `metadata.imageGen.predictionId`; if found, return it (frontend polls repeatedly).
- **Workspace boundaries** (CLAUDE.md): business logic = TS in `packages/api`; `/api` = thin wrappers injecting real deps; shared types/endpoints in `packages/data-provider`. Never `any`. Single-word filenames.
- **HTTP in packages/api**: use `createAxiosInstance()` + `logAxiosError` from `~/utils/axios` (matches existing style).
- **Localization**: all UI text via `useLocalize()`; add English keys only to `client/src/locales/en/translation.json` (`com_ui_*` prefix). `com_ui_images` already exists.
- **Gating paused**: do NOT wire `checkBillingAccess`. Leave one `// TODO(gating): checkBillingAccess(featureFlag: 'image_gen')` comment at the `submitGeneration` entry.
- **Tests**: run from each workspace. packages/api / data-schemas jest needs the no-AVX prefix: `LD_LIBRARY_PATH="$HOME/.local/ssl1.1/usr/lib/x86_64-linux-gnu" MONGOMS_VERSION=4.4.18 npx jest <pattern>`. Real logic over mocks; mock only the external gptsapi HTTP.
- Build after changes: `packages/api` → `npm run build` (in that dir); data-provider → `npm run build:data-provider` (from root); data-schemas → `npm run build` (in that dir).

## File Structure

**Create:**
- `packages/api/src/images/models.ts` — `IMAGE_MODELS` config + `getImageModel`, `ASPECT_RATIOS`.
- `packages/api/src/images/client.ts` — gptsapi HTTP: `submitPrediction`, `getPrediction`.
- `packages/api/src/images/service.ts` — `submitGeneration`, `resolveResult` (DI).
- `packages/api/src/images/index.ts` — re-export the above.
- `packages/api/src/images/service.spec.ts`, `client.spec.ts`, `models.spec.ts` — tests.
- `api/server/routes/images.js` — Express routes (thin).
- `api/server/routes/__tests__/images.spec.js` — route integration tests.
- `client/src/components/Images/ImageWorkspace.tsx`, `ImageGallery.tsx`, `ImageControls.tsx`, `index.ts`, `layouts/ImagesView.tsx`.
- `client/src/data-provider/Images/queries.ts`, `mutations.ts`, `index.ts`.
- `client/src/components/Images/__tests__/ImageWorkspace.spec.tsx`.

**Modify:**
- `packages/data-schemas/src/schema/file.ts` + `packages/data-schemas/src/types/files.ts` — add `metadata.imageGen`.
- `packages/api/src/index.ts` — `export * from './images'`.
- `packages/data-provider/src/api-endpoints.ts`, `data-service.ts`, `keys.ts`, `types/` — image endpoints/services/keys/types.
- `packages/data-provider/src/keys.ts` (`CacheKeys`) + `api/cache/getLogStores.js` — `IMAGE_GENERATION` cache namespace.
- `api/server/routes/index.js` (+ wherever routers mount) — mount `/api/images`.
- `client/src/routes/index.tsx` — add `{ path: 'images', lazy: loadImagesView }`.
- `client/src/components/UnifiedSidebar/ExpandedPanel.tsx` + `SideMenu.tsx` — change Images nav href `/c/new` → `/images`.
- `client/src/data-provider/index.ts` — `export * from './Images'`.
- `client/src/locales/en/translation.json` — image keys.

---

## Task 1: gptsapi image client + model config

**Files:** Create `packages/api/src/images/models.ts`, `client.ts`, `models.spec.ts`, `client.spec.ts`.

**Interfaces — Produces:**
- `IMAGE_MODELS: ImageModel[]`, `ASPECT_RATIOS`, `getImageModel(id: string): ImageModel` (throws on unknown), `DEFAULT_IMAGE_MODEL_ID`.
- `submitPrediction(args, cfg): Promise<string>` (predictionId), `getPrediction(id, cfg): Promise<{ status: string; outputs: string[]; error: string | null }>`.
- Types: `ImageModel`, `ImageGenConfig = { baseUrl: string; apiKey: string }`.

- [ ] **Step 1: Write `models.ts`**

```ts
export type ImageVendor = 'google' | 'openai';
export type AspectRatio = 'auto' | '1:1' | '9:16' | '16:9' | '4:3' | '3:4';
export const ASPECT_RATIOS: AspectRatio[] = ['auto', '1:1', '9:16', '16:9', '4:3', '3:4'];

export interface ImageModel {
  id: string;
  label: string;
  vendor: ImageVendor;
  supportsEdit: boolean;
  editImagesKey: 'images' | 'input_urls';
  paramKey: 'output_format' | 'resolution';
  paramValues: string[];
  defaultParam: string;
  isDefault?: boolean;
}

export const IMAGE_MODELS: ImageModel[] = [
  {
    id: 'gemini-3-pro-image-preview', label: 'Nano Banana Pro', vendor: 'google',
    supportsEdit: true, editImagesKey: 'images',
    paramKey: 'output_format', paramValues: ['png', 'jpeg'], defaultParam: 'png',
    isDefault: true,
  },
  {
    id: 'gpt-image-2', label: 'GPT Image 2', vendor: 'openai',
    supportsEdit: true, editImagesKey: 'input_urls',
    paramKey: 'resolution', paramValues: ['1K', '2K', '4K'], defaultParam: '1K',
  },
];

export const DEFAULT_IMAGE_MODEL_ID =
  (IMAGE_MODELS.find((m) => m.isDefault) ?? IMAGE_MODELS[0]).id;

export function getImageModel(id: string): ImageModel {
  const model = IMAGE_MODELS.find((m) => m.id === id);
  if (!model) {
    throw new Error(`Unknown image model: ${id}`);
  }
  return model;
}
```

- [ ] **Step 2: Write `models.spec.ts` and run**

```ts
import { getImageModel, DEFAULT_IMAGE_MODEL_ID, IMAGE_MODELS } from './models';

describe('image models', () => {
  test('default model exists and is in the list', () => {
    expect(IMAGE_MODELS.some((m) => m.id === DEFAULT_IMAGE_MODEL_ID)).toBe(true);
  });
  test('getImageModel returns config', () => {
    expect(getImageModel('gpt-image-2').editImagesKey).toBe('input_urls');
  });
  test('getImageModel throws on unknown', () => {
    expect(() => getImageModel('nope')).toThrow('Unknown image model');
  });
});
```

Run: `cd packages/api && npx jest src/images/models.spec.ts` → PASS.

- [ ] **Step 3: Write `client.ts`**

```ts
import { createAxiosInstance, logAxiosError } from '~/utils/axios';
import type { ImageModel } from './models';

const axios = createAxiosInstance();

export interface ImageGenConfig {
  baseUrl: string;
  apiKey: string;
}

export interface SubmitArgs {
  model: ImageModel;
  prompt: string;
  aspectRatio: string;
  paramValue: string;
  imageUrls?: string[];
}

export async function submitPrediction(args: SubmitArgs, cfg: ImageGenConfig): Promise<string> {
  const { model, prompt, aspectRatio, paramValue, imageUrls } = args;
  const isEdit = Array.isArray(imageUrls) && imageUrls.length > 0;
  const action = isEdit ? 'image-edit' : 'text-to-image';
  const url = `${cfg.baseUrl}/api/v3/${model.vendor}/${model.id}/${action}`;
  const body: Record<string, unknown> = {
    prompt,
    aspect_ratio: aspectRatio,
    [model.paramKey]: paramValue,
  };
  if (isEdit) {
    body[model.editImagesKey] = imageUrls;
  }
  try {
    const res = await axios.post(url, body, {
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    });
    const id = res.data?.data?.id;
    if (!id) {
      throw new Error('gptsapi submit returned no prediction id');
    }
    return id as string;
  } catch (error) {
    throw new Error(logAxiosError({ error, message: 'gptsapi image submit failed' }));
  }
}

export interface PredictionResult {
  status: string;
  outputs: string[];
  error: string | null;
}

export async function getPrediction(predictionId: string, cfg: ImageGenConfig): Promise<PredictionResult> {
  const url = `${cfg.baseUrl}/api/v3/predictions/${predictionId}/result`;
  try {
    const res = await axios.get(url, { headers: { Authorization: `Bearer ${cfg.apiKey}` } });
    const data = res.data?.data ?? {};
    return { status: data.status ?? 'unknown', outputs: data.outputs ?? [], error: data.error ?? null };
  } catch (error) {
    throw new Error(logAxiosError({ error, message: 'gptsapi image poll failed' }));
  }
}
```

- [ ] **Step 4: Write `client.spec.ts` (mock axios) and run**

Mock `~/utils/axios` so `createAxiosInstance` returns an object with `post`/`get` jest mocks. Assert: text-to-image hits `/api/v3/google/gemini-3-pro-image-preview/text-to-image` with body `{prompt, aspect_ratio, output_format}`; with `imageUrls` it hits `/image-edit` and sets `images`; for `gpt-image-2` edit it sets `input_urls`; `submitPrediction` returns `data.data.id`; `getPrediction` maps `data.data` → `{status, outputs, error}`.

Run: `cd packages/api && LD_LIBRARY_PATH="$HOME/.local/ssl1.1/usr/lib/x86_64-linux-gnu" MONGOMS_VERSION=4.4.18 npx jest src/images/client.spec.ts` → PASS.

- [ ] **Step 5: tsc + commit**

Run: `cd packages/api && npx tsc -p tsconfig.json --noEmit` → 0 errors.
```bash
git add packages/api/src/images/models.ts packages/api/src/images/client.ts packages/api/src/images/models.spec.ts packages/api/src/images/client.spec.ts
git commit -m "feat(images): add gptsapi image client and model config"
```

---

## Task 2: File schema field + image generation service

**Files:** Modify `packages/data-schemas/src/schema/file.ts`, `packages/data-schemas/src/types/files.ts`. Create `packages/api/src/images/service.ts`, `index.ts`, `service.spec.ts`. Modify `packages/api/src/index.ts`.

**Interfaces — Consumes:** `getImageModel`, `ASPECT_RATIOS`, `submitPrediction`, `getPrediction`, `ImageGenConfig` (Task 1).
**Produces:**
- `submitGeneration(args: { model: string; prompt: string; aspectRatio: string; param?: string; imageUrls?: string[] }, cfg: ImageGenConfig): Promise<{ predictionId: string }>`
- `resolveResult(args: { predictionId: string; userId: string; model: string; prompt: string }, deps: ImageDeps, cfg: ImageGenConfig): Promise<{ status: string; file?: IFileLean }>`
- `ImageDeps = { fetchImage; saveImageFile; createFileRecord; findFileByPrediction }`

- [ ] **Step 1: Add `metadata.imageGen` to File schema**

In `packages/data-schemas/src/schema/file.ts`, extend the `metadata` object (alongside `codeEnvRef`):
```ts
    metadata: {
      codeEnvRef: { /* unchanged */ },
      imageGen: {
        type: new Schema(
          { prompt: { type: String }, predictionId: { type: String, index: true } },
          { _id: false },
        ),
        default: undefined,
      },
    },
```
In `packages/data-schemas/src/types/files.ts`, extend the `IMongoFile['metadata']` type to include `imageGen?: { prompt?: string; predictionId?: string }`.

- [ ] **Step 2: Build data-schemas**

Run: `cd packages/data-schemas && npm run build` → success.

- [ ] **Step 3: Write `service.ts`**

```ts
import { v4 as uuidv4 } from 'uuid';
import { getImageModel, ASPECT_RATIOS } from './models';
import { submitPrediction, getPrediction } from './client';
import type { ImageGenConfig } from './client';
import type { IFileLean } from '~/types'; // adjust to actual File lean type path

export interface ImageDeps {
  fetchImage: (url: string) => Promise<{ buffer: Buffer; contentType: string; width?: number; height?: number }>;
  saveImageFile: (a: { userId: string; buffer: Buffer; contentType: string }) =>
    Promise<{ filepath: string; source: string; bytes: number; filename: string; storageMetadata: Record<string, unknown> }>;
  createFileRecord: (doc: Record<string, unknown>) => Promise<IFileLean>;
  findFileByPrediction: (userId: string, predictionId: string) => Promise<IFileLean | null>;
}

export async function submitGeneration(
  args: { model: string; prompt: string; aspectRatio: string; param?: string; imageUrls?: string[] },
  cfg: ImageGenConfig,
): Promise<{ predictionId: string }> {
  // TODO(gating): checkBillingAccess(featureFlag: 'image_gen')
  const model = getImageModel(args.model);
  const prompt = (args.prompt ?? '').trim();
  if (!prompt) {
    throw new Error('prompt is required');
  }
  if (prompt.length > 20000) {
    throw new Error('prompt too long');
  }
  if (!ASPECT_RATIOS.includes(args.aspectRatio as never)) {
    throw new Error(`invalid aspect_ratio: ${args.aspectRatio}`);
  }
  const paramValue = args.param ?? model.defaultParam;
  if (!model.paramValues.includes(paramValue)) {
    throw new Error(`invalid ${model.paramKey}: ${paramValue}`);
  }
  if (model.paramKey === 'resolution') {
    if (paramValue === '4K' && args.aspectRatio === '1:1') {
      throw new Error('1:1 cannot be 4K');
    }
    if (args.aspectRatio === 'auto' && paramValue !== '1K') {
      throw new Error('auto aspect_ratio supports only 1K');
    }
  }
  const imageUrls = args.imageUrls?.filter(Boolean) ?? [];
  if (imageUrls.length > 0 && !model.supportsEdit) {
    throw new Error(`${model.id} does not support image edit`);
  }
  const predictionId = await submitPrediction(
    { model, prompt, aspectRatio: args.aspectRatio, paramValue, imageUrls: imageUrls.length ? imageUrls : undefined },
    cfg,
  );
  return { predictionId };
}

export async function resolveResult(
  args: { predictionId: string; userId: string; model: string; prompt: string },
  deps: ImageDeps,
  cfg: ImageGenConfig,
): Promise<{ status: string; file?: IFileLean }> {
  const existing = await deps.findFileByPrediction(args.userId, args.predictionId);
  if (existing) {
    return { status: 'completed', file: existing };
  }
  const pred = await getPrediction(args.predictionId, cfg);
  if (pred.status === 'created' || pred.status === 'processing') {
    return { status: pred.status };
  }
  if (pred.status === 'failed' || pred.status === 'error') {
    throw new Error(pred.error ?? 'image generation failed');
  }
  const url = pred.outputs[0];
  if (!url) {
    throw new Error('image generation returned no output');
  }
  const img = await deps.fetchImage(url);
  const saved = await deps.saveImageFile({ userId: args.userId, buffer: img.buffer, contentType: img.contentType });
  const file = await deps.createFileRecord({
    user: args.userId,
    file_id: uuidv4(),
    context: 'image_generation',
    model: args.model,
    source: saved.source,
    filepath: saved.filepath,
    filename: saved.filename,
    bytes: saved.bytes,
    type: img.contentType,
    width: img.width,
    height: img.height,
    metadata: { imageGen: { prompt: args.prompt, predictionId: args.predictionId } },
    ...saved.storageMetadata,
  });
  return { status: 'completed', file };
}
```
Then `packages/api/src/images/index.ts`: `export * from './models'; export * from './client'; export * from './service';` and add `export * from './images';` to `packages/api/src/index.ts`.

- [ ] **Step 4: Write `service.spec.ts` (real File model + mocked client) and run**

Mirror `applyPlanChange.spec.ts` setup (mongodb-memory-server + `createMethods(mongoose)`). `jest.mock('./client')` so `submitPrediction`/`getPrediction` are controllable. Use real `createFile`/`getFiles` for `createFileRecord`/`findFileByPrediction`; spy `fetchImage`/`saveImageFile`. Cover:
- `submitGeneration`: unknown model throws; empty prompt throws; invalid aspect throws; `gpt-image-2` `4K`+`1:1` throws; edit imageUrls on a supportsEdit model passes `imageUrls` to `submitPrediction`; returns `{predictionId}`.
- `resolveResult`: `processing` → `{status:'processing'}` no File; `completed` → downloads (spy called), creates File with `context==='image_generation'`, `model`, `metadata.imageGen.prompt/predictionId`; `failed` → throws; **idempotent**: second call with same predictionId returns the existing File without creating a duplicate (assert `getFiles` count stays 1).

Run: `cd packages/api && LD_LIBRARY_PATH="$HOME/.local/ssl1.1/usr/lib/x86_64-linux-gnu" MONGOMS_VERSION=4.4.18 npx jest src/images/service.spec.ts` → PASS.

- [ ] **Step 5: tsc + commit**

Run: `cd packages/api && npx tsc -p tsconfig.json --noEmit` → 0. `cd packages/data-schemas && npx tsc -p tsconfig.json --noEmit` → 0.
```bash
git add packages/data-schemas/src/schema/file.ts packages/data-schemas/src/types/files.ts packages/api/src/images/ packages/api/src/index.ts
git commit -m "feat(images): add image generation service and File.metadata.imageGen"
```

---

## Task 3: cache namespace + Express routes

**Files:** Modify `packages/data-provider/src/keys.ts` (`CacheKeys`), `api/cache/getLogStores.js`. Create `api/server/routes/images.js`, `api/server/routes/__tests__/images.spec.js`. Modify `api/server/routes/index.js` (+ app mount).

**Interfaces — Consumes:** `submitGeneration`, `resolveResult`, `IMAGE_MODELS`, `DEFAULT_IMAGE_MODEL_ID`, `ASPECT_RATIOS` from `@librechat/api`; `getStrategyFunctions`/`getFileStrategy`, `createFile`/`getFiles` from `/api`.

- [ ] **Step 1: Add `IMAGE_GENERATION` cache namespace**

In `packages/data-provider/src/keys.ts` add `IMAGE_GENERATION = 'imageGeneration'` to `CacheKeys`. Build: `npm run build:data-provider`. In `api/cache/getLogStores.js` add `[CacheKeys.IMAGE_GENERATION]: standardCache(CacheKeys.IMAGE_GENERATION),`.

- [ ] **Step 2: Write `images.js` routes**

```js
const express = require('express');
const axios = require('axios');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { CacheKeys, FileSources } = require('librechat-data-provider');
const { submitGeneration, resolveResult, IMAGE_MODELS, DEFAULT_IMAGE_MODEL_ID, ASPECT_RATIOS } = require('@librechat/api');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const getFileStrategy = require('~/server/utils/getFileStrategy');
const { getAppConfig } = require('~/server/services/Config');
const { getStorageMetadata } = require('~/server/services/Files/process'); // confirm export; else inline
const { getLogStores } = require('~/cache');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();
router.use(requireJwtAuth);

const cfg = () => ({ baseUrl: process.env.GPTSAPI_BASE_URL || 'https://api.gptsapi.net', apiKey: process.env.GPTSAPI_KEY });
const PENDING_TTL = 30 * 60 * 1000;

router.get('/models', (req, res) => {
  res.json({ models: IMAGE_MODELS, default: DEFAULT_IMAGE_MODEL_ID, aspectRatios: ASPECT_RATIOS });
});

router.post('/generate', async (req, res) => {
  try {
    const { prompt, model, aspectRatio, param, imageUrls } = req.body;
    const { predictionId } = await submitGeneration(
      { model: model || DEFAULT_IMAGE_MODEL_ID, prompt, aspectRatio: aspectRatio || '1:1', param, imageUrls },
      cfg(),
    );
    await getLogStores(CacheKeys.IMAGE_GENERATION).set(
      predictionId,
      { userId: req.user.id, model: model || DEFAULT_IMAGE_MODEL_ID, prompt },
      PENDING_TTL,
    );
    res.json({ predictionId });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/result/:predictionId', async (req, res) => {
  try {
    const { predictionId } = req.params;
    const ctx = (await getLogStores(CacheKeys.IMAGE_GENERATION).get(predictionId)) || {};
    const appConfig = await getAppConfig({ role: req.user.role });
    const deps = {
      fetchImage: async (url) => {
        const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
        const buffer = Buffer.from(r.data);
        const meta = await sharp(buffer).metadata();
        return { buffer, contentType: r.headers['content-type'] || 'image/png', width: meta.width, height: meta.height };
      },
      saveImageFile: async ({ userId, buffer, contentType }) => {
        const source = getFileStrategy(appConfig, { isImage: true });
        const { saveBuffer } = getStrategyFunctions(source);
        const ext = contentType.includes('jpeg') ? 'jpg' : 'png';
        const filename = `${uuidv4()}.${ext}`;
        const filepath = await saveBuffer({ userId, buffer, fileName: filename, tenantId: req.user.tenantId });
        return { filepath, source, bytes: buffer.length, filename, storageMetadata: getStorageMetadata({ filepath, source }) };
      },
      createFileRecord: (doc) => db.createFile({ ...doc, tenantId: req.user.tenantId }, true),
      findFileByPrediction: async (userId, pid) => {
        const files = await db.getFiles({ user: userId, 'metadata.imageGen.predictionId': pid }, {}, {});
        return files && files[0] ? files[0] : null;
      },
    };
    const out = await resolveResult(
      { predictionId, userId: req.user.id, model: ctx.model || 'unknown', prompt: ctx.prompt || '' },
      deps,
      cfg(),
    );
    if (out.status === 'completed') {
      await getLogStores(CacheKeys.IMAGE_GENERATION).delete(predictionId);
    }
    res.json(out);
  } catch (err) {
    res.status(502).json({ status: 'failed', message: err.message });
  }
});

router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  const filter = { user: req.user.id, context: 'image_generation' };
  if (req.query.cursor) {
    filter.createdAt = { $lt: new Date(req.query.cursor) };
  }
  const images = (await db.getFiles(filter, { createdAt: -1 }, null)) || [];
  const page = images.slice(0, limit);
  const nextCursor = page.length === limit ? page[page.length - 1].createdAt : null;
  res.json({ images: page, nextCursor });
});

module.exports = router;
```
> Implementer: verify `getStorageMetadata` is exported from process.js; if not, inline `{ storageKey?, storageRegion? }` extraction or import from its actual module. Confirm `getFileStrategy` default export shape. Add `GPTSAPI_BASE_URL=https://api.gptsapi.net` to `.env.example`.

- [ ] **Step 3: Mount the router**

In `api/server/routes/index.js` add `images: require('./images'),` to the exports, and mount it where other routers mount (`app.use('/api/images', routes.images)` — follow the existing mount file/pattern).

- [ ] **Step 4: Write route integration test**

`api/server/routes/__tests__/images.spec.js`: use supertest-style or the existing route test harness. Mock `@librechat/api` `submitGeneration`/`resolveResult` (unit-level wiring test) OR mock only axios + use real service. At minimum assert: `GET /models` returns the model list; `POST /generate` calls `submitGeneration` and caches ctx + returns `{predictionId}`; `GET /result/:id` returns service output and deletes cache on completed; `GET /` paginates files by context. Mock provider HTTP only.

Run: `cd api && LD_LIBRARY_PATH="$HOME/.local/ssl1.1/usr/lib/x86_64-linux-gnu" MONGOMS_VERSION=4.4.18 npx jest server/routes/__tests__/images.spec.js` → PASS.

- [ ] **Step 5: lint + commit**

Run: `cd api && npx eslint server/routes/images.js` → 0. `npm run build:data-provider` → ok.
```bash
git add packages/data-provider/src/keys.ts api/cache/getLogStores.js api/server/routes/images.js api/server/routes/index.js api/server/routes/__tests__/images.spec.js .env.example
git commit -m "feat(images): add async image generation routes and cache namespace"
```

---

## Task 4: data-provider plumbing (endpoints, services, keys, types)

**Files:** Modify `packages/data-provider/src/api-endpoints.ts`, `data-service.ts`, `keys.ts`, and add `packages/data-provider/src/types/images.ts` (exported via `types/index.ts`).

**Interfaces — Produces (frontend consumes):** endpoints `imageGenerate/imageResult/imageList/imageModels/imageUpload`; services `generateImage/getImageResult/getImageGallery/getImageModels`; `QueryKeys.imageGallery/imageModels/imageResult`, `MutationKeys.imageGenerate`; types `TImageGenRequest`, `TImagePrediction`, `TImageResult`, `TImageModelsConfig`, `TGeneratedImage` (alias of `TFile`).

- [ ] **Step 1: Types** — `packages/data-provider/src/types/images.ts`:
```ts
import type { TFile } from './files';
export type TGeneratedImage = TFile;
export interface TImageGenRequest { prompt: string; model: string; aspectRatio: string; param?: string; imageUrls?: string[] }
export interface TImagePrediction { predictionId: string }
export interface TImageResult { status: 'created' | 'processing' | 'completed' | 'failed'; file?: TFile }
export interface TImageModel { id: string; label: string; supportsEdit: boolean; paramKey: string; paramValues: string[]; defaultParam: string }
export interface TImageModelsConfig { models: TImageModel[]; default: string; aspectRatios: string[] }
export interface TImageGalleryPage { images: TFile[]; nextCursor: string | null }
```
Export from `types/index.ts`.

- [ ] **Step 2: Endpoints** (`api-endpoints.ts`):
```ts
const imagesRoot = `${BASE_URL}/api/images`;
export const imageGenerate = () => `${imagesRoot}/generate`;
export const imageResult = (id: string) => `${imagesRoot}/result/${encodeURIComponent(id)}`;
export const imageModels = () => `${imagesRoot}/models`;
export const imageList = (cursor?: string, limit = 30) =>
  `${imagesRoot}?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
```

- [ ] **Step 3: Services** (`data-service.ts`):
```ts
export const generateImage = (body: t.TImageGenRequest): Promise<t.TImagePrediction> => request.post(endpoints.imageGenerate(), body);
export const getImageResult = (id: string): Promise<t.TImageResult> => request.get(endpoints.imageResult(id));
export const getImageModels = (): Promise<t.TImageModelsConfig> => request.get(endpoints.imageModels());
export const getImageGallery = (cursor?: string): Promise<t.TImageGalleryPage> => request.get(endpoints.imageList(cursor));
```

- [ ] **Step 4: Keys** — add to `QueryKeys`: `imageGallery = 'imageGallery'`, `imageModels = 'imageModels'`, `imageResult = 'imageResult'`; to `MutationKeys`: `imageGenerate = 'imageGenerate'`.

- [ ] **Step 5: build + commit**

Run: `npm run build:data-provider` → ok.
```bash
git add packages/data-provider/src/
git commit -m "feat(images): add data-provider endpoints, services, types for image workspace"
```

---

## Task 5: client data-provider hooks

**Files:** Create `client/src/data-provider/Images/queries.ts`, `mutations.ts`, `index.ts`. Modify `client/src/data-provider/index.ts`.

**Interfaces — Consumes:** Task 4 services/keys/types. **Produces:** `useImageModels`, `useImageGallery`, `useImageResult(predictionId, enabled)`, `useGenerateImage`.

- [ ] **Step 1: `queries.ts`** (mirror `Files/queries.ts`; polling mirrors `previewRefetchInterval`):
```ts
import { useQuery } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type { TImageResult, TImageModelsConfig, TImageGalleryPage } from 'librechat-data-provider';

export const useImageModels = () =>
  useQuery<TImageModelsConfig>([QueryKeys.imageModels], () => dataService.getImageModels(), { staleTime: Infinity });

export const useImageGallery = () =>
  useQuery<TImageGalleryPage>([QueryKeys.imageGallery], () => dataService.getImageGallery(), { refetchOnWindowFocus: false });

const resultInterval = (data?: TImageResult) =>
  data && (data.status === 'completed' || data.status === 'failed') ? false : 3000;

export const useImageResult = (predictionId: string | null, enabled: boolean) =>
  useQuery<TImageResult>(
    [QueryKeys.imageResult, predictionId],
    () => dataService.getImageResult(predictionId ?? ''),
    { enabled: !!predictionId && enabled, refetchInterval: resultInterval, refetchOnWindowFocus: false, retry: false },
  );
```

- [ ] **Step 2: `mutations.ts`**:
```ts
import { useMutation } from '@tanstack/react-query';
import { dataService, MutationKeys } from 'librechat-data-provider';
import type { TImageGenRequest, TImagePrediction } from 'librechat-data-provider';

export const useGenerateImage = (opts?: { onSuccess?: (d: TImagePrediction) => void }) =>
  useMutation([MutationKeys.imageGenerate], { mutationFn: (body: TImageGenRequest) => dataService.generateImage(body), ...opts });
```

- [ ] **Step 3: `index.ts`** re-export both; add `export * from './Images';` to `client/src/data-provider/index.ts`.

- [ ] **Step 4: typecheck + commit**

Run: `cd client && npx tsc --noEmit` (or the project's frontend typecheck) → 0 for these files.
```bash
git add client/src/data-provider/Images client/src/data-provider/index.ts
git commit -m "feat(images): add client data-provider hooks for image workspace"
```

---

## Task 6: Image workspace page + route + nav

**Files:** Create `client/src/components/Images/ImageWorkspace.tsx`, `ImageControls.tsx`, `index.ts`, `layouts/ImagesView.tsx`, `__tests__/ImageWorkspace.spec.tsx`. Modify `client/src/routes/index.tsx`, `client/src/components/UnifiedSidebar/ExpandedPanel.tsx`, `SideMenu.tsx`, `client/src/locales/en/translation.json`.

**Interfaces — Consumes:** Task 5 hooks. **Produces:** `/images` route + working generate flow (gallery is Task 7, rendered as a child).

- [ ] **Step 1: Localization keys** — add to `en/translation.json` (near `com_ui_images`): `com_ui_image_workspace_subtitle` ("Describe an image to generate, or upload a photo to edit with AI"), `com_ui_image_prompt_placeholder` ("Describe the image you want..."), `com_ui_generate` ("Generate"), `com_ui_image_model` ("Model"), `com_ui_aspect_ratio` ("Aspect ratio"), `com_ui_reference_image` ("Reference"), `com_ui_my_images` ("My Images"), `com_ui_no_images` ("You haven't generated any images yet"), `com_ui_image_generating` ("Generating..."), `com_ui_image_failed` ("Generation failed").

- [ ] **Step 2: `ImageControls.tsx`** — controls row: model `Select` (from `useImageModels`), aspect-ratio `Select` (from config), per-model param `Select` (paramValues), reference-image upload button (optional; calls `imageUpload`). Props: current values + onChange. Use existing `~/components/ui` Select primitives. All labels via `useLocalize`.

- [ ] **Step 3: `ImageWorkspace.tsx`** — compose the page:
  - State: `prompt`, `model` (default from `useImageModels().default`), `aspectRatio` ('1:1'), `param`, `imageUrls`, `predictionId`.
  - `useGenerateImage({ onSuccess: (d) => setPredictionId(d.predictionId) })`; on Generate click call `mutate({ prompt, model, aspectRatio, param, imageUrls })`.
  - `const result = useImageResult(predictionId, !!predictionId)`. When `result.data.status === 'completed'`: invalidate `[QueryKeys.imageGallery]`, clear `predictionId`, reset generating state. When `failed`: show localized error.
  - Render: subtitle, prompt textarea, `<ImageControls/>`, Generate button (disabled while generating), a generating placeholder while polling, then `<ImageGallery/>` (Task 7) below.
  - All text via `useLocalize`; semantic HTML + aria-labels.

- [ ] **Step 4: `layouts/ImagesView.tsx`** — default-export wrapper rendering `<ImageWorkspace/>` inside the standard page container (match how `Search`/agents views wrap). Add lazy loader to `routes/index.tsx`:
```tsx
const loadImagesView = () => import('~/components/Images/layouts/ImagesView').then((m) => ({ Component: m.default }));
// in the Root children array, after the agents entries:
{ path: 'images', lazy: loadImagesView },
```

- [ ] **Step 5: Wire nav** — in `ExpandedPanel.tsx` change the Images `QuickNavButton` `href="/c/new"` → `href="/images"`; in `SideMenu.tsx` change the Images `NavRow` `onClick` `navigate('/c/new')` → `navigate('/images')`.

- [ ] **Step 6: Test** — `__tests__/ImageWorkspace.spec.tsx` using `test/layout-test-utils`: mock the data-provider hooks; assert prompt+Generate renders, clicking Generate calls the mutation with the entered prompt/model, and a completed `useImageResult` triggers gallery invalidation / removes the generating state. Cover loading + failed states.

Run: `cd client && npx jest src/components/Images/__tests__/ImageWorkspace.spec.tsx` → PASS.

- [ ] **Step 7: commit**
```bash
git add client/src/components/Images client/src/routes/index.tsx client/src/components/UnifiedSidebar/ExpandedPanel.tsx client/src/components/UnifiedSidebar/SideMenu.tsx client/src/locales/en/translation.json
git commit -m "feat(images): add image workspace page, route, and nav entry"
```

---

## Task 7: Image gallery ("My Images")

**Files:** Create `client/src/components/Images/ImageGallery.tsx`. Modify `ImageWorkspace.tsx` (render gallery), `index.ts`.

**Interfaces — Consumes:** `useImageGallery` (Task 5), existing `Image`/`DialogImage` display components.

- [ ] **Step 1: `ImageGallery.tsx`** — `useImageGallery()`; render a responsive grid of thumbnails. Reuse `~/components/Chat/Messages/Content/Image` (props: `imagePath`, `altText`, `args:{ prompt }`, `width`, `height`) so clicking opens the existing `DialogImage` lightbox with prompt metadata + download. `imagePath` = the File's `filepath` (relative `/images/...` paths are handled by `Image`). Empty state: localized `com_ui_no_images`. Heading `com_ui_my_images`.

- [ ] **Step 2: "Load more"** — if `nextCursor` present, a button refetching with the cursor and appending (or `useInfiniteQuery` if cleaner). Keep MVP: a "Load more" button calling `getImageGallery(nextCursor)` and merging.

- [ ] **Step 3: Render in workspace** — add `<ImageGallery/>` below the controls in `ImageWorkspace.tsx`.

- [ ] **Step 4: Test** — extend a gallery test: empty state renders the localized empty message; with mocked images, thumbnails render and clicking one opens the dialog. Run: `cd client && npx jest src/components/Images` → PASS.

- [ ] **Step 5: commit**
```bash
git add client/src/components/Images
git commit -m "feat(images): add My Images gallery"
```

---

## Self-Review

- **Spec coverage:** §3 UX → Tasks 6/7 (prompt, controls, gallery, voice = reuse STT noted as optional/can defer). §4 async-lite → Tasks 3/5/6 (submit + poll). §5 engines/v3 API → Tasks 1/2. §6 backend service+routes → Tasks 2/3. §7 File reuse + `metadata.imageGen` → Task 2. §8 frontend → Tasks 4/5/6/7. §9 gating TODO → Task 2 Step 3 comment. §10 errors → service throws + route 400/502 + frontend failed state. §11 tests → each backend task + frontend tests. §12 reference-URL reachability → Task 3 (edit uploads must yield gptsapi-reachable URLs; flagged for the implementer).
- **Voice input** (use.ai mic): reuse existing STT is OPTIONAL and not a separate task — implementer may add it to `ImageControls` if trivial, else defer (noted, not silently dropped).
- **Type consistency:** `predictionId` string throughout; `resolveResult` status union matches `TImageResult.status`; `context: 'image_generation'` matches `FileContext`; `metadata.imageGen.{prompt,predictionId}` consistent schema↔service↔query.
- **Open risk (carry to final review):** reference-image edit needs gptsapi-reachable URLs — in local/dev storage this may not be reachable; Task 3/6 should degrade gracefully (disable edit when no public URL). Per-model param mapping verified live only for the 2 default models.
