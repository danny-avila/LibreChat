import React, { useMemo, useEffect } from 'react';
import keyBy from 'lodash/keyBy';
import {
  ControlCombobox,
  TooltipAnchor,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@librechat/client';
import { ChevronLeft, RotateCcw } from 'lucide-react';
import { useFormContext, useWatch, Controller } from 'react-hook-form';
import { componentMapping } from '~/components/SidePanel/Parameters/components';
import {
  getSettingsKeys,
  getEndpointField,
  LocalStorageKeys,
  SettingDefinition,
  agentParamSettings,
} from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import type { AgentForm, AgentModelPanelProps, StringOption } from '~/common';
import { useGetEndpointsQuery } from '~/data-provider';
import { useLiveAnnouncer } from '~/Providers';
import { useLocalize } from '~/hooks';
import type { TranslationKeys } from '~/hooks';
import { Panel } from '~/common';
import { cn, getEndpointAlternateName, getModelDisplayName } from '~/utils';

const ESSENTIAL_PARAM_KEYS = ['temperature', 'resendFiles', 'thinking', 'web_search'];

const LABEL_OVERRIDES: Record<string, TranslationKeys> = {
  temperature: 'com_endpoint_temperature_friendly',
};

const DESCRIPTION_OVERRIDES: Record<string, TranslationKeys> = {
  temperature: 'com_endpoint_temperature_friendly_desc',
  resendFiles: 'com_endpoint_resend_files_friendly_desc',
  thinking: 'com_endpoint_thinking_friendly_desc',
  web_search: 'com_endpoint_grounding_friendly_desc',
  maxContextTokens: 'com_endpoint_max_context_tokens_friendly_desc',
  maxOutputTokens: 'com_endpoint_max_output_tokens_friendly_desc',
  maxTokens: 'com_endpoint_max_output_tokens_friendly_desc',
  topP: 'com_endpoint_top_p_friendly_desc',
  top_p: 'com_endpoint_top_p_friendly_desc',
  topK: 'com_endpoint_top_k_friendly_desc',
  thinkingBudget: 'com_endpoint_thinking_budget_friendly_desc',
  thinkingLevel: 'com_endpoint_thinking_level_friendly_desc',
  fileTokenLimit: 'com_endpoint_file_token_limit_friendly_desc',
};

const applyOverrides = (setting: SettingDefinition): SettingDefinition => {
  const labelOverride = LABEL_OVERRIDES[setting.key];
  const descOverride = DESCRIPTION_OVERRIDES[setting.key];
  if (!labelOverride && !descOverride) {
    return setting;
  }
  return {
    ...setting,
    ...(labelOverride ? { label: labelOverride, labelCode: true } : {}),
    ...(descOverride ? { description: descOverride, descriptionCode: true } : {}),
  };
};

export default function ModelPanel({
  providers,
  setActivePanel,
  models: modelsData,
}: Pick<AgentModelPanelProps, 'models' | 'providers' | 'setActivePanel'>) {
  const localize = useLocalize();
  const { announcePolite } = useLiveAnnouncer();

  const { control, setValue } = useFormContext<AgentForm>();

  const model = useWatch({ control, name: 'model' });
  const providerOption = useWatch({ control, name: 'provider' });
  const modelParameters = useWatch({ control, name: 'model_parameters' });

  const provider = useMemo(() => {
    const value =
      typeof providerOption === 'string'
        ? providerOption
        : (providerOption as StringOption | undefined)?.value;
    return value ?? '';
  }, [providerOption]);
  const models = useMemo(
    () => (provider ? (modelsData[provider] ?? []) : []),
    [modelsData, provider],
  );

  useEffect(() => {
    const _model = model ?? '';
    if (provider && _model) {
      const modelExists = models.includes(_model);
      if (!modelExists) {
        const newModels = modelsData[provider] ?? [];
        setValue('model', newModels[0] ?? '');
      }
      localStorage.setItem(LocalStorageKeys.LAST_AGENT_MODEL, _model);
      localStorage.setItem(LocalStorageKeys.LAST_AGENT_PROVIDER, provider);
    }

    if (provider && !_model) {
      setValue('model', models[0] ?? '');
    }
  }, [provider, models, modelsData, setValue, model]);

  const { data: endpointsConfig = {} } = useGetEndpointsQuery();

  const bedrockRegions = useMemo(() => {
    return endpointsConfig?.[provider]?.availableRegions ?? [];
  }, [endpointsConfig, provider]);

  const endpointType = useMemo(
    () => getEndpointField(endpointsConfig, provider, 'type'),
    [provider, endpointsConfig],
  );

  const parameters = useMemo((): SettingDefinition[] => {
    const customParams = endpointsConfig[provider]?.customParams ?? {};
    const [combinedKey, endpointKey] = getSettingsKeys(endpointType ?? provider, model ?? '');
    const overriddenEndpointKey = customParams.defaultParamsEndpoint ?? endpointKey;
    const defaultParams =
      agentParamSettings[combinedKey] ?? agentParamSettings[overriddenEndpointKey] ?? [];
    const overriddenParams = endpointsConfig[provider]?.customParams?.paramDefinitions ?? [];
    const overriddenParamsMap = keyBy(overriddenParams, 'key');
    return defaultParams
      .filter((param) => param != null)
      .map((param) => (overriddenParamsMap[param.key] as SettingDefinition) ?? param);
  }, [endpointType, endpointsConfig, model, provider]);

  const { essentialParams, advancedParams } = useMemo(() => {
    const essentialByKey = new Map<string, SettingDefinition>();
    const advanced: SettingDefinition[] = [];
    for (const param of parameters) {
      if (ESSENTIAL_PARAM_KEYS.includes(param.key)) {
        essentialByKey.set(param.key, applyOverrides(param));
      } else {
        advanced.push(applyOverrides(param));
      }
    }
    const ordered = ESSENTIAL_PARAM_KEYS.map((k) => essentialByKey.get(k)).filter(
      (p): p is SettingDefinition => p != null,
    );
    return { essentialParams: ordered, advancedParams: advanced };
  }, [parameters]);

  const setOption = (optionKey: keyof t.AgentModelParameters) => (value: t.AgentParameterValue) => {
    setValue(`model_parameters.${optionKey}`, value);
  };

  const handleResetParameters = () => {
    setValue('model_parameters', {} as t.AgentModelParameters);
    announcePolite({ message: localize('com_ui_model_parameters_reset'), isStatus: true });
  };

  return (
    <div className="mb-1 flex w-full flex-col gap-2 text-sm">
      <div className="model-panel relative flex flex-col items-center px-16 pt-2 text-center">
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

        <div className="mb-2 mt-2 text-xl font-medium">{localize('com_ui_model_parameters')}</div>
      </div>
      <div>
        {/* Endpoint aka Provider for Agents */}
        <div className="mb-4">
          <label
            id="provider-label"
            className="text-token-text-primary model-panel-label mb-2 block text-sm font-medium"
            htmlFor="provider"
          >
            {localize('com_ui_provider')} <span className="text-red-500">*</span>
          </label>
          <Controller
            name="provider"
            control={control}
            rules={{ required: true, minLength: 1 }}
            render={({ field, fieldState: { error } }) => {
              const value =
                typeof field.value === 'string'
                  ? field.value
                  : ((field.value as StringOption)?.value ?? '');
              const display =
                typeof field.value === 'string'
                  ? field.value
                  : ((field.value as StringOption)?.label ?? '');

              return (
                <>
                  <ControlCombobox
                    selectedValue={value}
                    displayValue={getEndpointAlternateName(display, localize) ?? display}
                    selectPlaceholder={localize('com_ui_select_provider')}
                    searchPlaceholder={localize('com_ui_select_search_provider')}
                    setValue={field.onChange}
                    items={providers.map((provider) => ({
                      label: typeof provider === 'string' ? provider : provider.label,
                      value: typeof provider === 'string' ? provider : provider.value,
                    }))}
                    className={cn(error ? 'border-2 border-red-500' : '')}
                    ariaLabel={localize('com_ui_provider')}
                    isCollapsed={false}
                    showCarat={true}
                  />
                  {error && (
                    <span className="model-panel-error text-sm text-red-500 transition duration-300 ease-in-out">
                      {localize('com_ui_field_required')}
                    </span>
                  )}
                </>
              );
            }}
          />
        </div>
        {/* Model */}
        <div className="model-panel-section mb-4">
          <label
            id="model-label"
            className={cn(
              'text-token-text-primary model-panel-label mb-2 block text-sm font-medium',
              !provider && 'text-gray-500 dark:text-gray-400',
            )}
            htmlFor="model"
          >
            {localize('com_ui_model')} <span className="text-red-500">*</span>
          </label>
          <Controller
            name="model"
            control={control}
            rules={{ required: true, minLength: 1 }}
            render={({ field, fieldState: { error } }) => {
              return (
                <>
                  <ControlCombobox
                    selectedValue={field.value || ''}
                    displayValue={
                      field.value ? getModelDisplayName(field.value, localize).dropdownLabel : ''
                    }
                    selectPlaceholder={
                      provider
                        ? localize('com_ui_select_model')
                        : localize('com_ui_select_provider_first')
                    }
                    searchPlaceholder={localize('com_ui_select_model')}
                    setValue={field.onChange}
                    items={models.map((model) => ({
                      label: getModelDisplayName(model, localize).dropdownLabel,
                      value: model,
                    }))}
                    disabled={!provider}
                    className={cn('disabled:opacity-50', error ? 'border-2 border-red-500' : '')}
                    ariaLabel={localize('com_ui_model')}
                    isCollapsed={false}
                    showCarat={true}
                  />
                  {provider && error && (
                    <span className="text-sm text-red-500 transition duration-300 ease-in-out">
                      {localize('com_ui_field_required')}
                    </span>
                  )}
                </>
              );
            }}
          />
        </div>
      </div>
      {/* Essential Model Parameters */}
      {essentialParams.length > 0 && (
        <div className="h-auto max-w-full">
          <div className="grid grid-cols-2 gap-4">
            {essentialParams.map((setting) => {
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
                  conversation={modelParameters as Partial<t.TConversation>}
                />
              );
            })}
          </div>
        </div>
      )}
      {/* Advanced Settings — collapsed by default */}
      {advancedParams.length > 0 && (
        <Accordion type="single" collapsible className="mt-2 w-full">
          <AccordionItem value="advanced-settings" className="border-b-0">
            <AccordionTrigger className="text-sm font-medium text-text-primary hover:no-underline">
              {localize('com_ui_advanced_settings')}
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-2 gap-4 pt-2">
                {advancedParams.map((setting) => {
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
                      conversation={modelParameters as Partial<t.TConversation>}
                    />
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
      {/* Reset Parameters Button */}
      <TooltipAnchor
        description={localize('com_ui_reset_model_params_desc')}
        role="button"
        tabIndex={0}
        onClick={handleResetParameters}
        className="btn btn-neutral my-1 flex w-full items-center justify-center gap-2 px-4 py-2 text-sm"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {localize('com_ui_reset_var', { 0: localize('com_ui_model_parameters') })}
      </TooltipAnchor>
    </div>
  );
}
