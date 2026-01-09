import React, { useEffect, useState } from 'react';
import { useCreatePresetMutation } from 'librechat-data-provider/react-query';
import {
  Input,
  Label,
  Button,
  Spinner,
  useToastContext,
  OGDialog,
  OGDialogTemplate,
} from '@librechat/client';
import type { TEditPresetProps } from '~/common';
import { NotificationSeverity } from '~/common';
import { cleanupPreset, logger } from '~/utils';
import { useLocalize } from '~/hooks';

const SaveAsPresetDialog = ({ open, onOpenChange, preset }: TEditPresetProps) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const createPresetMutation = useCreatePresetMutation();
  const isLoading = createPresetMutation.isLoading;

  const [title, setTitle] = useState<string>(preset.title ?? 'My Preset');

  const submitPreset = () => {
    const _preset = cleanupPreset({
      preset: {
        ...preset,
        title,
      },
    });

    const toastTitle =
      (_preset.title ?? '') ? `\`${_preset.title}\`` : localize('com_endpoint_preset_title');

    createPresetMutation.mutate(_preset, {
      onSuccess: () => {
        showToast({
          message: `${toastTitle} ${localize('com_ui_saved')}`,
        });
        onOpenChange(false); // Close the dialog on success
      },
      onError: (error) => {
        logger.error('Error saving preset:', error);
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
        className="w-11/12 max-w-lg"
        showCloseButton={false}
        main={
          <div className="flex w-full flex-col items-center gap-2">
            <Label htmlFor="preset-custom-name" className="text-sm font-medium">
              {localize('com_endpoint_preset_name')}
            </Label>
            <Input
              id="preset-custom-name"
              value={title || ''}
              onChange={(e) => setTitle(e.target.value || '')}
              onKeyDown={handleKeyDown}
              placeholder={localize('com_endpoint_enter_name_placeholder')}
              aria-label={localize('com_endpoint_preset_name')}
            />
          </div>
        }
        selection={
          <Button variant="submit" onClick={submitPreset}>
            {isLoading ? <Spinner /> : localize('com_ui_save')}
          </Button>
        }
      />
    </OGDialog>
  );
};

export default SaveAsPresetDialog;
