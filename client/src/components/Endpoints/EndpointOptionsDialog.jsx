import React, { useEffect, useState } from 'react';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import axios from 'axios';
import exportFromJSON from 'export-from-json';
import DialogTemplate from '../ui/DialogTemplate.jsx';
import { Dialog, DialogClose, DialogButton } from '../ui/Dialog.tsx';
import { Input } from '../ui/Input.tsx';
import { Label } from '../ui/Label.tsx';
import Dropdown from '../ui/Dropdown.jsx';
import SaveAsPresetDialog from './SaveAsPresetDialog';
import { cn } from '~/utils/';
import cleanupPreset from '~/utils/cleanupPreset';

import OpenAISettings from './OpenAI/Settings.jsx';
import BingAISettings from './BingAI/Settings.jsx';

import store from '~/store';

// A preset dialog to show readonly preset values.
const EndpointOptionsDialog = ({ open, onOpenChange, preset: _preset, title }) => {
  //   const [title, setTitle] = useState('My Preset');
  const [preset, setPreset] = useState(_preset);

  const [saveAsDialogShow, setSaveAsDialogShow] = useState(false);

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
          readonly={true}
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
    else if (endpoint === 'bingAI')
      return (
        <BingAISettings
          readonly={true}
          context={preset?.context}
          setContext={setOption('context')}
          systemMessage={preset?.systemMessage}
          setSystemMessage={setOption('systemMessage')}
          jailbreak={preset?.jailbreak}
          setJailbreak={setOption('jailbreak')}
        />
      );
    else return null;
  };

  const saveAsPreset = () => {
    setSaveAsDialogShow(true);
  };

  const exportPreset = () => {
    exportFromJSON({
      data: cleanupPreset(preset),
      fileName: `${preset?.title}.json`,
      exportType: exportFromJSON.types.json
    });
  };

  useEffect(() => {
    setPreset(_preset);
  }, [open]);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
      >
        <DialogTemplate
          title={title || 'View Options'}
          className="max-w-full sm:max-w-4xl"
          main={
            <div className="flex w-full flex-col items-center gap-2">
              <div className="w-full p-0">{renderSettings()}</div>
            </div>
          }
          buttons={
            <>
              <DialogButton
                onClick={saveAsPreset}
                className="dark:hover:gray-400 border-gray-700 bg-green-600 text-white hover:bg-green-700 dark:hover:bg-green-800"
              >
                Save As Preset
              </DialogButton>
            </>
          }
          leftButtons={
            <>
              <DialogButton
                onClick={exportPreset}
                className="dark:hover:gray-400 border-gray-700"
              >
                Export
              </DialogButton>
            </>
          }
        />
      </Dialog>
      <SaveAsPresetDialog
        open={saveAsDialogShow}
        onOpenChange={setSaveAsDialogShow}
        preset={preset}
      />
    </>
  );
};

export default EndpointOptionsDialog;
