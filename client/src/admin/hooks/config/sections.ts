import { useMemo } from 'react';
import type * as t from '~/admin/types';
import {
  OTHER_TAB,
  SECTION_META,
  HIDDEN_SECTIONS,
  compareSections,
  fallbackSectionTitle,
} from '~/admin/components/configuration/configMeta';
import { labelForPath } from '~/admin/components/configuration/meta';
import { getValueAtPath, isConfigRecord } from '~/admin/utils';
import { READ_ONLY_CONFIG_SECTIONS } from '~/admin/constants';
import { useLocalize } from '../useLocalize';

const PERMISSIONS_BANNER_LINK: t.InfoBannerLink = {
  to: '/access',
  search: { tab: 'roles' },
  labelKey: 'com_admin_config_ui_permissions_link',
};

/** Display name of a list entry: its name or label, else "Entry N". */
function entryLabel(entry: t.ConfigValue, index: number, localize: t.LocalizeFn): string {
  if (isConfigRecord(entry)) {
    for (const key of ['name', 'label'] as const) {
      const value = entry[key];
      if (typeof value === 'string' && value) return value;
    }
  }
  return localize('com_admin_config_entry_n', { n: String(index + 1) });
}

/**
 * MCP server names in display order: the stored ones plus servers created,
 * minus servers deleted, by pending edits (applied in edit order).
 */
function mcpServerNames(
  stored: t.ConfigValue,
  editedValues: t.FlatConfigMap | undefined,
): string[] {
  const names = new Set(isConfigRecord(stored) ? Object.keys(stored) : []);
  for (const [path, value] of Object.entries(editedValues ?? {})) {
    const [root, name, ...rest] = path.split('.');
    if (root !== 'mcpServers' || !name) continue;
    if (rest.length === 0 && value === undefined) names.delete(name);
    else if (value !== undefined) names.add(name);
  }
  return [...names];
}

/**
 * Table-of-contents entries for collection sections (custom endpoints, MCP
 * servers, model specs, providers). Collections always get a list, empty
 * when they have no entries, so the TOC never falls back to schema keys.
 */
function collectionTocItems(
  section: t.ConfigSectionConfig,
  activeTab: string,
  values: Record<string, t.ConfigValue> | null,
  editedValues: t.FlatConfigMap | undefined,
  localize: t.LocalizeFn,
): t.TocItem[] | undefined {
  const dataKey = section.schemaKey ?? section.id;
  if (activeTab === 'custom' && section.id === 'endpoints') {
    section.titleKey = 'com_admin_config_tab_custom_endpoints';
    const list = getValueAtPath(values, `${dataKey}.custom`);
    return (Array.isArray(list) ? list : []).map((entry, i) => ({
      id: `section-${dataKey}-custom-${i}`,
      label: entryLabel(entry, i, localize),
      dataPath: `${dataKey}.custom.${i}`,
      path: `${dataKey}.custom.${i}`,
    }));
  }
  if (section.id === 'mcpServers') {
    return mcpServerNames(values?.[dataKey], editedValues).map((name) => ({
      id: `section-mcpServers-${encodeURIComponent(name)}`,
      label: name,
      dataPath: `mcpServers.${name}`,
      path: `mcpServers.${name}`,
    }));
  }
  if (section.id === 'modelSpecs') {
    const list = getValueAtPath(values, 'modelSpecs.list');
    return (Array.isArray(list) ? list : []).map((entry, i) => ({
      id: `section-modelSpecs-list-${i}`,
      label: entryLabel(entry, i, localize),
      dataPath: `modelSpecs.list.${i}`,
      path: `modelSpecs.list.${i}`,
    }));
  }
  if (activeTab === 'providers' && section.schemaKey === 'endpoints') {
    return section.fields
      .filter((f) => f.key !== 'custom' && f.children && f.children.length > 0)
      .map((f) => ({
        id: `section-${dataKey}.${f.key}`,
        label: labelForPath(`${dataKey}.${f.key}`, localize),
        dataPath: `${dataKey}.${f.key}`,
        path: `${dataKey}.${f.key}`,
      }));
  }
  return undefined;
}

/**
 * The sections of the active tab, with the table-of-contents entries for
 * collection tabs (custom endpoints, MCP servers, providers) (WS5: page shell).
 */
export function useTabSections({
  schemaTree,
  activeTab,
  activeConfigValues,
  sectionPermissions,
  editedValues,
}: t.TabSectionsOptions): t.ConfigSectionConfig[] {
  const localize = useLocalize();

  return useMemo((): t.ConfigSectionConfig[] => {
    // Collect virtual section entries (those with schemaKey) that target this tab
    const virtualEntries = Object.entries(SECTION_META).filter(
      ([, m]) => m.schemaKey && m.tab === activeTab,
    );

    const directSections = schemaTree
      .filter((section: t.SchemaField) => {
        if (HIDDEN_SECTIONS.has(section.key)) return false;
        if (activeTab === OTHER_TAB.id) return !Object.hasOwn(SECTION_META, section.key);
        return SECTION_META[section.key]?.tab === activeTab;
      })
      .map((section: t.SchemaField) => {
        const meta = SECTION_META[section.key];
        const children = section.children ?? [];
        const hasStructuredChildren =
          (section.isObject || section.type === 'record') && children.length > 0;
        const readOnlyReason = READ_ONLY_CONFIG_SECTIONS.get(section.key);
        return {
          id: section.key,
          titleKey: meta?.titleKey ?? `com_admin_config_section_${section.key}`,
          title: meta ? undefined : fallbackSectionTitle(section.key),
          isRecord: section.type === 'record',
          descriptionKey: meta?.descriptionKey,
          fields: hasStructuredChildren ? children : [],
          ...(!hasStructuredChildren && { sectionField: section }),
          ...(section.key === 'interface' && {
            bannerText: localize('com_admin_config_ui_permissions_banner'),
            bannerLink: PERMISSIONS_BANNER_LINK,
          }),
          ...(section.key === 'skillSync' && {
            bannerText: localize('com_admin_config_skill_sync_banner'),
          }),
          ...(readOnlyReason && { readOnlyReason }),
        };
      });

    // Add virtual sections — these reference another schema section's data
    // but render under a different tab with their own section renderer.
    const virtualSections = virtualEntries.flatMap(([metaKey, meta]) => {
      const schemaSection = schemaTree.find((s: t.SchemaField) => s.key === meta.schemaKey);
      if (!schemaSection) return [];
      const hasStructuredChildren =
        (schemaSection.isObject || schemaSection.type === 'record') &&
        schemaSection.children &&
        schemaSection.children.length > 0;
      return [
        {
          id: metaKey,
          schemaKey: meta.schemaKey,
          titleKey: meta.titleKey,
          descriptionKey: meta.descriptionKey,
          fields: hasStructuredChildren ? (schemaSection.children ?? []) : [],
          ...(!hasStructuredChildren && { sectionField: schemaSection }),
        },
      ];
    });

    const allSections: t.ConfigSectionConfig[] = [...directSections, ...virtualSections]
      .filter((s) => {
        const permKey = 'schemaKey' in s && s.schemaKey ? s.schemaKey : s.id;
        return sectionPermissions[permKey]?.canView === true;
      })
      .sort(compareSections);

    for (const section of allSections) {
      const items = collectionTocItems(
        section,
        activeTab,
        activeConfigValues,
        editedValues,
        localize,
      );
      if (items) section.tocItems = items;
    }

    return allSections;
  }, [schemaTree, activeTab, activeConfigValues, editedValues, localize, sectionPermissions]);
}
