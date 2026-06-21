import type { AppConfig } from '@librechat/data-schemas';
import type { RunConfig } from '@librechat/agents';
import { isFalseEnv, normalizeString } from './utils';

type LangfuseRunConfig = NonNullable<RunConfig['langfuse']>;
const TENANT_EXPORT_METADATA_KEY = 'librechat.langfuse.tenant_export.enabled';

function isTenantExportEnabled(): boolean {
  return !isFalseEnv(process.env.LANGFUSE_FANOUT_TENANT_EXPORT_ENABLED);
}

function mergeTraceMetadata(
  base: LangfuseRunConfig['metadata'],
  tenantId?: string,
): LangfuseRunConfig['metadata'] | undefined {
  if (!tenantId) {
    return base;
  }
  return {
    ...(base ?? {}),
    'librechat.tenant.id': tenantId,
  };
}

function mergeTags(tags: string[] | undefined, tenantId?: string): string[] | undefined {
  if (!tenantId) {
    return tags;
  }
  return [...new Set([...(tags ?? []), `tenant:${tenantId}`])];
}

export function buildLangfuseConfig({
  appConfig,
  tenantId,
}: {
  appConfig?: AppConfig;
  tenantId?: string;
} = {}): LangfuseRunConfig {
  const normalizedTenantId = normalizeString(tenantId);
  const config = appConfig?.langfuse;

  const langfuse: LangfuseRunConfig = {
    deterministicTraceId: true,
  };
  const metadata = mergeTraceMetadata(undefined, normalizedTenantId);
  const tags = mergeTags(undefined, normalizedTenantId);
  if (metadata) {
    langfuse.metadata = metadata;
  }
  if (tags) {
    langfuse.tags = tags;
  }

  if (config?.enabled === false) {
    return {
      ...langfuse,
      enabled: false,
    };
  }

  const publicKey = normalizeString(config?.publicKey);
  const secretKey = normalizeString(config?.secretKey);
  const hasTenantCredentials = Boolean(publicKey && secretKey);
  const fanout = config?.fanout;
  const fanoutEnabled =
    fanout?.enabled !== false &&
    (fanout?.enabled === true || process.env.LANGFUSE_FANOUT_ENABLED === 'true');
  const fanoutCollectorUrl =
    normalizeString(fanout?.collectorUrl) ?? normalizeString(process.env.LANGFUSE_FANOUT_COLLECTOR_URL);
  const tenantExportEnabled = hasTenantCredentials && fanoutEnabled && isTenantExportEnabled();

  if (hasTenantCredentials && (!fanoutEnabled || tenantExportEnabled)) {
    langfuse.publicKey = publicKey;
    langfuse.secretKey = secretKey;
  }

  const baseUrl = fanoutEnabled && fanoutCollectorUrl ? fanoutCollectorUrl : normalizeString(config?.baseUrl);
  if (baseUrl) {
    langfuse.baseUrl = baseUrl;
  }

  if (tenantExportEnabled) {
    langfuse.metadata = {
      ...(langfuse.metadata ?? {}),
      [TENANT_EXPORT_METADATA_KEY]: 'true',
    };
  }

  return langfuse;
}
