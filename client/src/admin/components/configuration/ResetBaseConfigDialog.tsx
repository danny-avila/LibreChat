import { useId } from 'react';
import type * as t from '~/admin/types';
import { Button, Dialog } from '~/admin/ui';
import { useLocalize } from '~/admin/hooks';
import { ReviewList } from './review';

/**
 * "Revert all admin overrides to librechat.yaml" (RV-5): lists every base
 * override it removes and what each setting goes back to, as a danger action.
 * The list scrolls on its own, so it is a focusable region keyboard users can scroll.
 */
export function ResetBaseConfigDialog({
  open,
  resetting,
  error,
  overrides,
  onConfirm,
  onCancel,
}: t.ResetBaseConfigDialogProps) {
  const localize = useLocalize();
  const listLabelId = useId();
  const count = overrides?.count ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel();
      }}
    >
      <Dialog.Content
        title={localize('com_admin_config_review_reset_title')}
        showClose
        onClose={onCancel}
      >
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm leading-relaxed text-(--cui-color-text-default)">
            {localize('com_admin_config_review_reset_body')}
          </p>
          {overrides && count > 0 && (
            <div className="flex flex-col gap-2">
              <p
                id={listLabelId}
                className="m-0 text-sm font-medium text-(--cui-color-text-default)"
              >
                {localize('com_admin_config_review_reset_list', { count })}
              </p>
              <div
                role="region"
                tabIndex={0}
                aria-labelledby={listLabelId}
                className="flex max-h-80 flex-col gap-3 overflow-y-auto rounded-lg border border-(--cui-color-stroke-default) px-3 py-2 focus-visible:outline-1 focus-visible:outline-(--cui-color-outline)"
              >
                <ReviewList tabs={overrides.model.tabs} isScope={false} compact />
              </div>
            </div>
          )}
          {error && (
            <div
              className="bg-status-error-subtle rounded-lg px-3 py-2 text-sm font-medium text-(--cui-color-text-danger)"
              role="alert"
            >
              {error}
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button
              htmlType="button"
              type="secondary"
              label={localize('com_admin_ui_cancel')}
              onClick={onCancel}
              disabled={resetting}
            />
            <Button
              htmlType="button"
              type="danger"
              label={
                resetting
                  ? localize('com_admin_config_reset_base_resetting')
                  : localize('com_admin_config_review_reset_action', { count })
              }
              iconLeft={resetting ? 'loading-animated' : undefined}
              onClick={onConfirm}
              disabled={resetting}
            />
          </div>
        </div>
      </Dialog.Content>
    </Dialog>
  );
}
