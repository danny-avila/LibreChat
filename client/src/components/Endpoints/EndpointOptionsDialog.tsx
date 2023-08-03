import exportFromJSON from 'export-from-json';
import { useEffect, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { EditPresetProps, SetOption } from 'librechat-data-provider';
import { Dialog, DialogButton } from '~/components/ui';
import DialogTemplate from '~/components/ui/DialogTemplate';
import SaveAsPresetDialog from './SaveAsPresetDialog';
import EndpointSettings from './EndpointSettings';
import { alternateName, cleanupPreset } from '~/utils';
import { useLocalize } from '~/hooks';
import store from '~/store';

// A preset dialog to show readonly preset values.
const EndpointOptionsDialog = ({ open, onOpenChange, preset: _preset, title }: EditPresetProps) => {
  const [preset, setPreset] = useState(_preset);
  const [saveAsDialogShow, setSaveAsDialogShow] = useState(false);
  const endpointsConfig = useRecoilValue(store.endpointsConfig);
  const localize = useLocalize();
  let endpointName = 'Endpoint';
  if (preset?.endpoint) {
    endpointName = alternateName[preset?.endpoint] ?? 'Endpoint';
  }

  const setOption: SetOption = (param) => (newValue) => {
    const update = {};
    update[param] = newValue;
    setPreset((prevState) => ({
      ...prevState,
      ...update,
    }));
  };

  const saveAsPreset = () => {
    setSaveAsDialogShow(true);
  };

  const exportPreset = () => {
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTemplate
          title={`${title || localize('com_endpoint_view_options')} - ${endpointName}`}
          className="h-full max-w-full overflow-y-auto pb-0 sm:w-[680px] md:h-[675px] md:w-[750px] lg:w-[950px]"
          headerClassName="sm:p-0"
          main={
            <div className="flex w-full flex-col items-center gap-2">
              <div className="w-full p-0">
                <EndpointSettings preset={preset} readonly={true} setOption={setOption} />
              </div>
            </div>
          }
          buttons={
            <>
              <DialogButton onClick={exportPreset} className="dark:hover:gray-400 border-gray-700">
                {localize('com_endpoint_export')}
              </DialogButton>
              <DialogButton
                onClick={saveAsPreset}
                className="dark:hover:gray-400 border-gray-700 bg-green-600 text-white hover:bg-green-700 dark:hover:bg-green-800"
              >
                {localize('com_endpoint_save_as_preset')}
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
