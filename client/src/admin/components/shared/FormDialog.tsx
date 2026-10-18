import type * as t from '~/admin/types';
import { RowFilterContext } from '~/admin/contexts/RowFilterContext';
import { Button, Dialog } from '~/admin/ui';
import { useLocalize } from '~/admin/hooks';
import { cn } from '~/admin/utils';

const sizeClasses: Record<string, string> = {
  sm: '',
  lg: '!max-w-2xl',
};

/**
 * A dialog wrapping one form (VS-11): the title stays at the top and the
 * error and Cancel/Submit footer at the bottom while only the fields scroll,
 * so long forms (Create MCP server) keep their actions in reach.
 */
export function FormDialog({
  open,
  title,
  submitLabel,
  submitDisabled,
  saving,
  error,
  hint,
  size,
  onSubmit,
  onClose,
  children,
}: t.FormDialogProps) {
  const localize = useLocalize();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <Dialog.Content
        title={title}
        showClose
        onClose={onClose}
        className={cn('form-dialog-content', size && sizeClasses[size])}
      >
        <form onSubmit={handleSubmit} className="form-dialog-form">
          <div className="form-dialog-body">
            <RowFilterContext.Provider value={null}>{children}</RowFilterContext.Provider>
          </div>
          <div className="form-dialog-footer">
            {error && (
              <p role="alert" className="m-0 text-sm text-(--cui-color-text-danger)">
                {error}
              </p>
            )}
            {!error && hint && <p className="m-0 text-sm text-(--cui-color-text-muted)">{hint}</p>}
            <div className="flex items-center justify-end gap-2">
              <Button
                htmlType="button"
                type="secondary"
                label={localize('com_admin_ui_cancel')}
                onClick={onClose}
                disabled={saving}
              />
              <Button
                htmlType="submit"
                type="primary"
                label={submitLabel}
                disabled={submitDisabled || saving}
              />
            </div>
          </div>
        </form>
      </Dialog.Content>
    </Dialog>
  );
}
