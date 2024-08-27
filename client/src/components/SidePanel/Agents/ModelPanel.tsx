import { useEffect, useMemo } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { ChevronLeft } from 'lucide-react';
import type { AgentForm, AgentModelPanelProps } from '~/common';
import { SelectDropDown, ModelParameters } from '~/components/ui';
import { cn, cardStyle } from '~/utils';
import { useLocalize } from '~/hooks';
import { Panel } from '~/common';

export default function ModelPanel({
  setActivePanel,
  providers,
  models: modelsData,
}: AgentModelPanelProps) {
  const localize = useLocalize();

  const { control, setValue, watch } = useFormContext<AgentForm>();
  const model = watch('model');
  const providerOption = watch('provider');

  const provider = useMemo(() => {
    if (!providerOption) {
      return '';
    }

    return typeof providerOption === 'string' ? providerOption : providerOption.value;
  }, [providerOption]);
  const models = useMemo(() => (provider ? modelsData[provider] : []), [modelsData, provider]);

  useEffect(() => {
    if (provider && model) {
      const modelExists = models.includes(model);
      if (!modelExists) {
        const newModels = modelsData[provider];
        setValue('model', newModels[0] ?? '');
      }
    }
  }, [provider, models, modelsData, setValue, model]);

  return (
    <div className="h-full overflow-auto px-2 pb-12 text-sm">
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

        <div className="mb-2 mt-2 text-xl font-medium">{localize('com_ui_model_settings')}</div>
      </div>
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
                placeholder={localize('com_ui_select_provider')}
                setValue={field.onChange}
                availableValues={providers}
                showAbove={false}
                showLabel={false}
                className={cn(
                  cardStyle,
                  'flex h-[40px] w-full flex-none items-center justify-center border-none px-4 hover:cursor-pointer',
                  !field.value && 'border-2 border-yellow-400',
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
      <div className="model-panel-section mb-6">
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
      <div className="mb-4">
        <Controller
          name="model_parameters.temperature"
          control={control}
          rules={{ required: false }}
          render={({ field }) => (
            <>
              <ModelParameters
                label="com_endpoint_temperature"
                ariaLabel="Temperature"
                min={-2}
                max={2}
                step={0.01}
                stepClick={0.01}
                initialValue={field.value ?? 1}
                onChange={field.onChange}
                showButtons={true}
                disabled={!provider}
              />
            </>
          )}
        />
      </div>
      <div className="mb-4">
        <Controller
          name="model_parameters.max_context_tokens"
          control={control}
          rules={{ required: false }}
          render={({ field }) => (
            <>
              <ModelParameters
                label="com_endpoint_max_output_tokens"
                ariaLabel="Max Context Tokens"
                min={0}
                max={4096}
                step={1}
                stepClick={1}
                initialValue={field.value ?? 0}
                onChange={field.onChange}
                showButtons={true}
                disabled={!provider}
              />
            </>
          )}
        />
      </div>
      <div className="mb-4">
        <Controller
          name="model_parameters.max_output_tokens"
          control={control}
          rules={{ required: false }}
          render={({ field }) => (
            <>
              <ModelParameters
                label="com_endpoint_context_tokens"
                ariaLabel="Max Context Tokens"
                min={0}
                max={4096}
                step={1}
                stepClick={1}
                initialValue={field.value ?? 0}
                onChange={field.onChange}
                showButtons={true}
                disabled={!provider}
              />
            </>
          )}
        />
      </div>
      <div className="mb-4">
        <Controller
          name="model_parameters.top_p"
          control={control}
          rules={{ required: false }}
          render={({ field }) => (
            <>
              <ModelParameters
                label="com_endpoint_top_p"
                ariaLabel="Top P"
                min={-2}
                max={2}
                step={0.01}
                stepClick={0.01}
                initialValue={field.value ?? 1}
                onChange={field.onChange}
                showButtons={true}
                disabled={!provider}
              />
            </>
          )}
        />
      </div>
      <div className="mb-4">
        <Controller
          name="model_parameters.frequency_penalty"
          control={control}
          rules={{ required: false }}
          render={({ field }) => (
            <>
              <ModelParameters
                label="com_endpoint_frequency_penalty"
                ariaLabel="Frequency Penalty"
                min={-2}
                max={2}
                step={0.01}
                stepClick={0.01}
                initialValue={field.value ?? 0}
                onChange={field.onChange}
                showButtons={true}
                disabled={!provider}
              />
            </>
          )}
        />
      </div>
      <div className="mb-4">
        <Controller
          name="model_parameters.presence_penalty"
          control={control}
          rules={{ required: false }}
          render={({ field }) => (
            <>
              <ModelParameters
                label="com_endpoint_presence_penalty"
                ariaLabel="Presence Penalty"
                min={-2}
                max={2}
                step={0.01}
                stepClick={0.01}
                initialValue={field.value ?? 0}
                onChange={field.onChange}
                showButtons={true}
                disabled={!provider}
              />
            </>
          )}
        />
      </div>
    </div>
  );
}
