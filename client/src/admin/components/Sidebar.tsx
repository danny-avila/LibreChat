import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import type * as t from '~/admin/types';
import { Link, useRouter, AdminRouteContext } from '~/admin/router';
import { useStripAriaExpanded, useLocalize } from '~/admin/hooks';
import { DecorativeIcon } from '~/admin/components/shared';
import { useVisibleNavItems } from './navigation';
import { getInitials, cn } from '~/admin/utils';
import { Icon, Dropdown } from '~/admin/ui';
import { useAuthContext } from '~/hooks';

function getUserInitials(user?: { name?: string; email?: string } | null): string {
  if (user?.name) return getInitials(user.name);
  if (user?.email) return user.email[0].toUpperCase();
  return '';
}

export function Sidebar({ user, collapsed, onToggle }: t.SidebarProps) {
  const localize = useLocalize();
  const router = useRouter();
  const navigate = useNavigate();
  const { logout } = useAuthContext();
  const { appTitle } = useContext(AdminRouteContext);
  const visibleItems = useVisibleNavItems();
  const currentPath = router.state.location.pathname;
  const userMenuRef = useStripAriaExpanded<HTMLButtonElement>();

  const isActive = (path: string) =>
    path === '/' ? currentPath === '/' : currentPath.startsWith(path);

  const initials = getUserInitials(user);

  return (
    <aside
      aria-label={localize('com_admin_a11y_admin_panel')}
      className={cn(
        'sticky top-0 z-(--z-floating) flex h-screen shrink-0 flex-col overflow-hidden border-r border-(--cui-color-stroke-default) bg-(--cui-color-background-panel) transition-all duration-200 motion-reduce:transition-none',
        collapsed ? 'w-14' : 'w-63',
      )}
    >
      <div className="flex h-14 shrink-0 items-center px-2">
        <div className="flex items-center gap-2.5 overflow-hidden px-1.5">
          <img
            src="assets/logo.svg"
            alt={localize('com_ui_logo', { 0: appTitle ?? 'LibreChat' })}
            className="h-6 w-6 shrink-0 object-contain"
          />
          <span className="truncate text-sm font-semibold text-(--cui-color-text-default)">
            {localize('com_admin_auth_title')}
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2" role="navigation">
        <div className="flex flex-col gap-0.5">
          {visibleItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              aria-current={isActive(item.path) ? 'page' : undefined}
              aria-label={collapsed ? localize(item.labelKey) : undefined}
              title={collapsed ? localize(item.labelKey) : undefined}
              className={cn(
                'flex h-8 items-center gap-2.5 overflow-hidden rounded-md px-2.5 text-sm whitespace-nowrap no-underline transition-colors duration-100',
                isActive(item.path)
                  ? 'bg-(--cui-color-background-active) font-medium text-(--cui-color-text-default)'
                  : 'font-normal text-(--cui-color-text-muted) hover:bg-(--cui-color-background-hover) hover:text-(--cui-color-text-default)',
              )}
            >
              <span aria-hidden="true" className="shrink-0">
                <Icon name={item.icon} size="sm" />
              </span>
              <span className="truncate text-sm">{localize(item.labelKey)}</span>
            </Link>
          ))}
        </div>
      </nav>

      {initials && (
        <div className="flex shrink-0 items-center border-t border-(--cui-color-stroke-default) px-2 py-3">
          <div className="flex items-center gap-2.5 overflow-hidden px-0.5">
            <Dropdown>
              <Dropdown.Trigger>
                <button
                  ref={userMenuRef}
                  type="button"
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-(--cui-color-stroke-default) bg-(--cui-color-background-default) transition-colors hover:border-(--cui-color-stroke-intense) hover:bg-(--cui-color-background-hover)"
                  aria-label={`${localize('com_admin_nav_user_menu')}, ${user?.name || user?.email || ''}`}
                  aria-haspopup="true"
                  title={user?.name || user?.email || ''}
                >
                  <span
                    aria-hidden="true"
                    className="text-xs font-medium text-(--cui-color-text-muted)"
                  >
                    {initials}
                  </span>
                </button>
              </Dropdown.Trigger>
              <Dropdown.Content>
                <div className="user-dropdown flex min-w-45 flex-col select-none">
                  {user && (
                    <div className="px-3 pt-3 pb-2">
                      <span className="block text-sm leading-tight font-medium text-(--cui-color-text-default)">
                        {user.name || ''}
                      </span>
                      {user.email && (
                        <span className="mt-0.5 block text-xs leading-tight text-(--cui-color-text-muted)">
                          {user.email}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="border-t border-(--cui-color-stroke-default)" />
                  <Dropdown.Item icon="chat" onClick={() => navigate('/c/new')}>
                    {localize('com_admin_nav_back_to_app')}
                  </Dropdown.Item>
                  <Dropdown.Item icon="log-out" onClick={() => logout()}>
                    {localize('com_admin_ui_sign_out')}
                  </Dropdown.Item>
                </div>
              </Dropdown.Content>
            </Dropdown>
            {user && (
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm leading-tight font-medium text-(--cui-color-text-default)">
                  {user.name || ''}
                </span>
                {user.email && (
                  <span className="block truncate text-xs leading-tight text-(--cui-color-text-muted)">
                    {user.email}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onToggle}
        aria-label={localize(
          collapsed ? 'com_admin_nav_expand_sidebar' : 'com_admin_nav_collapse_sidebar',
        )}
        title={localize(
          collapsed ? 'com_admin_nav_expand_sidebar' : 'com_admin_nav_collapse_sidebar',
        )}
        className="flex w-full shrink-0 cursor-pointer items-center justify-center border-t border-(--cui-color-stroke-default) bg-transparent py-3 text-(--cui-color-text-muted) transition-colors hover:bg-(--cui-color-background-hover) hover:text-(--cui-color-text-default)"
      >
        <DecorativeIcon name={collapsed ? 'slide-in' : 'slide-out'} size="sm" />
      </button>
    </aside>
  );
}
