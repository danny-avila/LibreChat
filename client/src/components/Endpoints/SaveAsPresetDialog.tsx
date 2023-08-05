import React, { useEffect, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { useCreatePresetMutation } from 'librechat-data-provider';
import type { TEditPresetProps } from '~/common';
import { Dialog, Input, Label } from '~/components/ui/';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { cn, defaultTextPropsLabel, removeFocusOutlines, cleanupPreset } from '~/utils/';
import { useLocalize } from '~/hooks';
import store from '~/store';

const SaveAsPresetDialog = ({ open, onOpenChange, preset }: TEditPresetProps) => {
  const [title, setTitle] = useState<string>(preset?.title || 'My Preset');
  const endpointsConfig = useRecoilValue(store.endpointsConfig);
  const createPresetMutation = useCreatePresetMutation();
  const localize = useLocalize();

  const submitPreset = () => {
    const _preset = cleanupPreset({
      preset: {
        ...preset,
        title,
      },
      endpointsConfig,
    });
    createPresetMutation.mutate(_preset);
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
          selectText: 'Save',
        }}
      />
    </Dialog>
  );
};

export default SaveAsPresetDialog;
