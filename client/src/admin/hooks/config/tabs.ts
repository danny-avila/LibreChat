import { useCallback, useEffect, useMemo } from 'react';
import type * as t from '~/admin/types';
import {
  CONFIG_TABS,
  OTHER_TAB,
  SECTION_META,
  HIDDEN_SECTIONS,
} from '~/admin/components/configuration/configMeta';
import { hasConfigCapability, getTabsWithPermission } from '~/admin/utils';
import { SystemCapabilities } from '~/admin/constants';
import { useCapabilities } from '../useCapabilities';
import { useNavigate } from '~/admin/router';

/** Tabs the viewer can see, the active tab, and per-section permissions (WS5: page shell). */
export function useConfigTabs({ schemaTree, initialTab }: t.ConfigTabsOptions): t.ConfigTabsState {
  const { hasCapability } = useCapabilities();
  const canManageConfig = hasCapability(SystemCapabilities.MANAGE_CONFIGS);
  const canAssignConfigs = hasCapability(SystemCapabilities.ASSIGN_CONFIGS) || canManageConfig;
  const navigate = useNavigate({ from: '/configuration/' });

  const sectionPermissions = useMemo(() => {
    const perms: t.SectionPermissionMap = {};
    for (const section of schemaTree) {
      perms[section.key] = {
        canView: hasConfigCapability(hasCapability, section.key, 'read'),
        canEdit: hasConfigCapability(hasCapability, section.key, 'manage'),
      };
    }
    return perms;
  }, [schemaTree, hasCapability]);

  const hasUnmappedSections = useMemo(
    () =>
      schemaTree.some(
        (s: t.SchemaField) => !HIDDEN_SECTIONS.has(s.key) && !Object.hasOwn(SECTION_META, s.key),
      ),
    [schemaTree],
  );

  const { viewableTabIds, editableTabIds } = useMemo(
    () => ({
      viewableTabIds: getTabsWithPermission(
        schemaTree,
        SECTION_META,
        OTHER_TAB.id,
        sectionPermissions,
        'canView',
        HIDDEN_SECTIONS,
      ),
      editableTabIds: getTabsWithPermission(
        schemaTree,
        SECTION_META,
        OTHER_TAB.id,
        sectionPermissions,
        'canEdit',
        HIDDEN_SECTIONS,
      ),
    }),
    [schemaTree, sectionPermissions],
  );

  const visibleTabs = useMemo(() => {
    const allTabs = hasUnmappedSections ? [...CONFIG_TABS, OTHER_TAB] : CONFIG_TABS;
    return allTabs.filter((tab) => viewableTabIds.has(tab.id));
  }, [hasUnmappedSections, viewableTabIds]);

  const activeTab =
    initialTab && visibleTabs.some((tab) => tab.id === initialTab)
      ? initialTab
      : (visibleTabs[0]?.id ?? CONFIG_TABS[0].id);

  /** An unknown or hidden `?tab=` is replaced by the tab actually shown (SH-5). */
  useEffect(() => {
    if (initialTab === undefined || initialTab === activeTab) return;
    navigate({
      search: (prev: t.ConfigSearchParams) => ({ ...prev, tab: activeTab }),
      replace: true,
    });
  }, [initialTab, activeTab, navigate]);

  const handleTabChange = useCallback(
    (newTab: string) => {
      navigate({ search: (prev: t.ConfigSearchParams) => ({ ...prev, tab: newTab }) });
    },
    [navigate],
  );

  const canEditActiveTab = editableTabIds.has(activeTab);

  const permissions: t.ScopePermissions = useMemo(
    () => ({
      canView: true,
      canEdit: canEditActiveTab,
      canAssign: canAssignConfigs,
    }),
    [canEditActiveTab, canAssignConfigs],
  );

  return {
    sectionPermissions,
    visibleTabs,
    activeTab,
    handleTabChange,
    canManageConfig,
    canEditActiveTab,
    permissions,
  };
}
