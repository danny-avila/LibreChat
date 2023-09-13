import exportFromJSON from 'export-from-json';
import { useEffect, useState } from 'react';
import { useRecoilValue, useRecoilState } from 'recoil';
import { tPresetSchema } from 'librechat-data-provider';
import type { TSetOption, TEditPresetProps } from '~/common';
import { Dialog, DialogButton } from '~/components/ui';
import DialogTemplate from '~/components/ui/DialogTemplate';
import SaveAsPresetDialog from './SaveAsPresetDialog';
import EndpointSettings from './EndpointSettings';
import PopoverButtons from './PopoverButtons';
import { cleanupPreset } from '~/utils';
import { useLocalize } from '~/hooks';
import store from '~/store';

// A preset dialog to show readonly preset values.
const EndpointOptionsDialog = ({
  open,
  onOpenChange,
  preset: _preset,
  title,
}: TEditPresetProps) => {
  const [preset, setPreset] = useRecoilState(store.preset);
  const [saveAsDialogShow, setSaveAsDialogShow] = useState(false);
  const endpointsConfig = useRecoilValue(store.endpointsConfig);
  const localize = useLocalize();

  const setOption: TSetOption = (param) => (newValue) => {
    const update = {};
    update[param] = newValue;
    setPreset((prevState) =>
      tPresetSchema.parse({
        ...prevState,
        ...update,
      }),
    );
  };

  const saveAsPreset = () => {
    setSaveAsDialogShow(true);
  };

  const exportPreset = () => {
    if (!preset) {
      return;
    }
    exportFromJSON({
      data: cleanupPreset({ preset, endpointsConfig }),
      fileName: `${preset?.title}.json`,
      exportType: exportFromJSON.types.json,
    });
  };

  useEffect(() => {
    setPreset(_preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { endpoint } = preset ?? {};
  if (!endpoint) {
    return null;
  }

  if (!preset) {
    return null;
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTemplate
          title={`${title || localize('com_endpoint_save_convo_as_preset')}`}
          className="h-full max-w-full overflow-y-auto pb-4 sm:w-[680px] sm:pb-0 md:h-[680px] md:w-[750px] md:overflow-y-hidden lg:w-[950px]"
          // headerClassName="sm:p-2 h-16"
          main={
            <div className="flex w-full flex-col items-center gap-2 md:h-[530px]">
              <div className="w-full p-0">
                <PopoverButtons
                  endpoint={endpoint}
                  buttonClass="ml-0 mb-4 col-span-2 dark:bg-gray-700 dark:hover:bg-gray-800 p-2"
                />
                <EndpointSettings
                  conversation={preset}
                  setOption={setOption}
                  isPreset={true}
                  className="h-full md:mb-0 md:h-[490px]"
                />
              </div>
            </div>
          }
          buttons={
            <div className="mb-6 md:mb-2">
              <DialogButton onClick={exportPreset} className="dark:hover:gray-400 border-gray-700">
                {localize('com_endpoint_export')}
              </DialogButton>
              <DialogButton
                onClick={saveAsPreset}
                className="dark:hover:gray-400 ml-2 border-gray-700 bg-green-600 text-white hover:bg-green-700 dark:hover:bg-green-800"
              >
                {localize('com_endpoint_save_as_preset')}
              </DialogButton>
            </div>
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
