import type * as t from '~/admin/types';
import { ConfirmationDialog } from '~/admin/ui';
import { useLocalize } from '~/admin/hooks';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmType = 'danger',
  saving,
  error,
  onConfirm,
  onCancel,
}: t.ConfirmDialogProps) {
  const localize = useLocalize();

  return (
    <ConfirmationDialog
      open={open}
      title={title}
      message={description}
      primaryActionLabel={confirmLabel}
      primaryActionType={confirmType}
      secondaryActionLabel={localize('com_admin_ui_cancel')}
      loading={saving}
      onConfirm={onConfirm}
      onCancel={onCancel}
      showClose
    >
      {error && (
        <p role="alert" className="text-sm text-(--cui-color-text-danger)">
          {error}
        </p>
      )}
    </ConfirmationDialog>
  );
}
