import { useRecoilState } from 'recoil';
import { useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, isAgentsEndpoint } from 'librechat-data-provider';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import type { TModelsConfig, TEndpointsConfig } from 'librechat-data-provider';
import {
  cn,
  defaultTextProps,
  removeFocusOutlines,
  mapEndpoints,
  getConvoSwitchLogic,
} from '~/utils';
import { Input, Label, SelectDropDown, Dialog, DialogClose, DialogButton } from '~/components';
import { useSetIndexOptions, useLocalize, useDebouncedInput } from '~/hooks';
import PopoverButtons from '~/components/Chat/Input/PopoverButtons';
import DialogTemplate from '~/components/ui/DialogTemplate';
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
  const queryClient = useQueryClient();
  const { preset, setPreset } = useChatContext();
  const { setOption, setOptions, setAgentOption } = useSetIndexOptions(preset);
  const [onTitleChange, title] = useDebouncedInput({
    setOption,
    optionKey: 'title',
    initialValue: preset?.title,
  });
  const [presetModalVisible, setPresetModalVisible] = useRecoilState(store.presetModalVisible);

  const { data: _endpoints = [] } = useGetEndpointsQuery({
    select: mapEndpoints,
  });

  const availableEndpoints = useMemo(() => {
    return _endpoints.filter((endpoint) => !isAgentsEndpoint(endpoint));
  }, [_endpoints]);

  useEffect(() => {
    if (!preset) {
      return;
    }

    if (isAgentsEndpoint(preset.endpoint)) {
      return;
    }

    const presetEndpoint = preset.endpoint ?? '';

    if (!presetEndpoint) {
      return;
    }

    const modelsConfig = queryClient.getQueryData<TModelsConfig>([QueryKeys.models]);
    if (!modelsConfig) {
      return;
    }

    const models = modelsConfig[presetEndpoint] as string[] | undefined;
    if (!models) {
      return;
    }
    if (!models.length) {
      return;
    }

    if (preset.model === models[0]) {
      return;
    }

    if (!models.includes(preset.model ?? '')) {
      console.log('setting model', models[0]);
      setOption('model')(models[0]);
    }

    if (preset.agentOptions?.model === models[0]) {
      return;
    }

    if (
      preset.agentOptions?.model != null &&
      preset.agentOptions.model &&
      !models.includes(preset.agentOptions.model)
    ) {
      console.log('setting agent model', models[0]);
      setAgentOption('model')(models[0]);
    }
  }, [preset, queryClient, setOption, setAgentOption]);

  const switchEndpoint = useCallback(
    (newEndpoint: string) => {
      if (!setOptions) {
        return console.warn('setOptions is not defined');
      }

      const { newEndpointType } = getConvoSwitchLogic({
        newEndpoint,
        modularChat: true,
        conversation: null,
        endpointsConfig: queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]) ?? {},
      });

      setOptions({
        endpoint: newEndpoint,
        endpointType: newEndpointType,
      });
    },
    [queryClient, setOptions],
  );

  const { endpoint: _endpoint, endpointType, model } = preset || {};
  const endpoint = _endpoint ?? '';
  if (!endpoint) {
    return null;
  } else if (isAgentsEndpoint(endpoint)) {
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
        className="h-full max-w-full overflow-y-auto pb-4 sm:w-[680px] sm:pb-0 md:h-[720px] md:w-[750px] md:overflow-y-hidden lg:w-[950px] xl:h-[720px]"
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
                  <SelectDropDown
                    value={endpoint || ''}
                    setValue={switchEndpoint}
                    showLabel={false}
                    emptyTitle={true}
                    searchPlaceholder={localize('com_endpoint_search')}
                    availableValues={availableEndpoints}
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
                    buttonClass="ml-0 w-full border border-border-medium p-2 h-[40px] justify-center mt-0"
                    iconClass="hidden lg:block w-4 "
                    endpoint={endpoint}
                    endpointType={endpointType}
                    model={model}
                  />
                </div>
              </div>
            </div>
            <div className="my-4 w-full border-t border-border-medium" />
            <div className="w-full p-0">
              <EndpointSettings
                conversation={preset}
                setOption={setOption}
                isPreset={true}
                className="h-full text-text-primary md:mb-4 md:h-[440px]"
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
