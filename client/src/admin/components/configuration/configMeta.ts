/**
 * Manual mapping of config sections to tabs and human-readable descriptions.
 *
 * The config *fields* are loaded dynamically from the schema at runtime — adding
 * a new field or nested object in configSchema surfaces it in the UI automatically.
 * However, the schema alone doesn't carry enough information to know:
 *
 *   1. Which tab a top-level section belongs to (endpoints, mcp, ai, files, etc.)
 *   2. What the localized title/description for each section should be
 *
 * So we maintain this map by hand. Any section key not listed here falls into the
 * catch-all "Other" tab, where the UI falls back to a generated i18n key like
 * `com_admin_config_section_${section.key}` for its label and description.
 *
 * Long-term this could be eliminated by enriching @librechat/data-schemas:
 *   - Add a `tab` (or `category`) field to each root-level config group in the
 *     schema itself, mirroring the tab structure defined in CONFIG_TABS.
 *   - Add `titleKey` and `descriptionKey` fields (or a `meta` object) to each
 *     group so localization keys ship alongside the schema rather than being
 *     duplicated here. The admin panel would then just iterate the schema groups
 *     and read their metadata directly.
 *
 * That refactor is out of scope for now since it requires changes to the shared
 * data-schemas package, but it would remove the need for any manual mapping on
 * the admin panel side entirely.
 */

import type * as t from '~/admin/types';

export const CONFIG_TABS: t.ConfigTab[] = [
  { id: 'providers', labelKey: 'com_admin_config_tab_ai_providers' },
  { id: 'custom', labelKey: 'com_admin_config_tab_custom_endpoints' },
  { id: 'specs', labelKey: 'com_admin_config_tab_model_specs' },
  { id: 'mcp', labelKey: 'com_admin_config_tab_mcp' },
  { id: 'features', labelKey: 'com_admin_config_tab_features' },
  { id: 'files', labelKey: 'com_admin_config_tab_files' },
  { id: 'system', labelKey: 'com_admin_config_tab_system' },
];

export const OTHER_TAB: t.ConfigTab = { id: 'other', labelKey: 'com_admin_config_tab_other' };

