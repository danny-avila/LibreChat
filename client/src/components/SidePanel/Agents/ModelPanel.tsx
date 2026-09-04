import React, { useMemo, useEffect } from 'react';
import keyBy from 'lodash/keyBy';
import { ChevronLeft, RotateCcw } from 'lucide-react';
import { Alert, Button, ControlCombobox } from '@librechat/client';
import { useFormContext, useWatch, Controller } from 'react-hook-form';
import {
  alternateName,
  getSettingsKeys,
  getEndpointField,
  LocalStorageKeys,
  resolveModelCatalogKey,
  SettingDefinition,
  agentParamSettings,
  applyModelAwareDefaults,
  normalizeEndpointName,
  resolveDropParamsUIKeys,
} from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import type { AgentForm, AgentModelPanelProps, StringOption } from '~/common';
import { componentMapping } from '~/components/SidePanel/Parameters/components';
import { useGetEndpointsQuery, useGetStartupConfig } from '~/data-provider';
import { useLiveAnnouncer } from '~/Providers';
import { useLocalize } from '~/hooks';
import { Panel } from '~/common';
import { cn } from '~/utils';

function getModelPlaceholderKey(modelsPending: boolean, provider: string) {
  if (modelsPending) {
    return 'com_ui_loading';
  }
  if (provider) {
    return 'com_ui_select_model';
  }
  return 'com_ui_select_provider_first';
}

