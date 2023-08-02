import axios from 'axios';
import { useEffect } from 'react';
import PopoverButtons from './PopoverButtons';
import exportFromJSON from 'export-from-json';
import Settings from '~/components/Input/Settings';
import { useSetOptions } from '~/hooks';
import { useSetRecoilState, useRecoilState, useRecoilValue } from 'recoil';
import filenamify from 'filenamify';
import { Input, Label, Dropdown, Dialog, DialogClose, DialogButton } from '~/components/';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { cn, defaultTextProps, removeFocusOutlines } from '~/utils/';
import cleanupPreset from '~/utils/cleanupPreset';
import { localize } from '~/localization/Translation';
import store from '~/store';

const EditPresetDialog = ({ open, onOpenChange, preset: _preset, title }) => {
  const lang = useRecoilValue(store.lang);
  const [preset, setPreset] = useRecoilState(store.preset);
  const setPresets = useSetRecoilState(store.presets);
  const availableEndpoints = useRecoilValue(store.availableEndpoints);
  const endpointsConfig = useRecoilValue(store.endpointsConfig);
  const { setOption } = useSetOptions(_preset);

  const submitPreset = () => {
    axios({
      method: 'post',
      url: '/api/presets',
      data: cleanupPreset({ preset, endpointsConfig }),
      withCredentials: true,
    }).then((res) => {
      setPresets(res?.data);
    });
  };

  const exportPreset = () => {
    const fileName = filenamify(preset?.title || 'preset');
    exportFromJSON({
      data: cleanupPreset({ preset, endpointsConfig }),
      fileName,
      exportType: exportFromJSON.types.json,
    });
  };

  useEffect(() => {
    setPreset(_preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTemplate
        title={`${title || localize(lang, 'com_endpoint_edit_preset')} - ${preset?.title}`}
        className="h-full max-w-full overflow-y-auto sm:w-[680px] md:h-[675px] md:w-[750px] lg:w-[950px]"
        main={
          <div className="flex w-full flex-col items-center gap-2 md:h-[475px]">
            <div className="grid w-full gap-6 sm:grid-cols-2">
              <div className="col-span-1 flex flex-col items-start justify-start gap-2">
                <Label htmlFor="preset-name" className="text-left text-sm font-medium">
                  {localize(lang, 'com_endpoint_preset_name')}
                </Label>
                <Input
                  id="preset-name"
                  value={preset?.title || ''}
                  onChange={(e) => setOption('title')(e.target.value || '')}
                  placeholder={localize(lang, 'com_endpoint_set_custom_name')}
                  className={cn(
                    defaultTextProps,
                    'flex h-10 max-h-10 w-full resize-none px-3 py-2',
                    removeFocusOutlines,
                  )}
                />
              </div>
              <div className="col-span-1 flex flex-col items-start justify-start gap-2">
                <Label htmlFor="endpoint" className="text-left text-sm font-medium">
                  {localize(lang, 'com_endpoint')}
                </Label>
                <Dropdown
                  id="endpoint"
                  value={preset?.endpoint || ''}
                  onChange={setOption('endpoint')}
                  options={availableEndpoints}
                  className={cn(
                    defaultTextProps,
                    'flex h-10 max-h-10 w-full resize-none',
                    removeFocusOutlines,
                  )}
                  containerClassName="flex w-full resize-none"
                />
                <PopoverButtons endpoint={preset?.endpoint} />
              </div>
            </div>
            <div className="my-4 w-full border-t border-gray-300 dark:border-gray-500" />
            <div className="w-full p-0">
              <Settings conversation={preset} setOption={setOption} isPreset={true} />
            </div>
          </div>
        }
        buttons={
          <>
            <DialogButton onClick={exportPreset} className="dark:hover:gray-400 border-gray-700">
              {localize(lang, 'com_endpoint_export')}
            </DialogButton>
            <DialogClose
              onClick={submitPreset}
              className="dark:hover:gray-400 border-gray-700 bg-green-600 text-white hover:bg-green-700 dark:hover:bg-green-800"
            >
              {localize(lang, 'com_endpoint_save')}
            </DialogClose>
          </>
        }
      />
    </Dialog>
  );
};

export default EditPresetDialog;
