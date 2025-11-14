import { Plus } from 'lucide-react';
import React, { useMemo, useCallback, useRef } from 'react';
import { Button, useToastContext } from '@librechat/client';
import { useWatch, useForm, FormProvider } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import {
  Tools,
  SystemRoles,
  ResourceType,
  EModelEndpoint,
  PermissionBits,
  isAssistantsEndpoint,
  QueryKeys,
} from 'librechat-data-provider';
import type { AgentForm, StringOption } from '~/common';
import type { Agent, AgentListResponse } from 'librechat-data-provider';
import {
  useCreateAgentMutation,
  useUpdateAgentMutation,
  useGetAgentByIdQuery,
  useGetExpandedAgentByIdQuery,
  useUploadAgentAvatarMutation,
  allAgentViewAndEditQueryKeys,
  invalidateAgentMarketplaceQueries,
} from '~/data-provider';
import { createProviderOption, getDefaultAgentFormValues } from '~/utils';
import { useResourcePermissions } from '~/hooks/useResourcePermissions';
import { useSelectAgent, useLocalize, useAuthContext } from '~/hooks';
import { useAgentPanelContext } from '~/Providers/AgentPanelContext';
import AgentPanelSkeleton from './AgentPanelSkeleton';
import AdvancedPanel from './Advanced/AdvancedPanel';
import { Panel, isEphemeralAgent } from '~/common';
import AgentConfig from './AgentConfig';
import AgentSelect from './AgentSelect';
import AgentFooter from './AgentFooter';
import ModelPanel from './ModelPanel';

