const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });

const { BASE_CONFIG_PRINCIPAL_ID, tenantStorage } = require('@librechat/data-schemas');
const { PrincipalType, PrincipalModel } = require('librechat-data-provider');

let mongoose;

function readJsonEnv(name) {
  const raw = process.env[name];
  if (!raw || raw.trim() === '') {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${name} must be valid JSON: ${error.message}`);
  }
}

function normalizeString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function normalizeTenantConfigs(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('LANGFUSE_FANOUT_SEED_TENANT_CONFIGS must be an object keyed by tenant id');
  }

  return Object.entries(value).map(([tenantId, config]) => {
    if (config == null || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`Tenant ${tenantId} config must be an object`);
    }
    const publicKey = normalizeString(config.publicKey ?? config.public_key);
    const secretKey = normalizeString(config.secretKey ?? config.secret_key);
    if (config.enabled !== false && (!publicKey || !secretKey)) {
      throw new Error(`Tenant ${tenantId} requires publicKey and secretKey unless enabled=false`);
    }
    return {
      tenantId,
      enabled: config.enabled,
      publicKey,
      secretKey,
      baseUrl: normalizeString(config.baseUrl ?? config.base_url),
      fanoutBaseUrl: normalizeString(config.fanoutBaseUrl ?? config.fanout_base_url),
    };
  });
}

async function patchTenantLangfuseConfig({ tenantId, langfuse, patchConfigFields }) {
  return tenantStorage.run({ tenantId }, () =>
    patchConfigFields(
      PrincipalType.ROLE,
      BASE_CONFIG_PRINCIPAL_ID,
      PrincipalModel.ROLE,
      { langfuse },
      0,
    ),
  );
}

(async () => {
  const tenantConfigs = normalizeTenantConfigs(
    readJsonEnv('LANGFUSE_FANOUT_SEED_TENANT_CONFIGS') ?? {},
  );
  if (tenantConfigs.length === 0) {
    console.log(
      'No tenant configs found. Set LANGFUSE_FANOUT_SEED_TENANT_CONFIGS to seed tenant Langfuse configs.',
    );
    process.exit(0);
  }

  mongoose = require('mongoose');
  require('@librechat/data-schemas').createModels(mongoose);
  const connect = require('./connect');
  const { patchConfigFields } = require('~/models');

  const defaultFanoutBaseUrl =
    normalizeString(process.env.LANGFUSE_FANOUT_BASE_URL) ??
    'http://langfuse-fanout-collector:4318';

  await connect();

  for (const config of tenantConfigs) {
    const langfuse = {
      ...(config.enabled === false ? { enabled: false } : {}),
      ...(config.publicKey ? { publicKey: config.publicKey } : {}),
      ...(config.secretKey ? { secretKey: config.secretKey } : {}),
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
      fanout: {
        enabled: config.enabled !== false,
        baseUrl: config.fanoutBaseUrl ?? defaultFanoutBaseUrl,
      },
    };
    await patchTenantLangfuseConfig({ tenantId: config.tenantId, langfuse, patchConfigFields });
    console.purple(`Seeded Langfuse fanout config for tenant ${config.tenantId}`);
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch(async (error) => {
  console.error(error);
  if (mongoose?.connection?.readyState) {
    await mongoose.disconnect().catch(() => undefined);
  }
  process.exit(1);
});
