import { useRecoilState } from 'recoil';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import { cn, defaultTextProps, removeFocusOutlines, mapEndpoints } from '~/utils';
import { Input, Label, Dropdown, Dialog, DialogClose, DialogButton } from '~/components/';
import PopoverButtons from '~/components/Chat/Input/PopoverButtons';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { useSetIndexOptions, useLocalize, useDebouncedInput } from '~/hooks';
import { EndpointSettings } from '~/components/Endpoints';
import { useChatContext } from '~/Providers';
import store from '~/store';

const EditPresetDialog = ({
  exportPreset,
  submitPreset,
}: {
  exportPreset: () => void;
  submitPreset: () => void;
}) => {
  const localize = useLocalize();
  const { preset, setPreset } = useChatContext();
  const { setOption } = useSetIndexOptions(preset);
  const [onTitleChange, title] = useDebouncedInput({
    setOption,
    optionKey: 'title',
    initialValue: preset?.title,
  });
  const [presetModalVisible, setPresetModalVisible] = useRecoilState(store.presetModalVisible);

  const { data: availableEndpoints = [] } = useGetEndpointsQuery({
    select: mapEndpoints,
  });

  const { endpoint, endpointType, model } = preset || {};
  if (!endpoint) {
    return null;
  }

  return (
    <Dialog
      open={presetModalVisible}
      onOpenChange={(open) => {
        setPresetModalVisible(open);
        if (!open) {
          setPreset(null);
        }
      }}
    >
      <DialogTemplate
        title={`${localize('com_ui_edit') + ' ' + localize('com_endpoint_preset')} - ${
          preset?.title
        }`}
        className="h-full max-w-full overflow-y-auto pb-4 sm:w-[680px] sm:pb-0 md:h-[720px] md:w-[750px] md:overflow-y-hidden md:overflow-y-hidden lg:w-[950px] xl:h-[720px]"
        main={
          <div className="flex w-full flex-col items-center gap-2 md:h-[550px] md:overflow-y-auto">
            <div className="grid w-full">
              <div className="col-span-4 flex flex-col items-start justify-start gap-6 pb-4 md:flex-row">
                <div className="flex w-full flex-col">
                  <Label htmlFor="preset-name" className="mb-1 text-left text-sm font-medium">
                    {localize('com_endpoint_preset_name')}
                  </Label>
                  <Input
                    id="preset-name"
                    value={(title as string | undefined) ?? ''}
                    onChange={onTitleChange}
                    placeholder={localize('com_endpoint_set_custom_name')}
                    className={cn(
                      defaultTextProps,
                      'flex h-10 max-h-10 w-full resize-none px-3 py-2',
                      removeFocusOutlines,
                    )}
                  />
                </div>
                <div className="flex w-full flex-col">
                  <Label htmlFor="endpoint" className="mb-1 text-left text-sm font-medium">
                    {localize('com_endpoint')}
                  </Label>
                  <Dropdown
                    value={endpoint || ''}
                    onChange={(value) => setOption('endpoint')(value)}
                    options={availableEndpoints}
                  />
                </div>
              </div>
              <div className="col-span-2 flex items-start justify-between gap-4 sm:col-span-4">
                <div className="flex w-full flex-col">
                  <Label
                    htmlFor="endpoint"
                    className="mb-1 hidden text-left text-sm font-medium sm:block"
                  >
                    {'ㅤ'}
                  </Label>
                  <PopoverButtons
                    buttonClass="ml-0 w-full border border-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600 p-2 h-[40px] justify-center mt-0"
                    iconClass="hidden lg:block w-4 "
                    endpoint={endpoint}
                    endpointType={endpointType}
                    model={model}
                  />
                </div>
              </div>
            </div>
            <div className="my-4 w-full border-t border-gray-300 dark:border-gray-600" />
            <div className="w-full p-0">
              <EndpointSettings
                conversation={preset}
                setOption={setOption}
                isPreset={true}
                className="h-full md:mb-4 md:h-[440px]"
              />
            </div>
          </div>
        }
        buttons={
          <div className="mb-6 md:mb-2">
            <DialogButton
              onClick={exportPreset}
              className="border-gray-100 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-600"
            >
              {localize('com_endpoint_export')}
            </DialogButton>
            <DialogClose
              onClick={submitPreset}
              className="ml-2 bg-green-500 text-white hover:bg-green-600 dark:hover:bg-green-600"
            >
              {localize('com_ui_save')}
            </DialogClose>
          </div>
        }
        footerClassName="bg-white dark:bg-gray-700"
      />
    </Dialog>
  );
};

export default EditPresetDialog;
