/* eslint-disable i18next/no-literal-string */
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Users, LayoutGrid, ArrowLeft } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/hiring/team', label: 'Team', icon: Users },
  { to: '/hiring/tasks', label: 'Tasks', icon: LayoutGrid },
];

export default function HiringLayout() {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen w-full bg-white dark:bg-gray-900">
      {/* Sidebar */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
        {/* Back to chat */}
        <div className="p-4">
          <button
            onClick={() => navigate('/c/new')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Chat
          </button>
        </div>

        <div className="px-4 pb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Hiring & Onboarding
          </p>
        </div>

        <nav className="flex flex-col gap-0.5 px-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                    : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
