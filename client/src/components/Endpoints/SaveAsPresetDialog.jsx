import React, { useEffect, useState } from 'react';
import { useSetRecoilState } from 'recoil';
import axios from 'axios';
import DialogTemplate from '../ui/DialogTemplate';
import { Dialog } from '../ui/Dialog.tsx';
import { Input } from '../ui/Input.tsx';
import { Label } from '../ui/Label.tsx';
import { cn } from '~/utils/';
import buildPresetByConversation from '~/utils/buildPresetByConversation';

import store from '~/store';

const SaveAsPresetDialog = ({ open, onOpenChange, conversation }) => {
  const [title, setTitle] = useState('My Preset');
  const setPresets = useSetRecoilState(store.presets);

  const defaultTextProps =
    'rounded-md border border-gray-300 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.10)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-400 dark:bg-gray-700 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-400 dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0';

  const submitPreset = () => {
    const preset = buildPresetByConversation({
      title,
      conversation
    });

    axios({
      method: 'post',
      url: '/api/presets',
      data: preset,
      withCredentials: true
    }).then(res => {
      setPresets(res?.data);
    });
  };

  useEffect(() => {
    setTitle('My Preset');
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogTemplate
        title="Save As Preset"
        main=<div className="grid w-full items-center gap-2">
          <Label
            htmlFor="chatGptLabel"
            className="text-left text-sm font-medium"
          >
            Preset Name
          </Label>
          <Input
            id="chatGptLabel"
            value={title || ''}
            onChange={e => setTitle(e.target.value || '')}
            placeholder="Set a custom name, in case you can find this preset"
            className={cn(
              defaultTextProps,
              'flex h-10 max-h-10 w-full resize-none px-3 py-2 focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0'
            )}
          />
        </div>
        selection={{
          selectHandler: submitPreset,
          selectClasses: 'bg-green-600 hover:bg-green-700 dark:hover:bg-green-800 text-white',
          selectText: 'Save'
        }}
      />
    </Dialog>
  );
};

export default SaveAsPresetDialog;
