import React, { useMemo, useEffect } from 'react';
import { ChevronLeft, RotateCcw } from 'lucide-react';
import { getSettingsKeys } from 'librechat-data-provider';
import { useFormContext, useWatch, Controller } from 'react-hook-form';
import type * as t from 'librechat-data-provider';
import type { AgentForm, AgentModelPanelProps, StringOption } from '~/common';
import { componentMapping } from '~/components/SidePanel/Parameters/components';
import { agentSettings } from '~/components/SidePanel/Parameters/settings';
import { getEndpointField, cn, cardStyle } from '~/utils';
import { useGetEndpointsQuery } from '~/data-provider';
import { SelectDropDown } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { Panel } from '~/common';

export default function Parameters({
  setActivePanel,
  providers,
  models: modelsData,
}: AgentModelPanelProps) {
  const localize = useLocalize();

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
    () => (provider ? modelsData[provider] ?? [] : []),
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
    }

    if (provider && !_model) {
      setValue('model', models[0] ?? '');
    }
  }, [provider, models, modelsData, setValue, model]);

  const { data: endpointsConfig } = useGetEndpointsQuery();

  const bedrockRegions = useMemo(() => {
    return endpointsConfig?.[provider]?.availableRegions ?? [];
  }, [endpointsConfig, provider]);

  const endpointType = useMemo(
    () => getEndpointField(endpointsConfig, provider, 'type'),
    [provider, endpointsConfig],
  );

  const parameters = useMemo(() => {
    const [combinedKey, endpointKey] = getSettingsKeys(endpointType ?? provider, model ?? '');
    return agentSettings[combinedKey] ?? agentSettings[endpointKey];
  }, [endpointType, model, provider]);

  const setOption = (optionKey: keyof t.AgentModelParameters) => (value: t.AgentParameterValue) => {
    setValue(`model_parameters.${optionKey}`, value);
  };

  const handleResetParameters = () => {
    setValue('model_parameters', {} as t.AgentModelParameters);
  };

  return (
    <div className="scrollbar-gutter-stable h-full min-h-[50vh] overflow-auto pb-12 text-sm">
      <div className="model-panel relative flex flex-col items-center px-16 py-6 text-center">
        <div className="absolute left-0 top-6">
          <button
            type="button"
            className="btn btn-neutral relative"
            onClick={() => {
              setActivePanel(Panel.builder);
            }}
          >
            <div className="model-panel-content flex w-full items-center justify-center gap-2">
              <ChevronLeft />
            </div>
          </button>
        </div>

        <div className="mb-2 mt-2 text-xl font-medium">{localize('com_ui_model_parameters')}</div>
      </div>
      <div className="p-2">
        {/* Endpoint aka Provider for Agents */}
        <div className="mb-4">
          <label
            className="text-token-text-primary model-panel-label mb-2 block font-medium"
            htmlFor="provider"
          >
            {localize('com_ui_provider')} <span className="text-red-500">*</span>
          </label>
          <Controller
            name="provider"
            control={control}
            rules={{ required: true, minLength: 1 }}
            render={({ field, fieldState: { error } }) => (
              <>
                <SelectDropDown
                  emptyTitle={true}
                  value={field.value ?? ''}
                  title={localize('com_ui_provider')}
                  placeholder={localize('com_ui_select_provider')}
                  searchPlaceholder={localize('com_ui_select_search_provider')}
                  setValue={field.onChange}
                  availableValues={providers}
                  showAbove={false}
                  showLabel={false}
                  className={cn(
                    cardStyle,
                    'flex h-9 w-full flex-none items-center justify-center border-none px-4 hover:cursor-pointer',
                    (field.value === undefined || field.value === '') &&
                      'border-2 border-yellow-400',
                  )}
                  containerClassName={cn('rounded-md', error ? 'border-red-500 border-2' : '')}
                />
                {error && (
                  <span className="model-panel-error text-sm text-red-500 transition duration-300 ease-in-out">
                    {localize('com_ui_field_required')}
                  </span>
                )}
              </>
            )}
          />
        </div>
        {/* Model */}
        <div className="model-panel-section mb-4">
          <label
            className={cn(
              'text-token-text-primary model-panel-label mb-2 block font-medium',
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
            render={({ field, fieldState: { error } }) => (
              <>
                <SelectDropDown
                  emptyTitle={true}
                  placeholder={
                    provider
                      ? localize('com_ui_select_model')
                      : localize('com_ui_select_provider_first')
                  }
                  value={field.value}
                  setValue={field.onChange}
                  availableValues={models}
                  showAbove={false}
                  showLabel={false}
                  disabled={!provider}
                  className={cn(
                    cardStyle,
                    'flex h-[40px] w-full flex-none items-center justify-center border-none px-4',
                    !provider ? 'cursor-not-allowed bg-gray-200' : 'hover:cursor-pointer',
                  )}
                  containerClassName={cn('rounded-md', error ? 'border-red-500 border-2' : '')}
                />
                {provider && error && (
                  <span className="text-sm text-red-500 transition duration-300 ease-in-out">
                    {localize('com_ui_field_required')}
                  </span>
                )}
              </>
            )}
          />
        </div>
      </div>
      {/* Model Parameters */}
      {parameters && (
        <div className="h-auto max-w-full overflow-x-hidden p-2">
          <div className="grid grid-cols-4 gap-6">
            {' '}
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
          {/* Reset Parameters Button */}
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={handleResetParameters}
              className="btn btn-neutral flex w-full items-center justify-center gap-2 px-4 py-2 text-sm"
            >
              <RotateCcw className="h-4 w-4" />
              {localize('com_ui_reset_var', { 0: localize('com_ui_model_parameters') })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
