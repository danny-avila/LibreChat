/* eslint-disable i18next/no-literal-string */
import { NavLink, Navigate, Outlet } from 'react-router-dom';
import {
  Activity,
  CreditCard,
  FileClock,
  LayoutDashboard,
  MessageSquare,
  Users,
} from 'lucide-react';
import { SystemRoles } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import { FreshAuthProvider } from '~/hooks/useFreshAuth';

const navItems = [
  { to: '/admin/overview', label: 'Overview', Icon: LayoutDashboard },
  { to: '/admin/users', label: 'Users', Icon: Users },
  { to: '/admin/subscriptions', label: 'Subscriptions', Icon: CreditCard },
  { to: '/admin/usage', label: 'Usage', Icon: Activity },
  { to: '/admin/messages', label: 'Messages', Icon: MessageSquare },
  { to: '/admin/audit', label: 'Audit', Icon: FileClock },
];

export default function AdminRoute() {
  const { isAuthenticated, user } = useAuthContext();

  if (!isAuthenticated) {
    return null;
  }

  // Auth state can flip to authenticated *before* the user query resolves
  // (the JWT refresh path sets the flag separately from the user object).
  // Don't make a role decision until we actually have a user — otherwise
  // legitimate admins get redirected on hard refresh.
  if (!user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading…</div>
      </div>
    );
  }

  if (user.role !== SystemRoles.ADMIN) {
    return <Navigate to="/c/new" replace />;
  }

  return (
    <FreshAuthProvider>
      <div className="flex h-screen w-full bg-gray-50 dark:bg-gray-950">
        <aside className="flex h-full w-60 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="px-4 py-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">
              Admin Dashboard
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Internal tools</p>
          </div>
          <nav className="flex-1 space-y-1 px-2 pb-4" aria-label="Admin navigation">
            {navItems.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={false}
                className={({ isActive }) =>
                  [
                    'group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-gray-100 font-semibold text-gray-900 dark:bg-gray-800 dark:text-gray-50'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
                  ].join(' ')
                }
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-gray-200 p-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-500">
            <div className="truncate" title={user?.email ?? undefined}>
              {user?.name ?? user?.username ?? user?.email}
            </div>
          </div>
        </aside>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </FreshAuthProvider>
  );
}