export default function AgentPanel() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const {
    activePanel,
    agentsConfig,
    setActivePanel,
    endpointsConfig,
    setCurrentAgentId,
    agent_id: current_agent_id,
  } = useAgentPanelContext();

  const { onSelect: onSelectAgent } = useSelectAgent();

  const modelsQuery = useGetModelsQuery();
  const basicAgentQuery = useGetAgentByIdQuery(current_agent_id);

  const { hasPermission, isLoading: permissionsLoading } = useResourcePermissions(
    ResourceType.AGENT,
    basicAgentQuery.data?._id || '',
  );

  const canEdit = hasPermission(PermissionBits.EDIT);

  const expandedAgentQuery = useGetExpandedAgentByIdQuery(current_agent_id ?? '', {
    enabled: !isEphemeralAgent(current_agent_id) && canEdit && !permissionsLoading,
  });

  const agentQuery = canEdit && expandedAgentQuery.data ? expandedAgentQuery : basicAgentQuery;

  const models = useMemo(() => modelsQuery.data ?? {}, [modelsQuery.data]);
  const methods = useForm<AgentForm>({
    defaultValues: getDefaultAgentFormValues(),
    mode: 'onChange',
  });

  const queryClient = useQueryClient();

  const { control, handleSubmit, reset, getValues, setValue } = methods;
  const uploadAvatarMutation = useUploadAgentAvatarMutation({
    onSuccess: (updatedAgent, variables) => {
      showToast({ message: localize('com_ui_upload_agent_avatar') });

      ((keys) => {
        keys.forEach((key) => {
          const listRes = queryClient.getQueryData<AgentListResponse>([QueryKeys.agents, key]);

          if (!listRes?.data) {
            return;
          }

          const agents = listRes.data.map((agent) => {
            if (agent.id === variables.agent_id) {
              return updatedAgent;
            }
            return agent;
          });

          queryClient.setQueryData<AgentListResponse>([QueryKeys.agents, key], {
            ...listRes,
            data: agents,
          });
        });
      })(allAgentViewAndEditQueryKeys);

      queryClient.setQueryData<Agent>([QueryKeys.agent, variables.agent_id], updatedAgent);
      queryClient.setQueryData<Agent>(
        [QueryKeys.agent, variables.agent_id, 'expanded'],
        updatedAgent,
      );
      invalidateAgentMarketplaceQueries(queryClient);

      setValue('avatar_preview', updatedAgent.avatar?.filepath ?? '', { shouldDirty: false });
      setValue('avatar_file', null, { shouldDirty: false });
      setValue('avatar_action', null, { shouldDirty: false });

      const agentOption = getValues('agent');
      if (agentOption && typeof agentOption !== 'string') {
        setValue('agent', { ...agentOption, ...updatedAgent }, { shouldDirty: false });
      }
    },
    onError: () => {
      showToast({ message: localize('com_ui_upload_error'), status: 'error' });
    },
  });

  const persistAvatarChanges = useCallback(
    async (agentId?: string | null) => {
      if (!agentId || isEphemeralAgent(agentId)) {
        return;
      }

      const avatarActionState = getValues('avatar_action');
      if (avatarActionState !== 'upload') {
        return;
      }

      const avatarFile = getValues('avatar_file');
      if (!avatarFile) {
        return;
      }

      const formData = new FormData();
      formData.append('file', avatarFile, avatarFile.name);

      try {
        await uploadAvatarMutation.mutateAsync({
          agent_id: agentId,
          formData,
        });
      } catch (_error) {
        // Upload errors are surfaced via mutation callbacks.
      }
    },
    [getValues, uploadAvatarMutation],
  );
  const agent_id = useWatch({ control, name: 'id' });
  const previousVersionRef = useRef<number | undefined>();

  const allowedProviders = useMemo(
    () => new Set(agentsConfig?.allowedProviders),
    [agentsConfig?.allowedProviders],
  );

  const providers = useMemo(
    () =>
      Object.keys(endpointsConfig ?? {})
        .filter(
          (key) =>
            !isAssistantsEndpoint(key) &&
            (allowedProviders.size > 0 ? allowedProviders.has(key) : true) &&
            key !== EModelEndpoint.agents &&
            key !== EModelEndpoint.chatGPTBrowser &&
            key !== EModelEndpoint.gptPlugins,
        )
        .map((provider) => createProviderOption(provider)),
    [endpointsConfig, allowedProviders],
  );

  /* Mutations */
  const update = useUpdateAgentMutation({
    onMutate: () => {
      // Store the current version before mutation
      previousVersionRef.current = agentQuery.data?.version;
    },
    onSuccess: async (data) => {
      // Check if agent version is the same (no changes were made)
      if (previousVersionRef.current !== undefined && data.version === previousVersionRef.current) {
        showToast({
          message: localize('com_ui_no_changes'),
          status: 'info',
        });
      } else {
        showToast({
          message: `${localize('com_assistants_update_success')} ${
            data.name ?? localize('com_ui_agent')
          }`,
        });
      }

      const agentOption = getValues('agent');
      if (agentOption && typeof agentOption !== 'string') {
        setValue('agent', { ...agentOption, ...data }, { shouldDirty: false });
      }

      const avatarActionState = getValues('avatar_action');
      await persistAvatarChanges(data.id ?? agent_id);

      if (avatarActionState === 'reset') {
        setValue('avatar_action', null, { shouldDirty: false });
        setValue('avatar_file', null, { shouldDirty: false });
        setValue('avatar_preview', '', { shouldDirty: false });
      }

      // Clear the ref after use
      previousVersionRef.current = undefined;
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
    onSuccess: async (data) => {
      setCurrentAgentId(data.id);
      showToast({
        message: `${localize('com_assistants_create_success')} ${
          data.name ?? localize('com_ui_agent')
        }`,
      });

      await persistAvatarChanges(data.id);
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
      if (data.web_search === true) {
        tools.push(Tools.web_search);
      }

      const {
        name,
        artifacts,
        description,
        instructions,
        model: _model,
        model_parameters,
        provider: _provider,
        agent_ids,
        edges,
        end_after_tools,
        hide_sequential_outputs,
        recursion_limit,
        category,
        support_contact,
        avatar_action: avatarActionState,
      } = data;

      const shouldResetAvatar = avatarActionState === 'reset' && Boolean(agent_id);

      const model = _model ?? '';
      const provider =
        (typeof _provider === 'string' ? _provider : (_provider as StringOption).value) ?? '';

      if (agent_id) {
        update.mutate({
          agent_id,
          data: {
            name,
            artifacts,
            description,
            instructions,
            model,
            tools,
            provider,
            model_parameters,
            agent_ids,
            edges,
            end_after_tools,
            hide_sequential_outputs,
            recursion_limit,
            category,
            support_contact,
            ...(shouldResetAvatar ? { avatar: null } : {}),
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
      if (!name) {
        return showToast({
          message: localize('com_agents_missing_name'),
          status: 'error',
        });
      }

      create.mutate({
        name,
        artifacts,
        description,
        instructions,
        model,
        tools,
        provider,
        model_parameters,
        agent_ids,
        edges,
        end_after_tools,
        hide_sequential_outputs,
        recursion_limit,
        category,
        support_contact,
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
    if (!agentQuery.data?.id) {
      return true;
    }

    if (user?.role === SystemRoles.ADMIN) {
      return true;
    }

    return canEdit;
  }, [agentQuery.data?.id, user?.role, canEdit]);

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="scrollbar-gutter-stable h-auto w-full flex-shrink-0 overflow-x-hidden"
        aria-label="Agent configuration form"
      >
        <div className="mx-1 mt-2 flex w-full flex-wrap gap-2">
          <div className="w-full">
            <AgentSelect
              createMutation={create}
              agentQuery={agentQuery}
              setCurrentAgentId={setCurrentAgentId}
              // The following is required to force re-render the component when the form's agent ID changes
              // Also maintains ComboBox Focus for Accessibility
              selectedAgentId={agentQuery.isInitialLoading ? null : (current_agent_id ?? null)}
            />
          </div>
          {/* Create + Select Button */}
          {agent_id && (
            <div className="flex w-full gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center"
                onClick={() => {
                  reset(getDefaultAgentFormValues());
                  setCurrentAgentId(undefined);
                }}
                disabled={agentQuery.isInitialLoading}
                aria-label={
                  localize('com_ui_create') +
                  ' ' +
                  localize('com_ui_new') +
                  ' ' +
                  localize('com_ui_agent')
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                {localize('com_ui_create') +
                  ' ' +
                  localize('com_ui_new') +
                  ' ' +
                  localize('com_ui_agent')}
              </Button>
              <Button
                variant="submit"
                disabled={isEphemeralAgent(agent_id) || agentQuery.isInitialLoading}
                onClick={(e) => {
                  e.preventDefault();
                  handleSelectAgent();
                }}
                aria-label={localize('com_ui_select') + ' ' + localize('com_ui_agent')}
              >
                {localize('com_ui_select')}
              </Button>
            </div>
          )}
        </div>
        {agentQuery.isInitialLoading && <AgentPanelSkeleton />}
        {!canEditAgent && !agentQuery.isInitialLoading && (
          <div className="flex h-[30vh] w-full items-center justify-center">
            <div className="text-center">
              <h2 className="text-token-text-primary m-2 text-xl font-semibold">
                {localize('com_agents_not_available')}
              </h2>
              <p className="text-token-text-secondary">{localize('com_agents_no_access')}</p>
            </div>
          </div>
        )}
        {canEditAgent && !agentQuery.isInitialLoading && activePanel === Panel.model && (
          <ModelPanel models={models} providers={providers} setActivePanel={setActivePanel} />
        )}
        {canEditAgent && !agentQuery.isInitialLoading && activePanel === Panel.builder && (
          <AgentConfig />
        )}
        {canEditAgent && !agentQuery.isInitialLoading && activePanel === Panel.advanced && (
          <AdvancedPanel />
        )}
        {canEditAgent && !agentQuery.isInitialLoading && (
          <AgentFooter
            createMutation={create}
            updateMutation={update}
            activePanel={activePanel}
            setActivePanel={setActivePanel}
            setCurrentAgentId={setCurrentAgentId}
          />
        )}
      </form>
    </FormProvider>
  );
}
