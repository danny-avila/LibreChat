import { useContext, useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Navigate } from 'react-router-dom';
import { ADMIN_PLATFORM_SCOPE } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import { ConfigPage, ConfigSkeleton, ConfigLoadError } from '~/admin/components/configuration';
import { ADMIN_BASE_PATH, AdminRouteContext, useNavigate, useSearch } from '~/admin/router';
import { AccessDenied, PermissionsUnavailable } from '~/admin/components/shared';
import { baseConfigOptions, configSchemaTreeOptions } from '~/admin/api';
import { OrganizationsPage } from '~/admin/components/organizations';
import { AccountsPage, UsersPage } from '~/admin/components/users';
import { DashboardPage } from '~/admin/components/dashboard';
import { HelpPage } from '~/admin/components/help/HelpPage';
import { useQuery, useQueryClient } from '~/admin/query';
import { SystemCapabilities } from '~/admin/constants';
import { AccessPage } from '~/admin/components/access';
import { GrantsPage } from '~/admin/components/grants';
import { hasConfigCapability } from '~/admin/utils';
import { useCapabilities } from '~/admin/hooks';
import { adminScopeAtom } from '~/admin/store';

/**
 * The panel's pages, as its TanStack routes were: each reads its search parameters, checks the
 * capabilities it needs, and renders the page component.
 */

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Whether the panel acts at the platform in organizations mode. */
function usePlatformScope(): { organizations: boolean; atPlatform: boolean } {
  const { organizations } = useContext(AdminRouteContext);
  const scope = useAtomValue(adminScopeAtom);
  return { organizations, atPlatform: organizations && scope === ADMIN_PLATFORM_SCOPE };
}

export function DashboardRoute() {
  return <DashboardPage />;
}

export function HelpRoute() {
  return <HelpPage />;
}

type AccessTab = 'groups' | 'roles';

function isAccessTab(value?: string): value is AccessTab {
  return value === 'groups' || value === 'roles';
}

export function AccessRoute() {
  const search = useSearch();
  const navigate = useNavigate({ from: '/access' });
  const { hasCapability, isLoading, isError } = useCapabilities();
  const { atPlatform } = usePlatformScope();

  /* Roles and groups belong to one organization; the platform has none of its own. */
  if (atPlatform) return <Navigate to={ADMIN_BASE_PATH} replace />;
  if (isLoading) return null;
  if (isError) return <PermissionsUnavailable />;

  const canReadRoles = hasCapability(SystemCapabilities.READ_ROLES);
  const canReadGroups = hasCapability(SystemCapabilities.READ_GROUPS);
  if (!canReadRoles && !canReadGroups) {
    return <AccessDenied />;
  }

  const tab = optionalString(search.tab);
  const defaultTab: AccessTab = canReadRoles ? 'roles' : 'groups';
  const requestedTab: AccessTab = isAccessTab(tab) ? tab : defaultTab;
  const activeTab: AccessTab =
    (requestedTab === 'roles' && !canReadRoles) || (requestedTab === 'groups' && !canReadGroups)
      ? defaultTab
      : requestedTab;

  return (
    <AccessPage
      activeTab={activeTab}
      onTabChange={(value: string) => {
        if (isAccessTab(value)) {
          navigate({ search: { tab: value } });
        }
      }}
      canReadRoles={canReadRoles}
      canReadGroups={canReadGroups}
    />
  );
}

type GrantsTab = 'management' | 'audit-log';

function isGrantsTab(value?: string): value is GrantsTab {
  return value === 'management' || value === 'audit-log';
}

export function GrantsRoute() {
  const search = useSearch();
  const navigate = useNavigate({ from: '/grants' });
  const tab = optionalString(search.tab);
  const entryId = optionalString(search.entryId);
  /**
   * Permalinks land without `tab` (`/grants?entryId=abc`), so an `entryId` opens the audit log,
   * where its drawer shows the entry. The page still falls back to management for someone who
   * cannot read the audit log.
   */
  const fallbackTab: GrantsTab = entryId ? 'audit-log' : 'management';
  const activeTab: GrantsTab = isGrantsTab(tab) ? tab : fallbackTab;

  return (
    <GrantsPage
      activeTab={activeTab}
      onTabChange={(value: string) => {
        if (!isGrantsTab(value)) return;
        navigate({
          search: (previous) => ({
            ...previous,
            tab: value,
            /* Leaving the audit log drops its entry link, so it never reopens on return. */
            entryId: value === 'audit-log' ? previous.entryId : undefined,
          }),
        });
      }}
    />
  );
}

export function UsersRoute() {
  const { hasCapability, isLoading, isError } = useCapabilities();
  const { atPlatform } = usePlatformScope();
  if (isLoading) return null;
  if (isError) return <PermissionsUnavailable />;
  if (!hasCapability(SystemCapabilities.READ_USERS)) return <AccessDenied />;
  /* At the platform, people are login accounts; in an organization, its members. */
  return atPlatform ? <AccountsPage /> : <UsersPage />;
}

export function OrganizationsRoute() {
  const { atPlatform } = usePlatformScope();
  if (!atPlatform) return <Navigate to={ADMIN_BASE_PATH} replace />;
  return <OrganizationsPage />;
}

export function ConfigurationRoute() {
  const search = useSearch();
  const queryClient = useQueryClient();
  const { hasCapability, isLoading, isError } = useCapabilities();
  const schema = useQuery(configSchemaTreeOptions);
  const [retrying, setRetrying] = useState(false);

  /* The base config is fetched alongside the schema, so the form mounts with its baseline. A
     base-config failure is left to the page (it can be a missing permission). */
  useEffect(() => {
    void queryClient.prefetchQuery(baseConfigOptions);
  }, [queryClient]);

  const schemaTree = schema.data;
  const canViewAnyConfig = useMemo(
    () =>
      schemaTree != null &&
      (hasConfigCapability(hasCapability, null, 'read') ||
        hasConfigCapability(hasCapability, null, 'manage') ||
        schemaTree.some(
          (section: t.SchemaField) =>
            hasConfigCapability(hasCapability, section.key, 'read') ||
            hasConfigCapability(hasCapability, section.key, 'manage'),
        )),
    [hasCapability, schemaTree],
  );

  if (schema.isError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-4 pt-2">
        <ConfigLoadError
          error={schema.error}
          retrying={retrying}
          onRetry={() => {
            setRetrying(true);
            schema.refetch().finally(() => setRetrying(false));
          }}
        />
      </div>
    );
  }
  if (isLoading || schema.isPending) return <ConfigSkeleton />;
  if (isError) return <PermissionsUnavailable />;
  if (!canViewAnyConfig) return <AccessDenied />;
  return (
    <ConfigPage
      initialTab={optionalString(search.tab)}
      highlightField={optionalString(search.field)}
      initialScope={optionalString(search.scope)}
      customizedOnly={search.customized === 1 || search.customized === '1'}
    />
  );
}
