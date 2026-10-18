import { useMemo } from 'react';
import { useVisibleNavItems } from '~/admin/components/navigation';
import { useLocalize } from '~/admin/hooks';
import { Link } from '~/admin/router';
import { Icon } from '~/admin/ui';

/** What each page is for, on its dashboard card. Pages without one get no card. */
const DESCRIPTIONS: Record<string, string> = {
  '/organizations': 'com_admin_dash_orgs_desc',
  '/configuration': 'com_admin_dash_config_desc',
  '/users': 'com_admin_dash_users_desc',
  '/access': 'com_admin_dash_access_desc',
  '/grants': 'com_admin_dash_grants_desc',
  '/help': 'com_admin_dash_help_desc',
};

export function DashboardPage() {
  const localize = useLocalize();
  const pages = useVisibleNavItems();

  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

  const visibleLinks = useMemo(
    () =>
      pages
        .filter((page) => DESCRIPTIONS[page.path])
        .map((page) => ({ ...page, descKey: DESCRIPTIONS[page.path] })),
    [pages],
  );

  return (
    <div
      role="region"
      aria-label={localize('com_admin_nav_dashboard')}
      className="flex flex-1 flex-col gap-8 overflow-auto p-6"
    >
      <section aria-label={localize('com_admin_dash_quick_links')}>
        <h3 className="mb-3 text-sm font-medium text-(--cui-color-text-muted)">
          {localize('com_admin_dash_quick_links')}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {visibleLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className="flex items-start gap-3 rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-panel) p-4 no-underline transition-colors hover:bg-(--cui-color-background-hover)"
            >
              <span aria-hidden="true" className="mt-0.5 text-(--cui-color-text-muted)">
                <Icon name={link.icon} size="sm" />
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-(--cui-color-text-default)">
                  {localize(link.labelKey)}
                </span>
                <span className="text-xs text-(--cui-color-text-muted)">
                  {localize(link.descKey)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section
        aria-label={localize('com_admin_dash_nav_tips')}
        className="rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-panel) p-5"
      >
        <h3 className="mb-3 text-sm font-medium text-(--cui-color-text-default)">
          {localize('com_admin_dash_nav_tips')}
        </h3>
        <ul className="flex flex-col gap-3 text-sm text-(--cui-color-text-muted)">
          <li className="flex items-center gap-3">
            <kbd className="shrink-0 rounded border border-(--cui-color-stroke-default) bg-(--cui-color-background-secondary) px-1.5 py-0.5 text-xs font-medium text-(--cui-color-text-default)">
              {isMac ? '⌘B' : 'Ctrl+B'}
            </kbd>
            <span>{localize('com_admin_dash_tip_sidebar')}</span>
          </li>
          <li className="flex items-center gap-3">
            <kbd className="shrink-0 rounded border border-(--cui-color-stroke-default) bg-(--cui-color-background-secondary) px-1.5 py-0.5 text-xs font-medium text-(--cui-color-text-default)">
              {isMac ? '⌘K' : 'Ctrl+K'}
            </kbd>
            <span>{localize('com_admin_dash_tip_cmdk')}</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
