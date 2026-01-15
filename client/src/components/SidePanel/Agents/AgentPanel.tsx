import { Plus } from 'lucide-react';
import React, { useMemo, useCallback, useRef, useState } from 'react';
import { Button, useToastContext } from '@librechat/client';
import { useWatch, useForm, FormProvider, type FieldNamesMarkedBoolean } from 'react-hook-form';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import {
  Tools,
  SystemRoles,
  ResourceType,
  EModelEndpoint,
  PermissionBits,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import type { AgentForm, StringOption } from '~/common';
import type { Agent } from 'librechat-data-provider';
import {
  useCreateAgentMutation,
  useUpdateAgentMutation,
  useGetAgentByIdQuery,
  useGetExpandedAgentByIdQuery,
  useUploadAgentAvatarMutation,
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

/* Helpers */
function getUpdateToastMessage(
  noVersionChange: boolean,
  avatarActionState: AgentForm['avatar_action'],
  name: string | undefined,
  localize: (key: string, vars?: Record<string, unknown> | Array<string | number>) => string,
): string | null {
  // If only avatar upload is pending (separate endpoint), suppress the no-changes toast.
  if (noVersionChange && avatarActionState === 'upload') {
    return null;
  }
  if (noVersionChange) {
    return localize('com_ui_no_changes');
  }
  return localize('com_assistants_update_success_name', { name: name ?? localize('com_ui_agent') });
}

/**
 * Normalizes the payload sent to the agent update/create endpoints.
 * Handles avatar reset requests for persistent agents independently of avatar uploads.
 * @param {AgentForm} data - Form data from the agent configuration form.
 * @param {string | null} [agent_id] - Agent identifier, if the agent already exists.
 * @returns {{ payload: Partial<AgentForm>; provider: string; model: string }} Payload metadata.
 */
export function composeAgentUpdatePayload(data: AgentForm, agent_id?: string | null) {
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

  const shouldResetAvatar =
    avatarActionState === 'reset' && Boolean(agent_id) && !isEphemeralAgent(agent_id);
  const model = _model ?? '';
  const provider =
    (typeof _provider === 'string' ? _provider : (_provider as StringOption).value) ?? '';

  return {
    payload: {
      name,
      artifacts,
      description,
      instructions,
      model,
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
    provider,
    model,
  } as const;
}

type UploadAvatarFn = (variables: { agent_id: string; formData: FormData }) => Promise<Agent>;

export interface PersistAvatarChangesParams {
  agentId?: string | null;
  avatarActionState: AgentForm['avatar_action'];
  avatarFile?: File | null;
  uploadAvatar: UploadAvatarFn;
}

/**
 * Uploads a new avatar when the form indicates an avatar upload is pending.
 * The helper ensures we only attempt uploads for persisted agents and when
 * the avatar action is explicitly set to "upload".
 * @returns {Promise<boolean>} Resolves true if an upload occurred, false otherwise.
 */
export async function persistAvatarChanges({
  agentId,
  avatarActionState,
  avatarFile,
  uploadAvatar,
}: PersistAvatarChangesParams): Promise<boolean> {
  if (!agentId || isEphemeralAgent(agentId)) {
    return false;
  }

  if (avatarActionState !== 'upload' || !avatarFile) {
    return false;
  }

  const formData = new FormData();
  formData.append('file', avatarFile, avatarFile.name);

  await uploadAvatar({
    agent_id: agentId,
    formData,
  });

  return true;
}

const AVATAR_ONLY_DIRTY_FIELDS = new Set(['avatar_action', 'avatar_file', 'avatar_preview']);
const IGNORED_DIRTY_FIELDS = new Set(['agent']);

const isNestedDirtyField = (
  value: FieldNamesMarkedBoolean<AgentForm>[keyof AgentForm],
): value is FieldNamesMarkedBoolean<AgentForm> => typeof value === 'object' && value !== null;

const evaluateDirtyFields = (
  fields: FieldNamesMarkedBoolean<AgentForm>,
): { sawDirty: boolean; onlyAvatarDirty: boolean } => {
  let sawDirty = false;

  for (const [key, value] of Object.entries(fields)) {
    if (!value) {
      continue;
    }

    if (IGNORED_DIRTY_FIELDS.has(key)) {
      continue;
    }

    if (isNestedDirtyField(value)) {
      const nested = evaluateDirtyFields(value);
      if (!nested.onlyAvatarDirty) {
        return { sawDirty: true, onlyAvatarDirty: false };
      }
      sawDirty = sawDirty || nested.sawDirty;
      continue;
    }

    sawDirty = true;

    if (AVATAR_ONLY_DIRTY_FIELDS.has(key)) {
      continue;
    }

    return { sawDirty: true, onlyAvatarDirty: false };
  }

  return { sawDirty, onlyAvatarDirty: true };
};

/**
 * Determines whether the dirty form state only contains avatar uploads/resets.
 * This enables short-circuiting the general agent update flow when only the avatar
 * needs to be uploaded.
 */
export const isAvatarUploadOnlyDirty = (
  dirtyFields?: FieldNamesMarkedBoolean<AgentForm>,
): boolean => {
  if (!dirtyFields) {
    return false;
  }

  const result = evaluateDirtyFields(dirtyFields);
  return result.sawDirty && result.onlyAvatarDirty;
};

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

  const modelsQuery = useGetModelsQuery({ refetchOnMount: 'always' });
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

  const {
    control,
    handleSubmit,
    reset,
    getValues,
    setValue,
    formState: { dirtyFields },
  } = methods;
  const [isAvatarUploadInFlight, setIsAvatarUploadInFlight] = useState(false);
  const uploadAvatarMutation = useUploadAgentAvatarMutation({
    onSuccess: (updatedAgent) => {
      showToast({ message: localize('com_ui_upload_agent_avatar') });

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

  const handleAvatarUpload = useCallback(
    async (agentId?: string | null) => {
      const avatarActionState = getValues('avatar_action');
      const avatarFile = getValues('avatar_file');
      if (!agentId || isEphemeralAgent(agentId) || avatarActionState !== 'upload' || !avatarFile) {
        return false;
      }

      setIsAvatarUploadInFlight(true);
      try {
        return await persistAvatarChanges({
          agentId,
          avatarActionState,
          avatarFile,
          uploadAvatar: uploadAvatarMutation.mutateAsync,
        });
      } catch (error) {
        console.error('[AgentPanel] Avatar upload failed', error);
        throw error;
      } finally {
        setIsAvatarUploadInFlight(false);
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
            key !== EModelEndpoint.agents,
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
      const avatarActionState = getValues('avatar_action');
      const noVersionChange =
        previousVersionRef.current !== undefined && data.version === previousVersionRef.current;
      const toastMessage = getUpdateToastMessage(
        noVersionChange,
        avatarActionState,
        data.name,
        localize,
      );
      if (toastMessage) {
        showToast({ message: toastMessage, status: noVersionChange ? 'info' : undefined });
      }

      const agentOption = getValues('agent');
      if (agentOption && typeof agentOption !== 'string') {
        setValue('agent', { ...agentOption, ...data }, { shouldDirty: false });
      }

      try {
        await handleAvatarUpload(data.id ?? agent_id);
      } catch (error) {
        console.error('[AgentPanel] Avatar upload failed after update', error);
        showToast({
          message: localize('com_agents_avatar_upload_error'),
          status: 'error',
        });
      }

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

      try {
        await handleAvatarUpload(data.id);
      } catch (error) {
        console.error('[AgentPanel] Avatar upload failed after create', error);
        showToast({
          message: localize('com_agents_avatar_upload_error'),
          status: 'error',
        });
      }
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
    async (data: AgentForm) => {
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

      const { payload: basePayload, provider, model } = composeAgentUpdatePayload(data, agent_id);

      if (agent_id) {
        if (data.avatar_action === 'upload' && isAvatarUploadOnlyDirty(dirtyFields)) {
          try {
            const uploaded = await handleAvatarUpload(agent_id);
            if (!uploaded) {
              showToast({
                message: localize('com_agents_avatar_upload_error'),
                status: 'error',
              });
            }
          } catch (error) {
            console.error('[AgentPanel] Avatar upload failed for avatar-only submission', error);
            showToast({
              message: localize('com_agents_avatar_upload_error'),
              status: 'error',
            });
          }
          return;
        }
        update.mutate({ agent_id, data: { ...basePayload, tools } });
        return;
      }

      if (!provider || !model) {
        return showToast({
          message: localize('com_agents_missing_provider_model'),
          status: 'error',
        });
      }
      if (!data.name) {
        return showToast({
          message: localize('com_agents_missing_name'),
          status: 'error',
        });
      }

      create.mutate({ ...basePayload, model, tools, provider });
    },
    [agent_id, create, dirtyFields, handleAvatarUpload, update, showToast, localize],
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
        className="scrollbar-gutter-stable h-auto w-full flex-shrink-0 overflow-y-hidden overflow-x-visible"
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
                aria-label={localize('com_ui_create_new_agent')}
              >
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                {localize('com_ui_create_new_agent')}
              </Button>
              <Button
                variant="submit"
                disabled={isEphemeralAgent(agent_id) || agentQuery.isInitialLoading}
                onClick={(e) => {
                  e.preventDefault();
                  handleSelectAgent();
                }}
                aria-label={localize('com_ui_select_agent')}
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
            isAvatarUploading={isAvatarUploadInFlight || uploadAvatarMutation.isPending}
            activePanel={activePanel}
            setActivePanel={setActivePanel}
            setCurrentAgentId={setCurrentAgentId}
          />
        )}
      </form>
    </FormProvider>
  );
}
