import type { AppConfig } from '@librechat/data-schemas';
import type { RunConfig } from '@librechat/agents';
import { isTrueEnv, normalizeBoolean, resolveTenantCredentials } from './utils';
import { resolveLangfuseTenantDestination } from './tenantDestinations';
import { normalizeString } from '~/utils/text';

type LangfuseRunConfig = NonNullable<RunConfig['langfuse']>;
type LangfuseAppConfig = NonNullable<AppConfig['langfuse']>;
export type LangfuseFanoutConfig = LangfuseAppConfig['fanout'];
type LangfuseRunConfigWithTraceAttributes = LangfuseRunConfig & {
  librechatTraceAttributes?: Record<string, string | number | boolean | null | undefined>;
};
type LangfuseTenantDestination = NonNullable<ReturnType<typeof resolveLangfuseTenantDestination>>;
type LangfuseExportPlan =
  | { type: 'directCentral' }
  | { type: 'disabled' }
  | { type: 'fanoutCollector'; collectorUrl: string }
  | {
      type: 'tenantFanout';
      collectorUrl: string;
      destination: LangfuseTenantDestination;
      publicKey: string;
      secretKey: string;
    };
const TENANT_EXPORT_ATTRIBUTE = 'librechat.langfuse.tenant_export.enabled';
const TENANT_DESTINATION_ATTRIBUTE = 'librechat.langfuse.destination';
const CENTRAL_EXPORT_ATTRIBUTE = 'librechat.langfuse.central_export.enabled';
const CENTRAL_MEDIA_DISABLED_SEGMENT = 'central-media-disabled';
const DEFAULT_BASE_URL = 'https://cloud.langfuse.com';

function appendPath(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

export function isLangfuseTenantExportEnabled(): boolean {
  return !isTrueEnv(process.env.LANGFUSE_FANOUT_TENANT_EXPORT_DISABLED);
}

export function isLangfuseFanoutEnabled(fanout?: LangfuseFanoutConfig): boolean {
  const enabled = normalizeBoolean(fanout?.enabled);
  return enabled !== false && (enabled === true || isTrueEnv(process.env.LANGFUSE_FANOUT_ENABLED));
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

function disableCentralExport(langfuse: LangfuseRunConfigWithTraceAttributes): void {
  langfuse.librechatTraceAttributes = {
    ...(langfuse.librechatTraceAttributes ?? {}),
    [CENTRAL_EXPORT_ATTRIBUTE]: 'false',
  };
}

function resolveLangfuseExportPlan({
  centralTraceExportEnabled,
  fanoutEnabled,
  fanoutCollectorUrl,
  tenantExportEnabled,
  publicKey,
  secretKey,
  tenantDestination,
}: {
  centralTraceExportEnabled: boolean;
  fanoutEnabled: boolean;
  fanoutCollectorUrl?: string;
  tenantExportEnabled: boolean;
  publicKey?: string;
  secretKey?: string;
  tenantDestination?: LangfuseTenantDestination;
}): LangfuseExportPlan {
  if (!fanoutEnabled || fanoutCollectorUrl == null) {
    return centralTraceExportEnabled ? { type: 'directCentral' } : { type: 'disabled' };
  }

  const canRouteTenantFanout =
    tenantExportEnabled && publicKey != null && secretKey != null && tenantDestination != null;

  if (canRouteTenantFanout) {
    return {
      type: 'tenantFanout',
      collectorUrl: fanoutCollectorUrl,
      destination: tenantDestination,
      publicKey,
      secretKey,
    };
  }

  // Direct central export can use the collector normally. Central-suppressed
  // runs only reach the collector through a concrete tenant fanout route.
  if (centralTraceExportEnabled) {
    return { type: 'fanoutCollector', collectorUrl: fanoutCollectorUrl };
  }

  return { type: 'disabled' };
}

export function buildLangfuseConfig({
  appConfig,
  tenantId,
  centralTraceExportEnabled = true,
}: {
  appConfig?: AppConfig;
  tenantId?: string;
  /**
   * Defaults to true. Set false to suppress central Langfuse export for this
   * run. Fanout deployments stamp a routing attribute that the collector uses
   * to drop the central pipeline while preserving tenant fanout when available.
   */
  centralTraceExportEnabled?: boolean;
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

  if (normalizeBoolean(config?.enabled) === false) {
    return {
      ...langfuse,
      enabled: false,
    };
  }
  if (!centralTraceExportEnabled) {
    disableCentralExport(langfuse);
  }

  const tenantCredentials = resolveTenantCredentials(config);
  const hasTenantCredentials = Boolean(tenantCredentials);
  const fanout = config?.fanout as LangfuseFanoutConfig | undefined;
  const fanoutEnabled = isLangfuseFanoutEnabled(fanout);
  const fanoutCollectorUrl = normalizeString(process.env.LANGFUSE_FANOUT_COLLECTOR_URL);
  const tenantDestination = resolveLangfuseTenantDestination(config?.destination);
  const tenantExportEmergencyEnabled = isLangfuseTenantExportEnabled();
  const exportPlan = resolveLangfuseExportPlan({
    centralTraceExportEnabled,
    fanoutEnabled,
    fanoutCollectorUrl,
    tenantExportEnabled: hasTenantCredentials && tenantExportEmergencyEnabled,
    publicKey: tenantCredentials?.publicKey,
    secretKey: tenantCredentials?.secretKey,
    tenantDestination,
  });

  switch (exportPlan.type) {
    case 'tenantFanout':
      langfuse.publicKey = exportPlan.publicKey;
      langfuse.secretKey = exportPlan.secretKey;
      langfuse.baseUrl = appendPath(
        exportPlan.collectorUrl,
        [
          '',
          'tenant',
          exportPlan.destination.key,
          ...(!centralTraceExportEnabled ? [CENTRAL_MEDIA_DISABLED_SEGMENT] : []),
        ].join('/'),
      );
      // TODO: Add support in @librechat/agents for Langfuse additionalHeaders and
      // route by headers if we need multiple tenant Langfuse exports for one run.
      // The destination-scoped URL is the current app-to-gateway routing contract.
      langfuse.librechatTraceAttributes = {
        ...(langfuse.librechatTraceAttributes ?? {}),
        [TENANT_EXPORT_ATTRIBUTE]: 'true',
        [TENANT_DESTINATION_ATTRIBUTE]: exportPlan.destination.key,
      };
      break;
    case 'fanoutCollector':
      langfuse.baseUrl = exportPlan.collectorUrl;
      break;
    case 'disabled':
      langfuse.enabled = false;
      break;
    case 'directCentral':
      applyCentralEnvConfig(langfuse);
      break;
  }

  return langfuse;
}
