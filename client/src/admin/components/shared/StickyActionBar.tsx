import type * as t from '~/admin/types';
import { Button } from '~/admin/ui';

export function StickyActionBar({
  discardLabel,
  saveLabel,
  onDiscard,
  onSave,
  message,
  label,
}: t.StickyActionBarProps) {
  return (
    <div
      role="region"
      aria-label={label}
      className="admin-slide-up flex shrink-0 flex-wrap items-center gap-2 border-t border-(--cui-color-stroke-default) bg-(--cui-color-background-default) px-6 py-3"
    >
      {message && (
        <span className="min-w-0 flex-1 text-sm text-(--cui-color-text-default)">{message}</span>
      )}
      <div className="ml-auto flex items-center gap-2">
        <Button htmlType="button" type="secondary" label={discardLabel} onClick={onDiscard} />
        <Button htmlType="button" type="primary" label={saveLabel} onClick={onSave} />
      </div>
    </div>
  );
}
