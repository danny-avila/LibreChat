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

export type AlternativeModelType = 'fallback' | 'multimodal';

interface AlternativeModelPanelProps
  extends Pick<AgentModelPanelProps, 'models' | 'providers' | 'setActivePanel'> {
  /** The type of alternative model configuration */
  type: AlternativeModelType;
}

/**
 * A generic panel component for configuring alternative models (fallback or multimodal).
 * This component is used to configure a provider/model combination that will be used
 * instead of the primary model under certain conditions.
 */
export default function AlternativeModelPanel({
  type,
  providers,
  setActivePanel,
  models: modelsData,
}: AlternativeModelPanelProps) {
  const localize = useLocalize();
  const { control, setValue } = useFormContext<AgentForm>();

  // Determine configuration based on type
  const isFallback = type === 'fallback';
  const titleKey = isFallback ? 'com_agents_fallback_model' : 'com_agents_multimodal_model';
  const descriptionKey = isFallback
    ? 'com_agents_fallback_model_description'
    : 'com_agents_multimodal_model_description';
  const clearButtonKey = isFallback ? 'com_agents_fallback_clear' : 'com_agents_multimodal_clear';

  // Watch the config based on type - using conditional to maintain type safety
  const fallbackConfig = useWatch({ control, name: 'fallback_config' });
  const multimodalConfig = useWatch({ control, name: 'multimodal_config' });
  const config = isFallback ? fallbackConfig : multimodalConfig;

  const configModel = config?.model ?? null;
  const configProviderOption = config?.provider;
  const configModelParameters = config?.model_parameters ?? {};

  const configProvider = useMemo(() => {
    const value =
      typeof configProviderOption === 'string'
        ? configProviderOption
        : (configProviderOption as StringOption | undefined)?.value;
    return value ?? '';
  }, [configProviderOption]);

  const models = useMemo(
    () => (configProvider ? (modelsData[configProvider] ?? []) : []),
    [modelsData, configProvider],
  );

  useEffect(() => {
    const _model = configModel ?? '';

    if (configProvider && _model) {
      const modelExists = models.includes(_model);
      if (!modelExists) {
        const newModels = modelsData[configProvider] ?? [];
        if (isFallback) {
          setValue('fallback_config.model', newModels[0] ?? '');
        } else {
          setValue('multimodal_config.model', newModels[0] ?? '');
        }
      }
    }

    if (configProvider && !_model) {
      if (isFallback) {
        setValue('fallback_config.model', models[0] ?? '');
      } else {
        setValue('multimodal_config.model', models[0] ?? '');
      }
    }
  }, [configProvider, models, modelsData, setValue, configModel, isFallback]);

  const { data: endpointsConfig = {} } = useGetEndpointsQuery();

  const bedrockRegions = useMemo(() => {
    return endpointsConfig?.[configProvider]?.availableRegions ?? [];
  }, [endpointsConfig, configProvider]);

  const endpointType = useMemo(
    () => getEndpointField(endpointsConfig, configProvider, 'type'),
    [configProvider, endpointsConfig],
  );

  const parameters = useMemo((): SettingDefinition[] => {
    if (!configProvider) {
      return [];
    }
    const customParams = endpointsConfig[configProvider]?.customParams ?? {};
    const [combinedKey, endpointKey] = getSettingsKeys(
      endpointType ?? configProvider,
      configModel ?? '',
    );
    const overriddenEndpointKey = customParams.defaultParamsEndpoint ?? endpointKey;
    const defaultParams =
      agentParamSettings[combinedKey] ?? agentParamSettings[overriddenEndpointKey] ?? [];
    const overriddenParams =
      endpointsConfig[configProvider]?.customParams?.paramDefinitions ?? [];
    const overriddenParamsMap = keyBy(overriddenParams, 'key');
    return defaultParams
      .filter((param) => param != null)
      .map((param) => (overriddenParamsMap[param.key] as SettingDefinition) ?? param);
  }, [endpointType, endpointsConfig, configModel, configProvider]);

  const setOption = useCallback(
    (optionKey: keyof t.AgentModelParameters) => (value: t.AgentParameterValue) => {
      if (isFallback) {
        setValue(`fallback_config.model_parameters.${optionKey}`, value);
      } else {
        setValue(`multimodal_config.model_parameters.${optionKey}`, value);
      }
    },
    [setValue, isFallback],
  );

  const handleResetParameters = useCallback(() => {
    if (isFallback) {
      setValue('fallback_config.model_parameters', {} as t.AgentModelParameters);
    } else {
      setValue('multimodal_config.model_parameters', {} as t.AgentModelParameters);
    }
  }, [setValue, isFallback]);

  const handleClear = useCallback(() => {
    const emptyConfig = {
      provider: undefined,
      model: undefined,
      model_parameters: {},
    };
    if (isFallback) {
      setValue('fallback_config', emptyConfig);
    } else {
      setValue('multimodal_config', emptyConfig);
    }
  }, [setValue, isFallback]);

  // Field names for Controller components
  const providerFieldName = isFallback
    ? ('fallback_config.provider' as const)
    : ('multimodal_config.provider' as const);
  const modelFieldName = isFallback
    ? ('fallback_config.model' as const)
    : ('multimodal_config.model' as const);

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

        <div className="mb-2 mt-2 text-xl font-medium">{localize(titleKey)}</div>
        <p className="text-token-text-secondary text-sm">{localize(descriptionKey)}</p>
      </div>
      <div className="p-2">
        {/* Provider */}
        <div className="mb-4">
          <label
            id={`${type}-provider-label`}
            className="text-token-text-primary model-panel-label mb-2 block font-medium"
            htmlFor={`${type}-provider`}
          >
            {localize('com_ui_provider')}
          </label>
          <Controller
            name={providerFieldName}
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
        {/* Model */}
        <div className="model-panel-section mb-4">
          <label
            id={`${type}-model-label`}
            className={cn(
              'text-token-text-primary model-panel-label mb-2 block font-medium',
              !configProvider && 'text-gray-500 dark:text-gray-400',
            )}
            htmlFor={`${type}-model`}
          >
            {localize('com_ui_model')}
          </label>
          <Controller
            name={modelFieldName}
            control={control}
            render={({ field }) => {
              return (
                <ControlCombobox
                  selectedValue={field.value || ''}
                  selectPlaceholder={
                    configProvider
                      ? localize('com_ui_select_model')
                      : localize('com_ui_select_provider_first')
                  }
                  searchPlaceholder={localize('com_ui_select_model')}
                  setValue={field.onChange}
                  items={models.map((model) => ({
                    label: model,
                    value: model,
                  }))}
                  disabled={!configProvider}
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
                  conversation={configModelParameters as Partial<t.TConversation>}
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
          disabled={!configProvider}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {localize('com_ui_reset_var', { 0: localize('com_ui_model_parameters') })}
        </button>
        {/* Clear Button */}
        <button
          type="button"
          onClick={handleClear}
          className="btn btn-neutral flex flex-1 items-center justify-center gap-2 px-4 py-2 text-sm text-red-500 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {localize(clearButtonKey)}
        </button>
      </div>
    </div>
  );
}
