import type { AppConfig } from '@librechat/data-schemas';
import type { RunConfig } from '@librechat/agents';
import { resolveLangfuseTenantDestination } from './tenantDestinations';
import { normalizeString } from '~/utils/text';
import { isTrueEnv } from './utils';

type LangfuseRunConfig = NonNullable<RunConfig['langfuse']>;
type LangfuseAppConfig = NonNullable<AppConfig['langfuse']>;
export type LangfuseFanoutConfig = LangfuseAppConfig['fanout'] & {
  collectorUrl?: string;
};
type LangfuseRunConfigWithTraceAttributes = LangfuseRunConfig & {
  librechatTraceAttributes?: Record<string, string | number | boolean | null | undefined>;
};
const TENANT_EXPORT_ATTRIBUTE = 'librechat.langfuse.tenant_export.enabled';
const TENANT_DESTINATION_ATTRIBUTE = 'librechat.langfuse.destination';
const DEFAULT_BASE_URL = 'https://cloud.langfuse.com';

export function isLangfuseTenantExportEnabled(): boolean {
  return !isTrueEnv(process.env.LANGFUSE_FANOUT_TENANT_EXPORT_DISABLED);
}

export function isLangfuseFanoutEnabled(fanout?: LangfuseFanoutConfig): boolean {
  return (
    fanout?.enabled !== false &&
    (fanout?.enabled === true || isTrueEnv(process.env.LANGFUSE_FANOUT_ENABLED))
  );
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

function applyCentralEnvConfig(langfuse: LangfuseRunConfigWithTraceAttributes): void {
  const publicKey = normalizeString(process.env.LANGFUSE_PUBLIC_KEY);
  const secretKey = normalizeString(process.env.LANGFUSE_SECRET_KEY);
  if (publicKey && secretKey) {
    langfuse.publicKey = publicKey;
    langfuse.secretKey = secretKey;
    langfuse.baseUrl =
      normalizeString(process.env.LANGFUSE_BASE_URL) ??
      normalizeString(process.env.LANGFUSE_HOST) ??
      normalizeString(process.env.LANGFUSE_BASEURL) ??
      DEFAULT_BASE_URL;
  }
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
  const fanout = config?.fanout as LangfuseFanoutConfig | undefined;
  const fanoutEnabled = isLangfuseFanoutEnabled(fanout);
  const fanoutCollectorUrl =
    normalizeString(fanout?.collectorUrl) ??
    normalizeString(process.env.LANGFUSE_FANOUT_COLLECTOR_URL);
  const tenantDestination = resolveLangfuseTenantDestination(config?.baseUrl);
  const tenantExportEnabled =
    hasTenantCredentials &&
    fanoutEnabled &&
    isLangfuseTenantExportEnabled() &&
    Boolean(tenantDestination) &&
    Boolean(fanoutCollectorUrl);

  if (tenantExportEnabled) {
    langfuse.publicKey = publicKey;
    langfuse.secretKey = secretKey;
    langfuse.baseUrl = fanoutCollectorUrl;
    langfuse.librechatTraceAttributes = {
      ...(langfuse.librechatTraceAttributes ?? {}),
      [TENANT_EXPORT_ATTRIBUTE]: 'true',
      [TENANT_DESTINATION_ATTRIBUTE]: tenantDestination?.key,
    };
  } else if (fanoutEnabled && fanoutCollectorUrl) {
    langfuse.baseUrl = fanoutCollectorUrl;
  } else {
    applyCentralEnvConfig(langfuse);
  }

  return langfuse;
}
