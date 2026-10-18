import { Suspense, useCallback, useContext, useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ADMIN_PLATFORM_SCOPE } from 'librechat-data-provider';
import {
  AccessRoute,
  GrantsRoute,
  HelpRoute,
  OrganizationsRoute,
  UsersRoute,
  DashboardRoute,
} from './pages';
import { useCapabilities, useCommandMenu, useLocalize } from '~/admin/hooks';
import { QueryClient, QueryClientProvider, useQuery } from '~/admin/query';
import { ConfigSkeleton } from './components/configuration/ConfigSkeleton';
import { useAuthContext, useLocalize as useAppLocalize } from '~/hooks';
import { AdminRouteContext, Link, useRouter } from '~/admin/router';
import { useApplyScopeSwitch } from '~/admin/hooks/useAdminScope';
import { AccessDenied } from './components/shared/AccessDenied';
import { CommandMenu } from './components/CommandMenu';
import { ScopePicker } from './components/ScopePicker';
import { useGetStartupConfig } from '~/data-provider';
import { lazyWithRecovery } from '~/lib/assets/lazy';
import { AdminToaster, Button, Icon } from './ui';
import { SystemCapabilities } from './constants';
import { adminSessionQueryOptions } from './api';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { adminScopeAtom } from './store';
import './admin.css';

/** The configuration editor is most of the panel's code, so it loads when first opened. */
const ConfigurationRoute = lazyWithRecovery(() =>
  import('./pages').then((module) => ({ default: module.ConfigurationRoute })),
);

const SIDEBAR_KEY = 'admin-panel:sidebar-collapsed';

const ROUTE_TITLE_KEYS: Record<string, string> = {
  '/': 'com_admin_dash_title',
  '/organizations': 'com_admin_orgs_title',
  '/configuration': 'com_admin_config_title',
  '/users': 'com_admin_users_title',
  '/access': 'com_admin_access_title',
  '/grants': 'com_admin_grants_title',
  '/help': 'com_admin_help_title',
};

function readCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    return stored !== null ? stored === 'true' : true;
  } catch {
    return true;
  }
}

/**
 * The built-in admin panel at `/admin`. It runs on the signed-in SassyChat session and keeps
 * its own query cache, which a scope switch resets without touching the chat's.
 */
export default function AdminApp() {
  const { isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const [queryClient] = useState(() => new QueryClient());

  if (!isAuthenticated) {
    return null;
  }
  return (
    <QueryClientProvider client={queryClient}>
      <AdminShell appTitle={startupConfig?.appTitle} />
    </QueryClientProvider>
  );
}

/** Lets in only someone the server lets use the panel; everyone else goes back to the chat. */
function AdminShell({ appTitle }: { appTitle?: string }) {
  const session = useQuery(adminSessionQueryOptions);
  useApplyScopeSwitch();

  if (session.isPending) {
    return <AdminPending />;
  }
  if (session.isError) {
    return <AdminError onRetry={() => session.refetch()} />;
  }
  if (!session.data) {
    return <Navigate to="/c/new" replace />;
  }
  return (
    <AdminRouteContext.Provider
      value={{
        user: session.data.user,
        organizations: session.data.organizations,
        appTitle,
      }}
    >
      <AdminLayout />
    </AdminRouteContext.Provider>
  );
}

function AdminLayout() {
  const localize = useLocalize();
  const router = useRouter();
  const { user, organizations } = useContext(AdminRouteContext);
  const scope = useAtomValue(adminScopeAtom);
  const { hasCapability, isLoading, isError } = useCapabilities();
  const { open, setOpen } = useCommandMenu();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const pathname = router.state.location.pathname;

  const toggleSidebar = useCallback(
    () =>
      setCollapsed((previous) => {
        const next = !previous;
        try {
          localStorage.setItem(SIDEBAR_KEY, String(next));
        } catch {
          /* The choice just is not remembered. */
        }
        return next;
      }),
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'b') {
        event.preventDefault();
        toggleSidebar();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toggleSidebar]);

  if (!isLoading && !isError && !hasCapability(SystemCapabilities.ACCESS_ADMIN)) {
    return <AccessDenied />;
  }

  const matched = Object.keys(ROUTE_TITLE_KEYS).find((route) =>
    route === '/' ? pathname === '/' : pathname.startsWith(route),
  );
  const atPlatform = organizations && scope === ADMIN_PLATFORM_SCOPE;
  const titleKey =
    matched === '/users' && atPlatform
      ? 'com_admin_accounts_title'
      : matched && ROUTE_TITLE_KEYS[matched];

  return (
    <div className="admin-panel bg-surface-primary text-text-primary flex h-screen overflow-hidden">
      <Sidebar user={user} collapsed={collapsed} onToggle={toggleSidebar} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          title={titleKey ? localize(titleKey) : undefined}
          onSearchClick={() => setOpen(true)}
        >
          {organizations && <ScopePicker />}
        </Header>
        <main className="flex min-h-0 flex-1 flex-col overflow-auto">
          <Routes>
            <Route index element={<DashboardRoute />} />
            <Route
              path="configuration"
              element={
                <Suspense fallback={<ConfigSkeleton />}>
                  <ConfigurationRoute />
                </Suspense>
              }
            />
            <Route path="organizations" element={<OrganizationsRoute />} />
            <Route path="users" element={<UsersRoute />} />
            <Route path="access" element={<AccessRoute />} />
            <Route path="grants" element={<GrantsRoute />} />
            <Route path="help" element={<HelpRoute />} />
            <Route path="*" element={<AdminNotFound />} />
          </Routes>
        </main>
      </div>
      <CommandMenu open={open} onOpenChange={setOpen} />
      <AdminToaster />
    </div>
  );
}

/** The panel's frame while the operator's access is checked, instead of a blank page. */
function AdminPending() {
  const localize = useAppLocalize();
  return (
    <div
      role="status"
      aria-busy="true"
      className="bg-surface-primary flex h-screen overflow-hidden"
    >
      <span className="sr-only">{localize('com_ui_loading')}</span>
      <div className="border-border-light bg-surface-primary-alt w-14 shrink-0 border-r" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-border-light h-15 shrink-0 border-b" />
      </div>
    </div>
  );
}

function AdminError({ onRetry }: { onRetry: () => void }) {
  const localize = useLocalize();
  return (
    <div
      role="alert"
      className="bg-surface-primary flex min-h-screen items-center justify-center p-6"
    >
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <span aria-hidden="true" className="text-text-destructive">
          <Icon name="warning" size="lg" />
        </span>
        <h1 className="text-text-primary text-lg font-semibold">
          {localize('com_admin_error_page_title')}
        </h1>
        <p className="text-text-secondary text-sm">{localize('com_admin_error_page_desc')}</p>
        <Button type="secondary" label={localize('com_admin_ui_retry')} onClick={onRetry} />
      </div>
    </div>
  );
}

function AdminNotFound() {
  const localize = useLocalize();
  return (
    <div role="alert" className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <span className="text-text-secondary text-4xl font-bold">404</span>
        <h2 className="text-text-primary text-lg font-semibold">
          {localize('com_admin_error_not_found_title')}
        </h2>
        <p className="text-text-secondary text-sm">{localize('com_admin_error_not_found_desc')}</p>
        <Link
          to="/"
          className="border-border-light text-text-primary hover:bg-surface-hover rounded-lg border px-4 py-2 text-sm font-medium no-underline"
        >
          {localize('com_admin_nav_go_home')}
        </Link>
      </div>
    </div>
  );
}