export const SECTION_META: Record<string, t.SectionMeta> = {
  interface: {
    titleKey: 'com_admin_config_section_interface',
    descriptionKey: 'com_admin_config_section_interface_desc',
    tab: 'features',
    order: 10,
  },
  webSearch: {
    titleKey: 'com_admin_config_section_web_search',
    descriptionKey: 'com_admin_config_section_web_search_desc',
    tab: 'features',
    order: 20,
  },
  memory: {
    titleKey: 'com_admin_config_section_memory',
    descriptionKey: 'com_admin_config_section_memory_desc',
    tab: 'features',
    order: 30,
  },
  speech: {
    titleKey: 'com_admin_config_section_speech',
    descriptionKey: 'com_admin_config_section_speech_desc',
    tab: 'features',
    order: 40,
  },
  ocr: {
    titleKey: 'com_admin_config_section_ocr',
    descriptionKey: 'com_admin_config_section_ocr_desc',
    tab: 'features',
    order: 50,
  },
  summarization: {
    titleKey: 'com_admin_config_section_summarization',
    descriptionKey: 'com_admin_config_section_summarization_desc',
    tab: 'features',
    order: 60,
  },
  actions: {
    titleKey: 'com_admin_config_section_actions',
    descriptionKey: 'com_admin_config_section_actions_desc',
    tab: 'features',
    order: 70,
  },
  filteredTools: {
    titleKey: 'com_admin_config_section_filteredTools',
    descriptionKey: 'com_admin_config_section_filteredTools_desc',
    tab: 'features',
    order: 80,
  },
  includedTools: {
    titleKey: 'com_admin_config_section_includedTools',
    descriptionKey: 'com_admin_config_section_includedTools_desc',
    tab: 'features',
    order: 90,
  },
  messageFilter: {
    titleKey: 'com_admin_config_section_messageFilter',
    descriptionKey: 'com_admin_config_section_messageFilter_desc',
    tab: 'features',
    order: 100,
  },
  filters: {
    titleKey: 'com_admin_config_section_filters',
    descriptionKey: 'com_admin_config_section_filters_desc',
    tab: 'features',
    order: 110,
  },
  langfuse: {
    titleKey: 'com_admin_config_section_langfuse',
    descriptionKey: 'com_admin_config_section_langfuse_desc',
    tab: 'features',
    order: 120,
  },

  fileStrategy: {
    titleKey: 'com_admin_config_section_file_strategy',
    descriptionKey: 'com_admin_config_section_file_strategy_desc',
    tab: 'files',
    order: 10,
    group: 'storage',
  },
  fileStrategies: {
    titleKey: 'com_admin_config_section_fileStrategies',
    descriptionKey: 'com_admin_config_section_fileStrategies_desc',
    tab: 'files',
    order: 20,
    group: 'storage',
  },
  cloudfront: {
    titleKey: 'com_admin_config_section_cloudfront',
    descriptionKey: 'com_admin_config_section_cloudfront_desc',
    tab: 'files',
    order: 30,
    group: 'storage',
  },
  fileConfig: {
    titleKey: 'com_admin_config_section_file_config',
    descriptionKey: 'com_admin_config_section_file_config_desc',
    tab: 'files',
    order: 40,
  },
  imageOutputType: {
    titleKey: 'com_admin_config_section_imageOutputType',
    descriptionKey: 'com_admin_config_section_imageOutputType_desc',
    tab: 'files',
    order: 50,
  },

  endpoints: {
    titleKey: 'com_admin_config_section_endpoints',
    descriptionKey: 'com_admin_config_section_endpoints_desc',
    tab: 'custom',
    pathPrefix: 'endpoints.custom',
  },
  endpointsProviders: {
    titleKey: 'com_admin_config_section_ai_providers',
    descriptionKey: 'com_admin_config_section_ai_providers_desc',
    tab: 'providers',
    schemaKey: 'endpoints',
    excludePrefix: 'endpoints.custom',
  },
  modelSpecs: {
    titleKey: 'com_admin_config_section_model_specs',
    descriptionKey: 'com_admin_config_section_model_specs_desc',
    tab: 'specs',
  },
  mcpServers: {
    titleKey: 'com_admin_config_section_mcp_servers',
    descriptionKey: 'com_admin_config_section_mcp_servers_desc',
    tab: 'mcp',
    order: 10,
  },
  mcpSettings: {
    titleKey: 'com_admin_config_section_mcp_settings',
    descriptionKey: 'com_admin_config_section_mcp_settings_desc',
    tab: 'mcp',
    order: 20,
  },

  registration: {
    titleKey: 'com_admin_config_section_registration',
    descriptionKey: 'com_admin_config_section_registration_desc',
    tab: 'system',
    order: 10,
  },
  balance: {
    titleKey: 'com_admin_config_section_balance',
    descriptionKey: 'com_admin_config_section_balance_desc',
    tab: 'system',
    order: 20,
  },
  transactions: {
    titleKey: 'com_admin_config_section_transactions',
    descriptionKey: 'com_admin_config_section_transactions_desc',
    tab: 'system',
    order: 30,
  },
  permissions: {
    titleKey: 'com_admin_config_section_permissions',
    descriptionKey: 'com_admin_config_section_permissions_desc',
    tab: 'system',
    order: 40,
  },
  rateLimits: {
    titleKey: 'com_admin_config_section_rate_limits',
    descriptionKey: 'com_admin_config_section_rate_limits_desc',
    tab: 'system',
    order: 50,
  },
  turnstile: {
    titleKey: 'com_admin_config_section_turnstile',
    descriptionKey: 'com_admin_config_section_turnstile_desc',
    tab: 'system',
    order: 60,
  },
  secureImageLinks: {
    titleKey: 'com_admin_config_section_secureImageLinks',
    descriptionKey: 'com_admin_config_section_secureImageLinks_desc',
    tab: 'system',
    order: 70,
  },
  openapi: {
    titleKey: 'com_admin_config_section_openapi',
    descriptionKey: 'com_admin_config_section_openapi_desc',
    tab: 'system',
    order: 80,
  },
  skillSync: {
    titleKey: 'com_admin_config_section_skillSync',
    descriptionKey: 'com_admin_config_section_skillSync_desc',
    tab: 'system',
    order: 90,
  },
  /* SassyChat's own sections. */
  organizations: {
    titleKey: 'com_admin_config_section_organizations',
    descriptionKey: 'com_admin_config_section_organizations_desc',
    tab: 'system',
    order: 5,
  },
  emailChange: {
    titleKey: 'com_admin_config_section_emailChange',
    descriptionKey: 'com_admin_config_section_emailChange_desc',
    tab: 'system',
    order: 12,
  },
  passkeys: {
    titleKey: 'com_admin_config_section_passkeys',
    descriptionKey: 'com_admin_config_section_passkeys_desc',
    tab: 'system',
    order: 14,
  },
  skillDeletion: {
    titleKey: 'com_admin_config_section_skillDeletion',
    descriptionKey: 'com_admin_config_section_skillDeletion_desc',
    tab: 'system',
    order: 95,
  },
  credentials: {
    titleKey: 'com_admin_config_section_credentials',
    descriptionKey: 'com_admin_config_section_credentials_desc',
    tab: 'system',
    order: 100,
  },
  conversationList: {
    titleKey: 'com_admin_config_section_conversationList',
    descriptionKey: 'com_admin_config_section_conversationList_desc',
    tab: 'system',
    order: 110,
  },
  projects: {
    titleKey: 'com_admin_config_section_projects',
    descriptionKey: 'com_admin_config_section_projects_desc',
    tab: 'features',
    order: 130,
  },
  githubCompare: {
    titleKey: 'com_admin_config_section_githubCompare',
    descriptionKey: 'com_admin_config_section_githubCompare_desc',
    tab: 'features',
    order: 140,
  },
  toolCallPreviews: {
    titleKey: 'com_admin_config_section_toolCallPreviews',
    descriptionKey: 'com_admin_config_section_toolCallPreviews_desc',
    tab: 'features',
    order: 150,
  },
  mcpAppSandbox: {
    titleKey: 'com_admin_config_section_mcpAppSandbox',
    descriptionKey: 'com_admin_config_section_mcpAppSandbox_desc',
    tab: 'mcp',
    order: 30,
  },
  fileListLimit: {
    titleKey: 'com_admin_config_section_fileListLimit',
    descriptionKey: 'com_admin_config_section_fileListLimit_desc',
    tab: 'files',
    order: 60,
  },
};

