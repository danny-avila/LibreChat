import React, { useMemo, useCallback } from 'react';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import { Controller, useWatch, useForm, FormProvider } from 'react-hook-form';
import {
  Tools,
  EModelEndpoint,
  isAssistantsEndpoint,
  defaultAgentFormValues,
} from 'librechat-data-provider';
import type { TConfig } from 'librechat-data-provider';
import type { AgentForm, AgentPanelProps, Option } from '~/common';
import { useCreateAgentMutation, useUpdateAgentMutation } from '~/data-provider';
import { useSelectAgent, useLocalize } from '~/hooks';
// import CapabilitiesForm from './CapabilitiesForm';
import { createProviderOption } from '~/utils';
import { useToastContext } from '~/Providers';
import AgentConfig from './AgentConfig';
import AgentSelect from './AgentSelect';
import ModelPanel from './ModelPanel';
import { Panel } from '~/common';

export default function AgentPanel({
  setAction,
  activePanel,
  actions = [],
  setActivePanel,
  agent_id: current_agent_id,
  setCurrentAgentId,
  agentsConfig,
  endpointsConfig,
}: AgentPanelProps & { agentsConfig?: TConfig | null }) {
  const { onSelect: onSelectAgent } = useSelectAgent();
  const { showToast } = useToastContext();
  const localize = useLocalize();

  const modelsQuery = useGetModelsQuery();
  const models = useMemo(() => modelsQuery.data ?? {}, [modelsQuery.data]);
  const methods = useForm<AgentForm>({
    defaultValues: defaultAgentFormValues,
  });

  const { control, handleSubmit, reset } = methods;
  const agent_id = useWatch({ control, name: 'id' });

  const providers = useMemo(
    () =>
      Object.keys(endpointsConfig ?? {})
        .filter(
          (key) =>
            !isAssistantsEndpoint(key) &&
            key !== EModelEndpoint.agents &&
            key !== EModelEndpoint.chatGPTBrowser &&
            key !== EModelEndpoint.gptPlugins &&
            key !== EModelEndpoint.bingAI,
        )
        .map((provider) => createProviderOption(provider)),
    [endpointsConfig],
  );

  /* Mutations */
  const update = useUpdateAgentMutation({
    onSuccess: (data) => {
      showToast({
        message: `${localize('com_assistants_update_success')} ${
          data.name ?? localize('com_ui_agent')
        }`,
      });
    },
    onError: (err) => {
      const error = err as Error;
      showToast({
        message: `${localize('com_agents_update_error')}${
          error.message ? ` ${localize('com_ui_error')}: ${error.message}` : ''
        }`,
        status: 'error',
      });
    },
  });

  const create = useCreateAgentMutation({
    onSuccess: (data) => {
      setCurrentAgentId(data.id);
      showToast({
        message: `${localize('com_assistants_create_success ')} ${
          data.name ?? localize('com_ui_agent')
        }`,
      });
    },
    onError: (err) => {
      const error = err as Error;
      showToast({
        message: `${localize('com_agents_create_error')}${
          error.message ? ` ${localize('com_ui_error')}: ${error.message}` : ''
        }`,
        status: 'error',
      });
    },
  });

  const onSubmit = useCallback(
    (data: AgentForm) => {
      const tools = data.tools ?? [];

      if (data.execute_code === true) {
        tools.push(Tools.execute_code);
      }
      if (data.retrieval === true) {
        tools.push(Tools.file_search);
      }

      const {
        name,
        model,
        model_parameters,
        provider: _provider,
        description,
        instructions,
      } = data;

      const provider = typeof _provider === 'string' ? _provider : (_provider as Option).value;

      if (agent_id) {
        update.mutate({
          agent_id,
          data: {
            name,
            description,
            instructions,
            model,
            tools,
            provider,
            model_parameters,
          },
        });
        return;
      }

      create.mutate({
        name,
        description,
        instructions,
        model,
        tools,
        provider,
        model_parameters,
      });
    },
    [agent_id, create, update],
  );

  const handleSelectAgent = useCallback(() => {
    if (agent_id) {
      onSelectAgent(agent_id);
    }
  }, [agent_id, onSelectAgent]);

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="scrollbar-gutter-stable h-auto w-full flex-shrink-0 overflow-x-hidden"
        aria-label="Agent configuration form"
      >
        <div className="flex w-full flex-wrap">
          <Controller
            name="agent"
            control={control}
            render={({ field }) => (
              <AgentSelect
                reset={reset}
                value={field.value}
                setCurrentAgentId={setCurrentAgentId}
                selectedAgentId={current_agent_id ?? null}
                createMutation={create}
              />
            )}
          />
          {/* Select Button */}
          {agent_id && (
            <button
              className="btn btn-primary focus:shadow-outline mx-2 mt-1 h-[40px] rounded bg-green-500 px-4 py-2 font-semibold text-white hover:bg-green-400 focus:border-green-500 focus:outline-none focus:ring-0"
              type="button"
              disabled={!agent_id}
              onClick={handleSelectAgent}
              aria-label="Select agent"
            >
              {localize('com_ui_select')}
            </button>
          )}
        </div>
        {activePanel === Panel.model ? (
          <ModelPanel setActivePanel={setActivePanel} providers={providers} models={models} />
        ) : null}
        {activePanel === Panel.builder ? (
          <AgentConfig
            actions={actions}
            setAction={setAction}
            agentsConfig={agentsConfig}
            setActivePanel={setActivePanel}
            endpointsConfig={endpointsConfig}
            setCurrentAgentId={setCurrentAgentId}
          />
        ) : null}
      </form>
    </FormProvider>
  );
}
