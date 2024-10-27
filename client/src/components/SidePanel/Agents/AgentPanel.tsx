import React, { useMemo, useCallback } from 'react';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import { Controller, useWatch, useForm, FormProvider } from 'react-hook-form';
import {
  Tools,
  SystemRoles,
  EModelEndpoint,
  isAssistantsEndpoint,
  defaultAgentFormValues,
} from 'librechat-data-provider';
import type { TConfig } from 'librechat-data-provider';
import type { AgentForm, AgentPanelProps, StringOption } from '~/common';
import {
  useCreateAgentMutation,
  useUpdateAgentMutation,
  useGetAgentByIdQuery,
} from '~/data-provider';
import { useSelectAgent, useLocalize, useAuthContext } from '~/hooks';
import AgentPanelSkeleton from './AgentPanelSkeleton';
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
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { showToast } = useToastContext();

  const { onSelect: onSelectAgent } = useSelectAgent();

  const modelsQuery = useGetModelsQuery();
  const agentQuery = useGetAgentByIdQuery(current_agent_id ?? '', {
    enabled: !!(current_agent_id ?? ''),
  });

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
        message: `${localize('com_assistants_create_success')} ${
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
      if (data.file_search === true) {
        tools.push(Tools.file_search);
      }

      const {
        name,
        description,
        instructions,
        model: _model,
        model_parameters,
        provider: _provider,
      } = data;

      const model = _model ?? '';
      const provider =
        (typeof _provider === 'string' ? _provider : (_provider as StringOption).value) ?? '';

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

      if (!provider || !model) {
        return showToast({
          message: localize('com_agents_missing_provider_model'),
          status: 'error',
        });
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
    [agent_id, create, update, showToast, localize],
  );

  const handleSelectAgent = useCallback(() => {
    if (agent_id) {
      onSelectAgent(agent_id);
    }
  }, [agent_id, onSelectAgent]);

  const canEditAgent = useMemo(() => {
    const canEdit =
      agentQuery.data?.isCollaborative ?? false
        ? true
        : agentQuery.data?.author === user?.id || user?.role === SystemRoles.ADMIN;

    return agentQuery.data?.id != null && agentQuery.data.id ? canEdit : true;
  }, [
    agentQuery.data?.isCollaborative,
    agentQuery.data?.author,
    agentQuery.data?.id,
    user?.id,
    user?.role,
  ]);

  if (agentQuery.isInitialLoading) {
    return <AgentPanelSkeleton />;
  }

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
                agentQuery={agentQuery}
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
        {!canEditAgent && (
          <div className="flex h-[30vh] w-full items-center justify-center">
            <div className="text-center">
              <h2 className="text-token-text-primary m-2 text-xl font-semibold">
                {localize('com_agents_not_available')}
              </h2>
              <p className="text-token-text-secondary">{localize('com_agents_no_access')}</p>
            </div>
          </div>
        )}
        {canEditAgent && activePanel === Panel.model && (
          <ModelPanel
            setActivePanel={setActivePanel}
            agent_id={agent_id}
            providers={providers}
            models={models}
          />
        )}
        {canEditAgent && activePanel === Panel.builder && (
          <AgentConfig
            actions={actions}
            setAction={setAction}
            agentsConfig={agentsConfig}
            setActivePanel={setActivePanel}
            endpointsConfig={endpointsConfig}
            setCurrentAgentId={setCurrentAgentId}
          />
        )}
      </form>
    </FormProvider>
  );
}
