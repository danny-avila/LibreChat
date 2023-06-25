import exportFromJSON from 'export-from-json';
import { useEffect, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { Dialog, DialogButton, DialogTemplate } from '~/components/';
import SaveAsPresetDialog from './SaveAsPresetDialog';
import cleanupPreset from '~/utils/cleanupPreset';

import Settings from './Settings';

import store from '~/store';

// A preset dialog to show readonly preset values.
const EndpointOptionsDialog = ({ open, onOpenChange, preset: _preset, title }) => {
  const [preset, setPreset] = useState(_preset);
  const [endpointName, setEndpointName] = useState(preset?.endpoint);

  const [saveAsDialogShow, setSaveAsDialogShow] = useState(false);
  const endpointsConfig = useRecoilValue(store.endpointsConfig);

  if (endpointName === 'google') {
    setEndpointName('PaLM');
  }

  if (endpointName === 'gptPlugins') {
    setEndpointName('Plugins');
  }

  const setOption = (param) => (newValue) => {
    let update = {};
    update[param] = newValue;
    setPreset((prevState) => ({
      ...prevState,
      ...update
    }));
  };

  const saveAsPreset = () => {
    setSaveAsDialogShow(true);
  };

  const exportPreset = () => {
    exportFromJSON({
      data: cleanupPreset({ preset, endpointsConfig }),
      fileName: `${preset?.title}.json`,
      exportType: exportFromJSON.types.json
    });
  };

  useEffect(() => {
    setPreset(_preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTemplate
          title={`${
            title || (navigator.languages[0] === 'zh-CN' ? '查看选项' : 'View Options')
          } - ${endpointName}`}
          className="max-w-full sm:max-w-4xl"
          main={
            <div className="flex w-full flex-col items-center gap-2">
              <div className="w-full p-0">
                <Settings preset={preset} readonly={true} setOption={setOption} />
              </div>
            </div>
          }
          buttons={
            <>
              <DialogButton
                onClick={saveAsPreset}
                className="dark:hover:gray-400 border-gray-700 bg-green-600 text-white hover:bg-green-700 dark:hover:bg-green-800"
              >
                {navigator.languages[0] === 'zh-CN' ? '另存为预设' : 'Save As Preset'}
              </DialogButton>
            </>
          }
          leftButtons={
            <>
              <DialogButton onClick={exportPreset} className="dark:hover:gray-400 border-gray-700">
                {navigator.languages[0] === 'zh-CN' ? '导出' : 'Export'}
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
