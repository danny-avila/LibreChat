import { useCallback, useEffect, useMemo } from 'react';
import { useRecoilState } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, isAgentsEndpoint } from 'librechat-data-provider';
import {
  Input,
  Label,
  Button,
  OGDialog,
  OGDialogTitle,
  SelectDropDown,
  OGDialogContent,
} from '@librechat/client';
import type { TModelsConfig, TEndpointsConfig } from 'librechat-data-provider';
import {
  cn,
  defaultTextProps,
  removeFocusOutlines,
  mapEndpoints,
  getConvoSwitchLogic,
} from '~/utils';
import { useSetIndexOptions, useLocalize, useDebouncedInput } from '~/hooks';
import PopoverButtons from '~/components/Chat/Input/PopoverButtons';
import { EndpointSettings } from '~/components/Endpoints';
import { useGetEndpointsQuery } from '~/data-provider';
import { useChatContext } from '~/Providers';
import store from '~/store';

const EditPresetDialog = ({
  exportPreset,
  submitPreset,
  triggerRef,
}: {
  exportPreset: () => void;
  submitPreset: () => void;
  triggerRef?: React.RefObject<HTMLDivElement>;
}) => {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { preset, setPreset } = useChatContext();
  const { setOption, setOptions } = useSetIndexOptions(preset);
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
  }, [preset, queryClient, setOption]);

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

  const handleOpenChange = (open: boolean) => {
    setPresetModalVisible(open);
    if (!open) {
      setPreset(null);
    }
  };

  const { endpoint: _endpoint, endpointType, model } = preset || {};
  const endpoint = _endpoint ?? '';

  if (!endpoint) {
    return null;
  }

  if (isAgentsEndpoint(endpoint)) {
    return null;
  }

  return (
    <OGDialog open={presetModalVisible} onOpenChange={handleOpenChange} triggerRef={triggerRef}>
      <OGDialogContent className="h-[100dvh] max-h-[100dvh] w-full max-w-full overflow-y-auto bg-surface-dialog md:h-auto md:max-h-[90vh] md:max-w-[75vw] md:rounded-lg lg:max-w-[950px]">
        <OGDialogTitle>
          {localize('com_ui_edit_preset_title', { title: preset?.title })}
        </OGDialogTitle>

        <div className="flex w-full flex-col gap-2 px-1 pb-4 md:gap-4">
          {/* Header section with preset name and endpoint */}
          <div className="grid w-full gap-2 md:grid-cols-2 md:gap-4">
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

          {/* PopoverButtons section */}
          <div className="flex w-full">
            <PopoverButtons
              buttonClass="ml-0 w-full border border-border-medium p-2 h-[40px] justify-center mt-0"
              iconClass="hidden lg:block w-4"
              endpoint={endpoint}
              endpointType={endpointType}
              model={model}
            />
          </div>

          {/* Separator */}
          <div className="w-full border-t border-border-medium" />

          {/* Settings section */}
          <div className="w-full flex-1">
            <EndpointSettings
              conversation={preset}
              setOption={setOption}
              isPreset={true}
              className="text-text-primary"
            />
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2 border-t border-border-medium pt-2 md:pt-4">
            <Button variant="outline" onClick={exportPreset}>
              {localize('com_endpoint_export')}
            </Button>
            <Button variant="submit" onClick={submitPreset}>
              {localize('com_ui_save')}
            </Button>
          </div>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
};

export default EditPresetDialog;