/** Sections omitted from the UI entirely (legacy fields pending removal from the schema). */
export const HIDDEN_SECTIONS = new Set(['version', 'cache']);

export function splitCamelCase(str: string): string[] {
  return str.replace(/([a-z])([A-Z])/g, '$1 $2').split(/\s+/);
}

/** Display title for a section without a locale key (`mcpAppSandbox` → `Mcp App Sandbox`). */
export function fallbackSectionTitle(key: string): string {
  return splitCamelCase(key)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Sort key of a section within its tab: SECTION_META `order`, unordered sections last. */
export function sectionOrder(id: string): number {
  return SECTION_META[id]?.order ?? Number.MAX_SAFE_INTEGER;
}

/** Orders a tab's sections by SECTION_META `order`, then by key. */
export function compareSections(a: { id: string }, b: { id: string }): number {
  return sectionOrder(a.id) - sectionOrder(b.id) || a.id.localeCompare(b.id);
}

/**
 * Whether a config path is shown by a section: under its data key and, for
 * sections that split one schema section (custom endpoints vs providers),
 * inside `pathPrefix` and outside `excludePrefix`.
 */
export function isPathInSection(sectionId: string, dataKey: string, path: string): boolean {
  if (!isPathUnder(path, dataKey)) return false;
  const meta = SECTION_META[sectionId];
  if (!meta) return true;
  if (
    meta.pathPrefix &&
    !isPathUnder(path, meta.pathPrefix) &&
    !isPathUnder(meta.pathPrefix, path)
  ) {
    return false;
  }
  return !(meta.excludePrefix && isPathUnder(path, meta.excludePrefix));
}

/** The tab that renders a config path (`balance.startBalance` → `system`). */
export function tabForPath(path: string): string {
  const root = path.split('.')[0];
  for (const [sectionId, meta] of Object.entries(SECTION_META)) {
    if ((meta.schemaKey ?? sectionId) !== root) continue;
    if (isPathInSection(sectionId, root, path)) return meta.tab;
  }
  return OTHER_TAB.id;
}

/** `path` equals `prefix` or lies below it. */
export function isPathUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}.`);
}
