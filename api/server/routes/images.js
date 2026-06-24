const express = require('express');
const axios = require('axios');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { CacheKeys } = require('librechat-data-provider');
const {
  submitGeneration,
  resolveResult,
  IMAGE_MODELS,
  DEFAULT_IMAGE_MODEL_ID,
  ASPECT_RATIOS,
  getStorageMetadata,
} = require('@librechat/api');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { getFileStrategy } = require('~/server/utils/getFileStrategy');
const { getAppConfig } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();
router.use(requireJwtAuth);

/** @returns {{ baseUrl: string, apiKey: string }} */
const cfg = () => ({
  baseUrl: process.env.GPTSAPI_BASE_URL || 'https://api.gptsapi.net',
  apiKey: process.env.GPTSAPI_KEY,
});

const PENDING_TTL = 30 * 60 * 1000;

router.get('/models', (req, res) => {
  res.json({ models: IMAGE_MODELS, default: DEFAULT_IMAGE_MODEL_ID, aspectRatios: ASPECT_RATIOS });
});

router.post('/generate', async (req, res) => {
  try {
    const { prompt, model, aspectRatio, param, imageUrls } = req.body;
    const { predictionId } = await submitGeneration(
      {
        model: model || DEFAULT_IMAGE_MODEL_ID,
        prompt,
        aspectRatio: aspectRatio || '1:1',
        param,
        imageUrls,
      },
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
        return {
          buffer,
          contentType: r.headers['content-type'] || 'image/png',
          width: meta.width,
          height: meta.height,
        };
      },
      saveImageFile: async ({ userId, buffer, contentType }) => {
        const source = getFileStrategy(appConfig, { isImage: true });
        const { saveBuffer } = getStrategyFunctions(source);
        const ext = contentType.includes('jpeg') ? 'jpg' : 'png';
        const filename = `${uuidv4()}.${ext}`;
        const filepath = await saveBuffer({
          userId,
          buffer,
          fileName: filename,
          tenantId: req.user.tenantId,
        });
        return {
          filepath,
          source,
          bytes: buffer.length,
          filename,
          storageMetadata: getStorageMetadata({ filepath, source }),
        };
      },
      createFileRecord: (doc) => db.createFile({ ...doc, tenantId: req.user.tenantId }, true),
      findFileByPrediction: async (userId, pid) => {
        const files = await db.getFiles(
          { user: userId, 'metadata.imageGen.predictionId': pid },
          {},
          {},
        );
        return files && files[0] ? files[0] : null;
      },
    };
    const out = await resolveResult(
      {
        predictionId,
        userId: req.user.id,
        model: ctx.model || 'unknown',
        prompt: ctx.prompt || '',
      },
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
