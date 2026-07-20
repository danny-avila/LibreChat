const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');

/**
 * 항목 7: `bkl_app_settings` 컬렉션 기반 앱 설정.
 * 현재는 모델 관리 1건 (`key: 'models'`) — 사용 가능 모델 목록과 기본 모델을
 * 어드민에서 편집하면 librechat.yaml 값 대신 적용된다.
 */

const COLLECTION = 'bkl_app_settings';
const DEFAULT_ENDPOINT = 'BKL DB AI';

function getDb() {
  const conn = mongoose.connection;
  if (!conn || conn.readyState !== 1) {
    return null;
  }
  return conn.db;
}

/**
 * @returns {Promise<{endpoint: string, models: string[], defaultModel: string|null}|null>}
 */
async function getModelSettings() {
  try {
    const db = getDb();
    if (!db) {
      return null;
    }
    const doc = await db.collection(COLLECTION).findOne({ key: 'models' });
    if (!doc || !Array.isArray(doc.models) || doc.models.length === 0) {
      return null;
    }
    return {
      endpoint: doc.endpoint || DEFAULT_ENDPOINT,
      models: doc.models.map(String),
      defaultModel: doc.defaultModel || null,
    };
  } catch (err) {
    logger.warn('[bklAppSettings] failed to read model settings', err);
    return null;
  }
}

/**
 * modelsConfig 에 어드민 설정을 적용한다. 기본 모델은 목록 맨 앞에 배치되어
 * 새 대화의 초기 선택 모델이 된다.
 */
async function applyModelSettings(modelsConfig) {
  const settings = await getModelSettings();
  if (!settings || !modelsConfig) {
    return modelsConfig;
  }
  const { endpoint, models, defaultModel } = settings;
  if (!(endpoint in modelsConfig)) {
    return modelsConfig;
  }
  let ordered = [...models];
  if (defaultModel && ordered.includes(defaultModel)) {
    ordered = [defaultModel, ...ordered.filter((m) => m !== defaultModel)];
  }
  modelsConfig[endpoint] = ordered;
  return modelsConfig;
}

async function setModelSettings({ endpoint, models, defaultModel }) {
  const db = getDb();
  if (!db) {
    throw new Error('MongoDB not connected');
  }
  await db.collection(COLLECTION).updateOne(
    { key: 'models' },
    {
      $set: {
        endpoint: endpoint || DEFAULT_ENDPOINT,
        models: Array.isArray(models) ? models.map(String) : [],
        defaultModel: defaultModel || null,
        updatedAt: new Date(),
      },
      $setOnInsert: { key: 'models', createdAt: new Date() },
    },
    { upsert: true },
  );
}

async function clearModelSettings() {
  const db = getDb();
  if (!db) {
    throw new Error('MongoDB not connected');
  }
  await db.collection(COLLECTION).deleteOne({ key: 'models' });
}

module.exports = {
  COLLECTION,
  DEFAULT_ENDPOINT,
  getModelSettings,
  applyModelSettings,
  setModelSettings,
  clearModelSettings,
};
