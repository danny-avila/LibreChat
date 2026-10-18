import type * as t from '~/admin/types';
import { Button, Dialog } from '~/admin/ui';
import { useLocalize } from '~/admin/hooks';

/**
 * Themed unsaved-changes prompt for leaving the page or switching profile
 * (WS5: SH-6): Save & continue, Discard, or Cancel, with the change count.
 */
export function NavigationGuardDialog({
  open,
  intent,
  changeCount,
  onSave,
  onDiscard,
  onCancel,
}: t.NavigationGuardDialogProps) {
  const localize = useLocalize();

  const title = (() => {
    if (intent.kind === 'scope') {
      return localize('com_admin_config_shell_guard_switch_title', {
        name: intent.name,
        count: changeCount,
      });
    }
    return localize('com_admin_config_shell_guard_leave_title', { count: changeCount });
  })();

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel();
      }}
    >
      <Dialog.Content title={title} showClose onClose={onCancel}>
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm leading-relaxed text-(--cui-color-text-default)">
            {localize('com_admin_config_shell_guard_desc', { count: changeCount })}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              htmlType="button"
              type="secondary"
              label={localize('com_admin_ui_cancel')}
              onClick={onCancel}
            />
            <Button
              htmlType="button"
              type="danger"
              label={localize('com_admin_config_shell_guard_discard')}
              onClick={onDiscard}
            />
            <Button
              htmlType="button"
              type="primary"
              label={localize('com_admin_config_shell_guard_save')}
              onClick={onSave}
            />
          </div>
        </div>
      </Dialog.Content>
    </Dialog>
  );
}
