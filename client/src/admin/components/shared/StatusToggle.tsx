import type * as t from '~/admin/types';
import { useLocalize } from '~/admin/hooks';
import { Switch } from '~/admin/ui';

export function StatusToggle({ id, isActive, onChange, disabled }: t.StatusToggleProps) {
  const localize = useLocalize();
  const label = isActive
    ? localize('com_admin_access_active')
    : localize('com_admin_access_paused');

  return (
    <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <Switch
        id={`status-${id}`}
        checked={isActive}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={label}
      />
      <span className="text-xs text-(--cui-color-text-muted)">{label}</span>
    </div>
  );
}