export default function ModelPanel({
  providers,
  modelsError,
  setActivePanel,
  models: modelsData,
  modelsReady,
}: Pick<
  AgentModelPanelProps,
  'models' | 'modelsError' | 'modelsReady' | 'providers' | 'setActivePanel'
>) {
  const localize = useLocalize();
  const { announcePolite } = useLiveAnnouncer();

  const { control, setValue, getValues } = useFormContext<AgentForm>();

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
    () => (provider ? (modelsData[resolveModelCatalogKey(provider, modelsData)] ?? []) : []),
    [modelsData, provider],
  );
  const modelsPending = !modelsReady && !modelsError;
  const selectionDisabled = !modelsReady || modelsError;

  const { data: endpointsConfig = {} } = useGetEndpointsQuery();
  const { data: startupConfig } = useGetStartupConfig();

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
    const dropParamsMap = startupConfig?.endpointsDropParamsMap;
    const dropParamsEntry =
      dropParamsMap?.[provider] ?? dropParamsMap?.[normalizeEndpointName(provider)];
    const resolvedDropParams = Array.isArray(dropParamsEntry)
      ? dropParamsEntry
      : dropParamsEntry?.[model ?? ''];
    const dropParamsSet = resolveDropParamsUIKeys(
      Array.isArray(resolvedDropParams) ? resolvedDropParams : undefined,
      overriddenEndpointKey,
    );
    const defaultParams =
      agentParamSettings[combinedKey] ?? agentParamSettings[overriddenEndpointKey] ?? [];
    const overriddenParams = endpointsConfig[provider]?.customParams?.paramDefinitions ?? [];
    const overriddenParamsMap = keyBy(overriddenParams, 'key');
    const modelAwareParams = applyModelAwareDefaults(
      defaultParams.filter((param) => param != null && !dropParamsSet.has(param.key)),
      overriddenEndpointKey,
      model ?? '',
    );
    return modelAwareParams.map(
      (param) => (overriddenParamsMap[param.key] as SettingDefinition) ?? param,
    );
  }, [endpointType, endpointsConfig, model, provider, startupConfig]);

  /**
   * Prunes `model_parameters` entries that no longer have a visible control (e.g. a
   * parameter newly added to the endpoint's `dropParams`), mirroring the conversation
   * panel's pruning effect. Otherwise the stale value stays saved and silently reactivates
   * if the endpoint config later stops dropping it, with no control to inspect or clear it.
   */
  useEffect(() => {
    if (parameters.length === 0) {
      return;
    }

    const paramKeys = new Set(
      parameters.filter((setting) => setting != null).map((setting) => setting.key),
    );

    const currentParameters = getValues('model_parameters') ?? ({} as t.AgentModelParameters);
    const staleKeys = Object.keys(currentParameters).filter((key) => {
      if (paramKeys.has(key)) {
        return false;
      }
      return (currentParameters as Record<string, unknown>)[key] != null;
    });

    if (staleKeys.length === 0) {
      return;
    }

    const prunedParameters = { ...currentParameters } as Record<string, unknown>;
    staleKeys.forEach((key) => {
      delete prunedParameters[key];
    });

    setValue('model_parameters', prunedParameters as t.AgentModelParameters);
  }, [parameters, getValues, setValue]);

  const setOption = (optionKey: keyof t.AgentModelParameters) => (value: t.AgentParameterValue) => {
    setValue(`model_parameters.${optionKey}`, value);
  };

  const handleResetParameters = () => {
    setValue('model_parameters', {} as t.AgentModelParameters);
    announcePolite({ message: localize('com_ui_model_parameters_reset'), isStatus: true });
  };

  return (
    <div className="mb-1 flex w-full flex-col gap-3 text-sm">
      <header className="grid grid-cols-[auto_1fr_auto] items-center gap-2 pt-1">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setActivePanel(Panel.builder)}
          aria-label={localize('com_ui_back_to_builder')}
          className="h-10 w-10 flex-shrink-0 rounded-xl text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </Button>
        <h2 className="text-center text-base font-semibold text-text-primary">
          {localize('com_ui_model_parameters')}
        </h2>
        <span aria-hidden="true" className="h-10 w-10" />
      </header>
      <div>
        {/* Endpoint aka Provider for Agents */}
        <div className="mb-3" aria-busy={modelsPending}>
          <label
            id="provider-label"
            className={cn(
              'mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-secondary',
              modelsPending && 'opacity-60',
            )}
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
                    selectId="provider"
                    selectedValue={value}
                    displayValue={alternateName[display] ?? display}
                    selectPlaceholder={localize('com_ui_select_provider')}
                    searchPlaceholder={localize('com_ui_select_search_provider')}
                    setValue={(value) => {
                      if (value === provider) {
                        return;
                      }
                      const nextModel =
                        modelsData[resolveModelCatalogKey(value, modelsData)]?.[0] ?? '';
                      field.onChange(value);
                      setValue('model', nextModel);
                      localStorage.setItem(LocalStorageKeys.LAST_AGENT_PROVIDER, value);
                      if (nextModel) {
                        localStorage.setItem(LocalStorageKeys.LAST_AGENT_MODEL, nextModel);
                      } else {
                        localStorage.removeItem(LocalStorageKeys.LAST_AGENT_MODEL);
                      }
                    }}
                    items={providers.map((provider) => ({
                      label: typeof provider === 'string' ? provider : provider.label,
                      value: typeof provider === 'string' ? provider : provider.value,
                    }))}
                    className={cn(error ? 'border-2 border-red-500' : '')}
                    ariaLabel={localize('com_ui_provider')}
                    disabled={selectionDisabled}
                    isCollapsed={false}
                    showCarat={true}
                  />
                  {error && (
                    <span className="mt-1 text-xs text-red-500" role="alert">
                      {localize('com_ui_field_required')}
                    </span>
                  )}
                </>
              );
            }}
          />
        </div>
        {/* Model */}
        <div className="mb-3" aria-busy={modelsPending}>
          <label
            id="model-label"
            className={cn(
              'mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-secondary',
              (!provider || modelsPending) && 'opacity-60',
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
                    selectId="model"
                    selectedValue={field.value || ''}
                    selectPlaceholder={localize(getModelPlaceholderKey(modelsPending, provider))}
                    searchPlaceholder={localize('com_ui_select_model')}
                    setValue={(value) => {
                      field.onChange(value);
                      localStorage.setItem(LocalStorageKeys.LAST_AGENT_PROVIDER, provider);
                      if (value) {
                        localStorage.setItem(LocalStorageKeys.LAST_AGENT_MODEL, value);
                      } else {
                        localStorage.removeItem(LocalStorageKeys.LAST_AGENT_MODEL);
                      }
                    }}
                    items={models.map((model) => ({
                      label: model,
                      value: model,
                    }))}
                    disabled={!provider || selectionDisabled}
                    className={cn('disabled:opacity-50', error ? 'border-2 border-red-500' : '')}
                    ariaLabel={localize('com_ui_model')}
                    isCollapsed={false}
                    showCarat={true}
                  />
                  {provider && error && (
                    <span className="mt-1 text-xs text-red-500" role="alert">
                      {localize('com_ui_field_required')}
                    </span>
                  )}
                </>
              );
            }}
          />
          {modelsError && (
            <Alert variant="error" className="mt-1">
              {localize('com_error_models_not_loaded')}
            </Alert>
          )}
        </div>
      </div>
      {/* Model Parameters */}
      {parameters && (
        <div className="h-auto max-w-full">
          <div className="grid grid-cols-2 gap-3">
            {/* This is the parent element containing all settings */}
            {/* Below is an example of an applied dynamic setting, each be contained by a div with the column span specified */}
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
                  conversation={modelParameters as Partial<t.TConversation>}
                />
              );
            })}
          </div>
        </div>
      )}
      {/* Reset Parameters Button */}
      <Button
        variant="outline"
        onClick={handleResetParameters}
        className="mt-2 h-9 w-full rounded-xl px-4 font-medium text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
      >
        <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        {localize('com_ui_reset_var', { 0: localize('com_ui_model_parameters') })}
      </Button>
    </div>
  );
}
