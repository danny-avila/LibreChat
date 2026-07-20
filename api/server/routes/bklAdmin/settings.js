const express = require('express');
const { CacheKeys } = require('librechat-data-provider');
const {
  DEFAULT_ENDPOINT,
  getModelSettings,
  setModelSettings,
  clearModelSettings,
} = require('~/server/services/bklAppSettings');
const { getLogStores } = require('~/cache');

const router = express.Router();

/** 항목 7: 모델 관리 — 사용 가능 모델 목록 + 기본 모델 지정 */

async function invalidateModelsCache() {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  await cache.delete(CacheKeys.MODELS_CONFIG);
}

router.get('/settings/models', async (_req, res) => {
  try {
    const settings = await getModelSettings();
    res.json({
      data: settings ?? { endpoint: DEFAULT_ENDPOINT, models: [], defaultModel: null },
      overridden: settings != null,
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.put('/settings/models', async (req, res) => {
  try {
    const { endpoint, models, default_model: defaultModel } = req.body || {};
    if (!Array.isArray(models) || models.length === 0) {
      return res.status(400).json({ error: 'models[] required (or DELETE to reset)' });
    }
    if (defaultModel && !models.includes(defaultModel)) {
      return res.status(400).json({ error: 'default_model must be one of models' });
    }
    await setModelSettings({ endpoint, models, defaultModel });
    await invalidateModelsCache();
    res.json({ updated: true });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

/** 설정 제거 → librechat.yaml 값으로 복귀 */
router.delete('/settings/models', async (_req, res) => {
  try {
    await clearModelSettings();
    await invalidateModelsCache();
    res.json({ reset: true });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

module.exports = router;
