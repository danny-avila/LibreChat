import { getConfigMergeRules } from '@librechat/data-schemas';
import {
  Constants,
  configSchema,
  PERMISSION_SUB_KEYS,
  BASE_ONLY_CONFIG_PATHS,
  DATA_PROVIDER_VERSION,
  BASE_ONLY_CONFIG_SECTIONS,
  PROCESS_MCP_SERVER_FIELDS,
  INTERFACE_PERMISSION_FIELDS,
  BASE_PRINCIPAL_CONFIG_SECTIONS,
  RUNTIME_CONFIG_INTERFACE_FIELDS,
} from 'librechat-data-provider';
import type { AdminConfigFeatures, AdminConfigMeta } from '@librechat/data-schemas';
import { getConfigSecretRules } from './secrets';

/**
 * The admin config behaviours this server has. A change flips its own flag when it wires the
 * behaviour; `meta.spec.ts` checks every flag against the behaviour itself, so a flag cannot
 * claim what the server does not do, nor stay off once it does.
 */
export const ADMIN_CONFIG_FEATURES: Readonly<AdminConfigFeatures> = {
  dottedKeys: true,
  sectionAllowlist: true,
  readFilteredWriteResponses: true,
  preAuthBaseOverrides: true,
  webSearchStoredKeys: true,
  expectedRevision: true,
  prunesEmptyParents: true,
  awaitedInvalidation: true,
  changesBatch: true,
  yamlMcpHide: true,
  deterministicPrecedence: true,
  priorityRoute: true,
  principalCheck: true,
  roleRenameMovesProfile: true,
  recordSecrets: true,
  azureGroupSecrets: true,
  yamlSecretPreview: true,
  envAllowlist: true,
  secretRebinding: true,
};

/**
 * The contract `GET /api/admin/config/meta` reports, built from the constants the server
 * enforces rather than restated, so the rules a client mirrors cannot drift from them.
 */
export function buildAdminConfigMeta(limits: AdminConfigMeta['limits']): AdminConfigMeta {
  return {
    metaVersion: 1,
    versions: {
      librechat: String(Constants.VERSION),
      dataProvider: DATA_PROVIDER_VERSION,
      configSchema: String(Constants.CONFIG_VERSION),
    },
    features: { ...ADMIN_CONFIG_FEATURES },
    limits: { ...limits },
    rules: {
      acceptedSections: Object.keys(configSchema.shape),
      baseOnlySections: [...BASE_ONLY_CONFIG_SECTIONS],
      basePrincipalSections: [...BASE_PRINCIPAL_CONFIG_SECTIONS],
      baseOnlyPaths: [...BASE_ONLY_CONFIG_PATHS],
      ...getConfigMergeRules(),
      ...getConfigSecretRules(),
      processMcpFields: [...PROCESS_MCP_SERVER_FIELDS],
      interface: {
        permissionFields: [...INTERFACE_PERMISSION_FIELDS],
        runtimeFields: [...RUNTIME_CONFIG_INTERFACE_FIELDS],
        permissionSubKeys: [...PERMISSION_SUB_KEYS],
      },
      titleResolution: 'field',
    },
  };
}
