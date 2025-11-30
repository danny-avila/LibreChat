import { Outlet, NavLink } from 'react-router-dom';
import { useLocalize } from '~/hooks';
import {
    GearIcon,
    UserIcon,
    DataIcon,
} from '@librechat/client';

export default function AdminDashboard() {
    const localize = useLocalize();

    return (
        <div className="flex h-full w-full bg-surface-primary">
            {/* Sidebar */}
            <div className="flex w-[260px] flex-col border-r border-black/10 dark:border-white/10">
                <div className="flex h-14 items-center px-4 font-bold text-text-primary">
                    Admin Dashboard
                </div>
                <nav className="flex-1 space-y-1 px-2 py-2">
                    <NavLink
                        to="/admin/users"
                        className={({ isActive }) =>
                            `group flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm font-medium ${isActive
                                ? 'bg-surface-tertiary text-text-primary'
                                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                            }`
                        }
                    >
                        <UserIcon className="h-5 w-5 flex-shrink-0" />
                        Users
                    </NavLink>
                    <NavLink
                        to="/admin/settings"
                        className={({ isActive }) =>
                            `group flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm font-medium ${isActive
                                ? 'bg-surface-tertiary text-text-primary'
                                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                            }`
                        }
                    >
                        <GearIcon className="h-5 w-5 flex-shrink-0" />
                        Settings
                    </NavLink>
                    <NavLink
                        to="/admin/usage"
                        className={({ isActive }) =>
                            `group flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm font-medium ${isActive
                                ? 'bg-surface-tertiary text-text-primary'
                                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                            }`
                        }
                    >
                        <DataIcon className="h-5 w-5 flex-shrink-0" />
                        Usage Stats
                    </NavLink>
                </nav>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto p-8">
                <Outlet />
            </div>
        </div>
    );
}
