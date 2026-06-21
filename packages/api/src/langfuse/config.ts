import type { AppConfig } from '@librechat/data-schemas';
import type { RunConfig } from '@librechat/agents';
import { normalizeString } from './utils';

type LangfuseRunConfig = NonNullable<RunConfig['langfuse']>;

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
    metadata: mergeTraceMetadata(undefined, normalizedTenantId),
    tags: mergeTags(undefined, normalizedTenantId),
  };

  if (config?.enabled === false) {
    return {
      ...langfuse,
      enabled: false,
    };
  }

  const publicKey = normalizeString(config?.publicKey);
  const secretKey = normalizeString(config?.secretKey);
  const hasTenantCredentials = Boolean(publicKey && secretKey);
  if (hasTenantCredentials) {
    langfuse.publicKey = publicKey;
    langfuse.secretKey = secretKey;

    const fanout = config?.fanout;
    const fanoutEnabled =
      fanout?.enabled !== false &&
      (fanout?.enabled === true || process.env.LANGFUSE_FANOUT_ENABLED === 'true');
    const fanoutCollectorUrl =
      normalizeString(fanout?.collectorUrl) ??
      normalizeString(process.env.LANGFUSE_FANOUT_COLLECTOR_URL);
    const baseUrl =
      fanoutEnabled && fanoutCollectorUrl ? fanoutCollectorUrl : normalizeString(config?.baseUrl);

    if (baseUrl) {
      langfuse.baseUrl = baseUrl;
    }
  }

  return langfuse;
}
