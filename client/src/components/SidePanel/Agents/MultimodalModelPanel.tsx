import React, { useMemo, useEffect, useCallback } from 'react';
import keyBy from 'lodash/keyBy';
import { ControlCombobox } from '@librechat/client';
import { ChevronLeft, RotateCcw, Trash2 } from 'lucide-react';
import { useFormContext, useWatch, Controller } from 'react-hook-form';
import { componentMapping } from '~/components/SidePanel/Parameters/components';
import {
  alternateName,
  getSettingsKeys,
  getEndpointField,
  SettingDefinition,
  agentParamSettings,
} from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import type { AgentForm, AgentModelPanelProps, StringOption } from '~/common';
import { useGetEndpointsQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { Panel } from '~/common';
import { cn } from '~/utils';

export default function MultimodalModelPanel({
  providers,
  setActivePanel,
  models: modelsData,
}: Pick<AgentModelPanelProps, 'models' | 'providers' | 'setActivePanel'>) {
  const localize = useLocalize();

  const { control, setValue } = useFormContext<AgentForm>();

  const multimodalConfig = useWatch({ control, name: 'multimodal_config' });
  const multimodalModel = multimodalConfig?.model ?? null;
  const multimodalProviderOption = multimodalConfig?.provider;
  const multimodalModelParameters = multimodalConfig?.model_parameters ?? {};

  const multimodalProvider = useMemo(() => {
    const value =
      typeof multimodalProviderOption === 'string'
        ? multimodalProviderOption
        : (multimodalProviderOption as StringOption | undefined)?.value;
    return value ?? '';
  }, [multimodalProviderOption]);

  const models = useMemo(
    () => (multimodalProvider ? (modelsData[multimodalProvider] ?? []) : []),
    [modelsData, multimodalProvider],
  );

  useEffect(() => {
    const _model = multimodalModel ?? '';
    if (multimodalProvider && _model) {
      const modelExists = models.includes(_model);
      if (!modelExists) {
        const newModels = modelsData[multimodalProvider] ?? [];
        setValue('multimodal_config.model', newModels[0] ?? '');
      }
    }

    if (multimodalProvider && !_model) {
      setValue('multimodal_config.model', models[0] ?? '');
    }
  }, [multimodalProvider, models, modelsData, setValue, multimodalModel]);

  const { data: endpointsConfig = {} } = useGetEndpointsQuery();

  const bedrockRegions = useMemo(() => {
    return endpointsConfig?.[multimodalProvider]?.availableRegions ?? [];
  }, [endpointsConfig, multimodalProvider]);

  const endpointType = useMemo(
    () => getEndpointField(endpointsConfig, multimodalProvider, 'type'),
    [multimodalProvider, endpointsConfig],
  );

  const parameters = useMemo((): SettingDefinition[] => {
    if (!multimodalProvider) {
      return [];
    }
    const customParams = endpointsConfig[multimodalProvider]?.customParams ?? {};
    const [combinedKey, endpointKey] = getSettingsKeys(
      endpointType ?? multimodalProvider,
      multimodalModel ?? '',
    );
    const overriddenEndpointKey = customParams.defaultParamsEndpoint ?? endpointKey;
    const defaultParams =
      agentParamSettings[combinedKey] ?? agentParamSettings[overriddenEndpointKey] ?? [];
    const overriddenParams =
      endpointsConfig[multimodalProvider]?.customParams?.paramDefinitions ?? [];
    const overriddenParamsMap = keyBy(overriddenParams, 'key');
    return defaultParams
      .filter((param) => param != null)
      .map((param) => (overriddenParamsMap[param.key] as SettingDefinition) ?? param);
  }, [endpointType, endpointsConfig, multimodalModel, multimodalProvider]);

  const setOption = (optionKey: keyof t.AgentModelParameters) => (value: t.AgentParameterValue) => {
    setValue(`multimodal_config.model_parameters.${optionKey}`, value);
  };

  const handleResetParameters = useCallback(() => {
    setValue('multimodal_config.model_parameters', {} as t.AgentModelParameters);
  }, [setValue]);

  const handleClearMultimodal = useCallback(() => {
    setValue('multimodal_config', {
      provider: undefined,
      model: undefined,
      model_parameters: {},
    });
  }, [setValue]);

  return (
    <div className="mx-1 mb-1 flex h-full min-h-[50vh] w-full flex-col gap-2 text-sm">
      <div className="model-panel relative flex flex-col items-center px-16 py-4 text-center">
        <div className="absolute left-0 top-4">
          <button
            type="button"
            className="btn btn-neutral relative"
            onClick={() => {
              setActivePanel(Panel.builder);
            }}
            aria-label={localize('com_ui_back_to_builder')}
          >
            <div className="model-panel-content flex w-full items-center justify-center gap-2">
              <ChevronLeft />
            </div>
          </button>
        </div>

        <div className="mb-2 mt-2 text-xl font-medium">
          {localize('com_agents_multimodal_model')}
        </div>
        <p className="text-token-text-secondary text-sm">
          {localize('com_agents_multimodal_model_description')}
        </p>
      </div>
      <div className="p-2">
        {/* Multimodal Provider */}
        <div className="mb-4">
          <label
            id="multimodal-provider-label"
            className="text-token-text-primary model-panel-label mb-2 block font-medium"
            htmlFor="multimodal-provider"
          >
            {localize('com_ui_provider')}
          </label>
          <Controller
            name="multimodal_config.provider"
            control={control}
            render={({ field }) => {
              const value =
                typeof field.value === 'string'
                  ? field.value
                  : ((field.value as StringOption)?.value ?? '');
              const display =
                typeof field.value === 'string'
                  ? field.value
                  : ((field.value as StringOption)?.label ?? '');

              return (
                <ControlCombobox
                  selectedValue={value}
                  displayValue={alternateName[display] ?? display}
                  selectPlaceholder={localize('com_ui_select_provider')}
                  searchPlaceholder={localize('com_ui_select_search_provider')}
                  setValue={field.onChange}
                  items={providers.map((provider) => ({
                    label: typeof provider === 'string' ? provider : provider.label,
                    value: typeof provider === 'string' ? provider : provider.value,
                  }))}
                  ariaLabel={localize('com_ui_provider')}
                  isCollapsed={false}
                  showCarat={true}
                />
              );
            }}
          />
        </div>
        {/* Multimodal Model */}
        <div className="model-panel-section mb-4">
          <label
            id="multimodal-model-label"
            className={cn(
              'text-token-text-primary model-panel-label mb-2 block font-medium',
              !multimodalProvider && 'text-gray-500 dark:text-gray-400',
            )}
            htmlFor="multimodal-model"
          >
            {localize('com_ui_model')}
          </label>
          <Controller
            name="multimodal_config.model"
            control={control}
            render={({ field }) => {
              return (
                <ControlCombobox
                  selectedValue={field.value || ''}
                  selectPlaceholder={
                    multimodalProvider
                      ? localize('com_ui_select_model')
                      : localize('com_ui_select_provider_first')
                  }
                  searchPlaceholder={localize('com_ui_select_model')}
                  setValue={field.onChange}
                  items={models.map((model) => ({
                    label: model,
                    value: model,
                  }))}
                  disabled={!multimodalProvider}
                  className={cn('disabled:opacity-50')}
                  ariaLabel={localize('com_ui_model')}
                  isCollapsed={false}
                  showCarat={true}
                />
              );
            }}
          />
        </div>
      </div>
      {/* Model Parameters */}
      {parameters.length > 0 && (
        <div className="h-auto max-w-full overflow-x-hidden p-2">
          <div className="grid grid-cols-2 gap-4">
            {parameters.map((setting) => {
              const Component = componentMapping[setting.component];
              if (!Component) {
                return null;
              }
              const { key, default: defaultValue, ...rest } = setting;

              if (key === 'region' && bedrockRegions.length) {
                rest.options = bedrockRegions;
              }

              return (
                <Component
                  key={key}
                  settingKey={key}
                  defaultValue={defaultValue}
                  {...rest}
                  setOption={setOption as t.TSetOption}
                  conversation={multimodalModelParameters as Partial<t.TConversation>}
                />
              );
            })}
          </div>
        </div>
      )}
      {/* Action Buttons */}
      <div className="flex gap-2 p-2">
        {/* Reset Parameters Button */}
        <button
          type="button"
          onClick={handleResetParameters}
          className="btn btn-neutral flex flex-1 items-center justify-center gap-2 px-4 py-2 text-sm"
          disabled={!multimodalProvider}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {localize('com_ui_reset_var', { 0: localize('com_ui_model_parameters') })}
        </button>
        {/* Clear Multimodal Button */}
        <button
          type="button"
          onClick={handleClearMultimodal}
          className="btn btn-neutral flex flex-1 items-center justify-center gap-2 px-4 py-2 text-sm text-red-500 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {localize('com_agents_multimodal_clear')}
        </button>
      </div>
    </div>
  );
}
