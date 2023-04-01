import React, { useEffect, useState } from 'react';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import axios from 'axios';
import DialogTemplate from '../ui/DialogTemplate';
import { Dialog } from '../ui/Dialog.tsx';
import { Input } from '../ui/Input.tsx';
import { Label } from '../ui/Label.tsx';
import Dropdown from '../ui/Dropdown';
import { cn } from '~/utils/';
import OpenAISettings from './OpenAI/Settings';

import store from '~/store';

const EditPresetDialog = ({ open, onOpenChange, preset: _preset }) => {
  //   const [title, setTitle] = useState('My Preset');
  const [preset, setPreset] = useState({});
  const setPresets = useSetRecoilState(store.presets);

  const availableEndpoints = useRecoilValue(store.availableEndpoints);

  const setOption = param => newValue => {
    let update = {};
    update[param] = newValue;
    setPreset(prevState => ({
      ...prevState,
      ...update
    }));
  };

  const renderSettings = () => {
    const { endpoint } = preset || {};

    if (endpoint === 'openAI')
      return (
        <OpenAISettings
          model={preset?.model}
          setModel={setOption('model')}
          chatGptLabel={preset?.chatGptLabel}
          setChatGptLabel={setOption('chatGptLabel')}
          promptPrefix={preset?.promptPrefix}
          setPromptPrefix={setOption('promptPrefix')}
          temperature={preset?.temperature}
          setTemperature={setOption('temperature')}
          topP={preset?.top_p}
          setTopP={setOption('top_p')}
          freqP={preset?.presence_penalty}
          setFreqP={setOption('presence_penalty')}
          presP={preset?.frequency_penalty}
          setPresP={setOption('frequency_penalty')}
        />
      );
    else return null;
  };

  const defaultTextProps =
    'rounded-md border border-gray-200 focus:bg-gray-50 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.05)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-500 dark:bg-gray-700 focus:dark:bg-gray-600 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-400 dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0';

  const submitPreset = () => {
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
    setPreset(_preset);
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogTemplate
        title="Edit Preset"
        className="max-w-full sm:max-w-4xl"
        main=<div className="flex w-full flex-col items-center gap-2">
          <div className="grid w-full gap-6 sm:grid-cols-2">
            <div className="col-span-1 flex flex-col items-start justify-start gap-2">
              <Label
                htmlFor="chatGptLabel"
                className="text-left text-sm font-medium"
              >
                Preset Name
              </Label>
              <Input
                id="chatGptLabel"
                value={preset?.title || ''}
                onChange={e => setOption('title')(e.target.value || '')}
                placeholder="Set a custom name, in case you can find this preset"
                className={cn(
                  defaultTextProps,
                  'flex h-10 max-h-10 w-full resize-none px-3 py-2 focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0'
                )}
              />
            </div>
            <div className="col-span-1 flex flex-col items-start justify-start gap-2">
              <Label
                htmlFor="endpoint"
                className="text-left text-sm font-medium"
              >
                Endpoint
              </Label>
              <Dropdown
                id="endpoint"
                value={preset?.endpoint || ''}
                onChange={setOption('endpoint')}
                options={availableEndpoints}
                className={cn(
                  defaultTextProps,
                  'flex h-10 max-h-10 w-full resize-none focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0'
                )}
                containerClassName="flex w-full resize-none"
              />
            </div>
          </div>
          <div className="my-4 w-full border-t border-gray-300 dark:border-gray-500" />
          <div className="w-full p-0">{renderSettings()}</div>
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

export default EditPresetDialog;
