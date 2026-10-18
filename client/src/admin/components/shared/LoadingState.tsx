import type * as t from '~/admin/types';
import { useLocalize } from '~/admin/hooks';
import { Icon } from '~/admin/ui';

export function LoadingState({ className }: t.LoadingStateProps) {
  const localize = useLocalize();

  return (
    <div
      className={
        className ??
        'flex items-center justify-center gap-2 py-12 text-sm text-(--cui-color-text-muted)'
      }
    >
      <Icon name="loading-animated" size="sm" />
      {localize('com_admin_ui_loading')}
    </div>
  );
}
