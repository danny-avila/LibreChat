import React, { useEffect, useState } from 'react';
import { useCreatePresetMutation } from 'librechat-data-provider/react-query';
import type { TEditPresetProps } from '~/common';
import { cn, defaultTextPropsLabel, removeFocusOutlines, cleanupPreset } from '~/utils/';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { Dialog, Input, Label } from '~/components/ui/';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';

const SaveAsPresetDialog = ({ open, onOpenChange, preset }: TEditPresetProps) => {
  const [title, setTitle] = useState<string>(preset?.title || 'My Preset');
  const createPresetMutation = useCreatePresetMutation();
  const { showToast } = useToastContext();
  const localize = useLocalize();

  const submitPreset = () => {
    const _preset = cleanupPreset({
      preset: {
        ...preset,
        title,
      },
    });

    const toastTitle = _preset.title
      ? `\`${_preset.title}\``
      : localize('com_endpoint_preset_title');

    createPresetMutation.mutate(_preset, {
      onSuccess: () => {
        showToast({
          message: `${toastTitle} ${localize('com_endpoint_preset_saved')}`,
        });
      },
      onError: () => {
        showToast({
          message: localize('com_endpoint_preset_save_error'),
          severity: NotificationSeverity.ERROR,
        });
      },
    });
  };

  useEffect(() => {
    setTitle(preset?.title || localize('com_endpoint_my_preset'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTemplate
        title={localize('com_endpoint_save_as_preset')}
        className="w-full sm:w-1/4"
        main={
          <div className="flex w-full flex-col items-center gap-2">
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="chatGptLabel" className="text-left text-sm font-medium">
                {localize('com_endpoint_preset_name')}
              </Label>
              <Input
                id="chatGptLabel"
                value={title || ''}
                onChange={(e) => setTitle(e.target.value || '')}
                placeholder="Set a custom name for this preset"
                className={cn(
                  defaultTextPropsLabel,
                  'flex h-10 max-h-10 w-full resize-none px-3 py-2',
                  removeFocusOutlines,
                )}
              />
            </div>
          </div>
        }
        selection={{
          selectHandler: submitPreset,
          selectClasses: 'bg-green-600 hover:bg-green-700 dark:hover:bg-green-800 text-white',
          selectText: localize('com_ui_save'),
        }}
      />
    </Dialog>
  );
};

export default SaveAsPresetDialog;
