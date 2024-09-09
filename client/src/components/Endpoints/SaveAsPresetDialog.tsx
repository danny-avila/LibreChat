import React, { useEffect, useState } from 'react';
import { useCreatePresetMutation } from 'librechat-data-provider/react-query';
import type { TEditPresetProps } from '~/common';
import { cn, removeFocusOutlines, cleanupPreset, defaultTextProps } from '~/utils/';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { OGDialog, Input, Label } from '~/components/ui/';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';

const SaveAsPresetDialog = ({ open, onOpenChange, preset }: TEditPresetProps) => {
  const [title, setTitle] = useState<string>(preset.title ?? 'My Preset');
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

    const toastTitle =
      _preset.title ?? '' ? `\`${_preset.title}\`` : localize('com_endpoint_preset_title');

    createPresetMutation.mutate(_preset, {
      onSuccess: () => {
        showToast({
          message: `${toastTitle} ${localize('com_endpoint_preset_saved')}`,
        });
        onOpenChange(false); // Close the dialog on success
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
    setTitle(preset.title ?? localize('com_endpoint_my_preset'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Handle Enter key press
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitPreset();
    }
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogTemplate
        title={localize('com_endpoint_save_as_preset')}
        className="z-[90] w-11/12 sm:w-1/4"
        overlayClassName="z-[80]"
        showCloseButton={false}
        main={
          <div className="flex w-full flex-col items-center gap-2">
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="preset-custom-name" className="text-left text-sm font-medium">
                {localize('com_endpoint_preset_name')}
              </Label>
              <Input
                id="preset-custom-name"
                value={title || ''}
                onChange={(e) => setTitle(e.target.value || '')}
                onKeyDown={handleKeyDown}
                placeholder={localize('com_endpoint_preset_custom_name_placeholder')}
                aria-label={localize('com_endpoint_preset_name')}
                className={cn(
                  defaultTextProps,
                  'flex h-10 max-h-10 w-full resize-none border-gray-100 px-3 py-2 dark:border-gray-600',
                  removeFocusOutlines,
                )}
              />
            </div>
          </div>
        }
        selection={{
          selectHandler: submitPreset,
          selectClasses: 'bg-green-500 hover:bg-green-600 dark:hover:bg-green-600 text-white',
          selectText: localize('com_ui_save'),
        }}
      />
    </OGDialog>
  );
};

export default SaveAsPresetDialog;
