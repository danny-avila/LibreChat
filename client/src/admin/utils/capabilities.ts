import type { SchemaField } from '~/admin/types/config';
import { SystemCapabilities } from '~/admin/constants';

/**
 * Mirrors the backend `hasConfigCapability` fallback logic.
 * Expects `hasCapability` to be implication-aware (i.e. MANAGE_CONFIGS
 * already implies READ_CONFIGS via `hasImpliedCapability`).
 *   1. Broad capability check (READ_CONFIGS or MANAGE_CONFIGS by verb)
 *   2. Section-specific `{verb}:configs:{section}`
 *   3. For read: `manage:configs:{section}` also grants read
 *      (section-level implications aren't in the backend graph)
 */
export function hasConfigCapability(
  hasCapability: (cap: string) => boolean,
  section: string | null,
  verb: 'manage' | 'read' = 'manage',
): boolean {
  const broadCap =
    verb === 'manage' ? SystemCapabilities.MANAGE_CONFIGS : SystemCapabilities.READ_CONFIGS;
  if (hasCapability(broadCap)) return true;
  if (section) {
    if (hasCapability(`${verb}:configs:${section}`)) return true;
    if (verb === 'read' && hasCapability(`manage:configs:${section}`)) return true;
  }
  return false;
}

interface SectionMeta {
  tab: string;
  schemaKey?: string;
}

/**
 * Collects the set of tab IDs that contain at least one section where
 * the given permission key (`canView` or `canEdit`) is `true`.
 */
export function getTabsWithPermission(
  schemaTree: SchemaField[],
  sectionMeta: Record<string, SectionMeta>,
  otherTabId: string,
  sectionPerms: Record<string, { canView: boolean; canEdit: boolean }>,
  key: 'canView' | 'canEdit',
  hiddenSections?: Set<string>,
): Set<string> {
  const result = new Set<string>();
  for (const section of schemaTree) {
    if (hiddenSections?.has(section.key)) continue;
    const meta = sectionMeta[section.key];
    const tabId = meta?.tab ?? otherTabId;
    if (tabId && sectionPerms[section.key]?.[key]) result.add(tabId);
  }
  for (const meta of Object.values(sectionMeta)) {
    if (meta.schemaKey && sectionPerms[meta.schemaKey]?.[key]) result.add(meta.tab);
  }
  return result;
}

/**
 * Determines whether fields in a config section should be disabled.
 * A section is disabled when the tab is globally read-only OR the user
 * lacks `canEdit` for that specific section.
 */
export function isSectionDisabled(
  readOnly: boolean,
  sectionPerms: Record<string, { canView: boolean; canEdit: boolean }> | undefined,
  dataKey: string,
): boolean {
  if (readOnly) return true;
  if (!sectionPerms) return false;
  return !sectionPerms[dataKey]?.canEdit;
}
