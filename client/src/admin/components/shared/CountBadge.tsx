import type * as t from '~/admin/types';
import { useLocalize } from '~/admin/hooks';
import { cn } from '~/admin/utils';

/**
 * Count beside a section or group title: "3 of 29 set" (settings with a value
 * from librechat.yaml or the panel), with what that means on hover. A
 * collection shows its entry count ("2", read "2 entries").
 */
export function CountBadge({ configured, total, entries, overrides = 0 }: t.CountBadgeProps) {
  const localize = useLocalize();
  if (total <= 0) return null;
  const count = entries ? (
    <span className="config-count-badge config-count-badge-active">
      <span aria-hidden="true">{total}</span>
      <span className="sr-only">{`, ${localize('com_admin_config_ui_entries', { count: total })}`}</span>
    </span>
  ) : (
    <span
      title={localize('com_admin_config_ui_count_desc')}
      className={cn(
        'config-count-badge',
        configured > 0 ? 'config-count-badge-active' : 'config-count-badge-muted',
      )}
    >
      <span className="sr-only">,</span>{' '}
      {localize('com_admin_config_ui_count', { configured, total })}
    </span>
  );
  if (overrides <= 0) return count;
  return (
    <>
      {count}
      <OverrideCount count={overrides} />
    </>
  );
}

/** Admin overrides among the counted values: the blue of the Admin override chip, apart from librechat.yaml values. */
export function OverrideCount({ count }: t.OverrideCountProps) {
  const localize = useLocalize();
  const label = localize('com_admin_config_ui_overrides', { count });
  return (
    <span className="config-count-badge config-count-badge-override" title={label}>
      <span className="sr-only">, </span>
      {label}
    </span>
  );
}
