import type * as t from '~/admin/types';
import { useLocalize } from '~/admin/hooks';
import { cn } from '~/admin/utils';

/**
 * A configuration tab's badges (EV-3): its count as a number, read "25
 * endpoints" or "8 settings set" (in the tooltip and by screen readers), the
 * admin overrides among them in the override blue (in a profile, the entries
 * it overrides or adds), and a dot while the tab has unsaved edits.
 */
export function TabCountBadge({ badge }: t.TabCountBadgeProps) {
  const localize = useLocalize();
  if (!badge) return null;
  const label = localize(badge.labelKey, { count: badge.count });
  const overrides =
    badge.overrides > 0
      ? localize(
          badge.scope
            ? 'com_admin_config_values_scope_overrides'
            : 'com_admin_config_values_overrides',
          {
            count: badge.overrides,
          },
        )
      : null;
  const pending =
    badge.pending > 0
      ? localize('com_admin_config_values_pending', { count: badge.pending })
      : null;
  return (
    <>
      <span
        title={label}
        className={cn(
          'config-tab-count whitespace-nowrap',
          badge.count > 0 ? 'config-tab-count-active' : 'config-tab-count-zero',
        )}
      >
        <span aria-hidden="true">{badge.count}</span>
        <span className="sr-only">{label}</span>
      </span>
      {overrides && (
        <span title={overrides} className="config-tab-count config-tab-count-override">
          <span aria-hidden="true">{badge.overrides}</span>
          <span className="sr-only">{overrides}</span>
        </span>
      )}
      {pending && (
        <span
          className="relative inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-(--settings-warn-mark)"
          title={pending}
        >
          <span className="sr-only">{pending}</span>
        </span>
      )}
    </>
  );
}
