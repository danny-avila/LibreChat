import React, { useEffect, useMemo } from 'react';
import { Share2Icon } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { Permissions } from 'librechat-data-provider';
import type { TStartupConfig, AgentUpdateParams } from 'librechat-data-provider';
import {
  Button,
  Switch,
  OGDialog,
  OGDialogTitle,
  OGDialogClose,
  OGDialogContent,
  OGDialogTrigger,
} from '~/components/ui';
import { useUpdateAgentMutation, useGetStartupConfig } from '~/data-provider';
import { cn, removeFocusOutlines } from '~/utils';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';

type FormValues = {
  [Permissions.SHARED_GLOBAL]: boolean;
  [Permissions.UPDATE]: boolean;
};

export default function ShareAgent({
  agent_id = '',
  agentName,
  projectIds = [],
  isCollaborative = false,
}: {
  agent_id?: string;
  agentName?: string;
  projectIds?: string[];
  isCollaborative?: boolean;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: startupConfig = {} as TStartupConfig, isFetching } = useGetStartupConfig();
  const { instanceProjectId } = startupConfig;
  const agentIsGlobal = useMemo(
    () => !!projectIds.includes(instanceProjectId),
    [projectIds, instanceProjectId],
  );

  const {
    watch,
    control,
    setValue,
    getValues,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    mode: 'onChange',
    defaultValues: {
      [Permissions.SHARED_GLOBAL]: agentIsGlobal,
      [Permissions.UPDATE]: isCollaborative,
    },
  });

  const sharedGlobalValue = watch(Permissions.SHARED_GLOBAL);

  useEffect(() => {
    if (!sharedGlobalValue) {
      setValue(Permissions.UPDATE, false);
    }
  }, [sharedGlobalValue, setValue]);

  useEffect(() => {
    setValue(Permissions.SHARED_GLOBAL, agentIsGlobal);
    setValue(Permissions.UPDATE, isCollaborative);
  }, [agentIsGlobal, isCollaborative, setValue]);

  const updateAgent = useUpdateAgentMutation({
    onSuccess: (data) => {
      showToast({
        message: `${localize('com_assistants_update_success')} ${
          data.name ?? localize('com_ui_agent')
        }`,
        status: 'success',
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

  if (!agent_id || !instanceProjectId) {
    return null;
  }

  const onSubmit = (data: FormValues) => {
    if (!agent_id || !instanceProjectId) {
      return;
    }

    const payload = {} as AgentUpdateParams;

    if (data[Permissions.UPDATE] !== isCollaborative) {
      payload.isCollaborative = data[Permissions.UPDATE];
    }

    if (data[Permissions.SHARED_GLOBAL] !== agentIsGlobal) {
      if (data[Permissions.SHARED_GLOBAL]) {
        payload.projectIds = [startupConfig.instanceProjectId];
      } else {
        payload.removeProjectIds = [startupConfig.instanceProjectId];
        payload.isCollaborative = false;
      }
    }

    if (Object.keys(payload).length > 0) {
      updateAgent.mutate({
        agent_id,
        data: payload,
      });
    } else {
      showToast({
        message: localize('com_ui_no_changes'),
        status: 'info',
      });
    }
  };

  return (
    <OGDialog>
      <OGDialogTrigger asChild>
        <button
          className={cn(
            'btn btn-neutral border-token-border-light relative h-9 rounded-lg font-medium',
            removeFocusOutlines,
          )}
          aria-label={localize(
            'com_ui_share_var',
            { 0: agentName != null && agentName !== '' ? `"${agentName}"` : localize('com_ui_agent') },
          )}
          type="button"
        >
          <div className="flex items-center justify-center gap-2 text-blue-500">
            <Share2Icon className="icon-md h-4 w-4" />
          </div>
        </button>
      </OGDialogTrigger>
      <OGDialogContent className="w-11/12 md:max-w-xl">
        <OGDialogTitle>
          {localize(
            'com_ui_share_var',
            { 0:agentName != null && agentName !== '' ? `"${agentName}"` : localize('com_ui_agent') },
          )}
        </OGDialogTitle>
        <form
          className="p-2"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSubmit(onSubmit)(e);
          }}
        >
          <div className="flex items-center justify-between gap-2 py-2">
            <div className="flex items-center">
              <button
                type="button"
                className="mr-2 cursor-pointer"
                disabled={isFetching || updateAgent.isLoading || !instanceProjectId}
                onClick={() =>
                  setValue(Permissions.SHARED_GLOBAL, !getValues(Permissions.SHARED_GLOBAL), {
                    shouldDirty: true,
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setValue(Permissions.SHARED_GLOBAL, !getValues(Permissions.SHARED_GLOBAL), {
                      shouldDirty: true,
                    });
                  }
                }}
                aria-checked={getValues(Permissions.SHARED_GLOBAL)}
                role="checkbox"
              >
                {localize('com_ui_share_to_all_users')}
              </button>
              <label htmlFor={Permissions.SHARED_GLOBAL} className="select-none">
                {agentIsGlobal && (
                  <span className="ml-2 text-xs">{localize('com_ui_agent_shared_to_all')}</span>
                )}
              </label>
            </div>
            <Controller
              name={Permissions.SHARED_GLOBAL}
              control={control}
              disabled={isFetching || updateAgent.isLoading || !instanceProjectId}
              render={({ field }) => (
                <Switch
                  {...field}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  value={field.value.toString()}
                />
              )}
            />
          </div>
          <div className="mb-4 flex items-center justify-between gap-2 py-2">
            <div className="flex items-center">
              <button
                type="button"
                className="mr-2 cursor-pointer"
                disabled={
                  isFetching || updateAgent.isLoading || !instanceProjectId || !sharedGlobalValue
                }
                onClick={() =>
                  setValue(Permissions.UPDATE, !getValues(Permissions.UPDATE), {
                    shouldDirty: true,
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setValue(Permissions.UPDATE, !getValues(Permissions.UPDATE), {
                      shouldDirty: true,
                    });
                  }
                }}
                aria-checked={getValues(Permissions.UPDATE)}
                role="checkbox"
              >
                {localize('com_agents_allow_editing')}
              </button>
              {/* <label htmlFor={Permissions.UPDATE} className="select-none">
                {agentIsGlobal && (
                  <span className="ml-2 text-xs">{localize('com_ui_agent_editing_allowed')}</span>
                )}
              </label> */}
            </div>
            <Controller
              name={Permissions.UPDATE}
              control={control}
              disabled={
                isFetching || updateAgent.isLoading || !instanceProjectId || !sharedGlobalValue
              }
              render={({ field }) => (
                <Switch
                  {...field}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  value={field.value.toString()}
                />
              )}
            />
          </div>
          <div className="flex justify-end">
            <OGDialogClose asChild>
              <Button
                variant="submit"
                size="sm"
                type="submit"
                disabled={isSubmitting || isFetching}
              >
                {localize('com_ui_save')}
              </Button>
            </OGDialogClose>
          </div>
        </form>
      </OGDialogContent>
    </OGDialog>
  );
}
