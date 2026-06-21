import type { AppConfig } from '@librechat/data-schemas';
import type { RunConfig } from '@librechat/agents';
import { resolveLangfuseTenantDestination } from './tenantDestinations';
import { isEnabledUnlessBlankOrFalse, normalizeString } from './utils';

type LangfuseRunConfig = NonNullable<RunConfig['langfuse']>;
type LangfuseRunConfigWithTraceAttributes = LangfuseRunConfig & {
  librechatTraceAttributes?: Record<string, string | number | boolean | null | undefined>;
};
const TENANT_EXPORT_ATTRIBUTE = 'librechat.langfuse.tenant_export.enabled';
const TENANT_DESTINATION_ATTRIBUTE = 'librechat.langfuse.destination';

function isTenantExportEnabled(): boolean {
  return isEnabledUnlessBlankOrFalse(process.env.LANGFUSE_FANOUT_TENANT_EXPORT_ENABLED);
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

  const langfuse: LangfuseRunConfigWithTraceAttributes = {
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
    normalizeString(fanout?.collectorUrl) ??
    normalizeString(process.env.LANGFUSE_FANOUT_COLLECTOR_URL);
  const tenantDestination = resolveLangfuseTenantDestination(config?.baseUrl);
  const tenantExportEnabled =
    hasTenantCredentials && fanoutEnabled && isTenantExportEnabled() && Boolean(tenantDestination);

  const directTenantExportEnabled = hasTenantCredentials && !fanoutEnabled;
  if (directTenantExportEnabled || tenantExportEnabled) {
    langfuse.publicKey = publicKey;
    langfuse.secretKey = secretKey;
  }

  const baseUrl =
    fanoutEnabled && fanoutCollectorUrl ? fanoutCollectorUrl : normalizeString(config?.baseUrl);
  if (baseUrl) {
    langfuse.baseUrl = baseUrl;
  }

  if (tenantExportEnabled) {
    langfuse.librechatTraceAttributes = {
      ...(langfuse.librechatTraceAttributes ?? {}),
      [TENANT_EXPORT_ATTRIBUTE]: 'true',
      [TENANT_DESTINATION_ATTRIBUTE]: tenantDestination?.key,
    };
  }

  return langfuse;
}
