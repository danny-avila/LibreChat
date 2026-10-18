import { useMemo } from 'react';
import type * as t from '~/admin/types';
import {
  OTHER_TAB,
  SECTION_META,
  HIDDEN_SECTIONS,
  tabForPath,
} from '~/admin/components/configuration/configMeta';
import {
  countEntries,
  countSection,
  countOverriddenEntries,
} from '~/admin/components/configuration/counts';
import { getValueAtPath } from '~/admin/utils';

/** Collection tabs: the badge counts entries of this value ("25 endpoints", "1 spec"). */
const ENTRY_TABS: Readonly<Record<string, { path: string; labelKey: string }>> = {
  custom: { path: 'endpoints.custom', labelKey: 'com_admin_config_values_count_endpoints' },
  specs: { path: 'modelSpecs.list', labelKey: 'com_admin_config_values_count_specs' },
  mcp: { path: 'mcpServers', labelKey: 'com_admin_config_values_count_servers' },
};

const SET_LABEL_KEY = 'com_admin_config_values_count_set';

const NO_PATHS: ReadonlySet<string> = new Set();

/** Schema section key → the tabs showing it (a section can appear on two tabs, e.g. `endpoints`). */
function sectionTabs(): Map<string, string[]> {
  const tabs = new Map<string, string[]>();
  for (const [metaKey, meta] of Object.entries(SECTION_META)) {
    const key = meta.schemaKey ?? metaKey;
    tabs.set(key, [...(tabs.get(key) ?? []), meta.tab]);
  }
  return tabs;
}

const SECTION_TABS = sectionTabs();

/** Counting overrides: a switch or record set value by value counts each stored path (`countConfigured`). */
const OVERRIDE_COUNT = true;

/** Configured settings of a tab's schema sections (custom endpoints are counted on their own tab). */
function countTabSettings(
  tabId: string,
  schemaTree: t.SchemaField[],
  configuredPaths: ReadonlySet<string>,
  perStoredPath = false,
): number {
  if (configuredPaths.size === 0) return 0;
  let count = 0;
  for (const section of schemaTree) {
    if (HIDDEN_SECTIONS.has(section.key)) continue;
    const tabs = SECTION_TABS.get(section.key);
    const onTab = tabs ? tabs.includes(tabId) : tabId === OTHER_TAB.id;
    if (!onTab) continue;
    const fields =
      section.key === 'endpoints'
        ? (section.children ?? []).filter((f) => f.key !== 'custom')
        : (section.children ?? []);
    count += countSection(
      {
        id: section.key,
        fields,
        sectionField: fields.length > 0 ? undefined : section,
      },
      configuredPaths,
      null,
      perStoredPath,
    ).configured;
  }
  return count;
}

/**
 * Badge per visible tab (EV-3): collection tabs count their entries (custom
 * endpoints, model specs, MCP servers, pending edits included), every other
 * tab counts its customized settings with the same rule as section badges.
 * Badges render in profile mode too (counting the profile's own settings, and
 * on collection tabs the entries it overrides, adds or hides), and `pending`
 * counts the tab's unsaved edits.
 */
export function useTabBadges({
  schemaTree,
  visibleTabs,
  activeConfiguredPaths,
  activeConfigValues,
  editedValues,
  overridePaths = NO_PATHS,
  listOverrideCounts,
  isEditingScope = false,
}: t.TabCountsOptions): Record<string, t.TabBadge> {
  const pendingByTab = useMemo(() => {
    const counts = new Map<string, number>();
    for (const path of Object.keys(editedValues ?? {})) {
      const tab = tabForPath(path);
      counts.set(tab, (counts.get(tab) ?? 0) + 1);
    }
    return counts;
  }, [editedValues]);

  const counts = useMemo(() => {
    const result: Record<string, Omit<t.TabBadge, 'pending'>> = {};
    for (const tab of visibleTabs) {
      const entries = ENTRY_TABS[tab.id];
      if (entries) {
        result[tab.id] = {
          kind: 'entries',
          count: countEntries(getValueAtPath(activeConfigValues, entries.path)),
          labelKey: entries.labelKey,
          overrides: countOverriddenEntries(
            entries.path,
            isEditingScope ? activeConfiguredPaths : overridePaths,
            listOverrideCounts,
          ),
          scope: isEditingScope,
        };
        continue;
      }
      result[tab.id] = {
        kind: 'customized',
        count: countTabSettings(tab.id, schemaTree, activeConfiguredPaths),
        labelKey: SET_LABEL_KEY,
        overrides: isEditingScope
          ? 0
          : countTabSettings(tab.id, schemaTree, overridePaths, OVERRIDE_COUNT),
      };
    }
    return result;
  }, [
    visibleTabs,
    activeConfigValues,
    schemaTree,
    activeConfiguredPaths,
    overridePaths,
    listOverrideCounts,
    isEditingScope,
  ]);

  return useMemo(() => {
    const result: Record<string, t.TabBadge> = {};
    for (const [tabId, badge] of Object.entries(counts)) {
      result[tabId] = { ...badge, pending: pendingByTab.get(tabId) ?? 0 };
    }
    return result;
  }, [counts, pendingByTab]);
}
