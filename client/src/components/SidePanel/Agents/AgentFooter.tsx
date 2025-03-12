import React from 'react';
import { useWatch, useFormContext } from 'react-hook-form';
import { SystemRoles, Permissions, PermissionTypes } from 'librechat-data-provider';
import type { AgentForm, AgentPanelProps } from '~/common';
import { useCreateAgentMutation, useUpdateAgentMutation } from '~/data-provider';
import { useLocalize, useAuthContext, useHasAccess } from '~/hooks';
import AdvancedSettings from './AdvancedSettings';
import { useToastContext } from '~/Providers';
import DuplicateAgent from './DuplicateAgent';
import AdminSettings from './AdminSettings';
import DeleteButton from './DeleteButton';
import { Spinner } from '~/components';
import ShareAgent from './ShareAgent';

export default function AgentFooter({
  setCurrentAgentId,
}: Pick<AgentPanelProps, 'setCurrentAgentId'>) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { showToast } = useToastContext();

  const methods = useFormContext<AgentForm>();

  const { control } = methods;
  const agent = useWatch({ control, name: 'agent' });
  const agent_id = useWatch({ control, name: 'id' });

  const hasAccessToShareAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.SHARED_GLOBAL,
  });

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

  const renderSaveButton = () => {
    if (create.isLoading || update.isLoading) {
      return <Spinner className="icon-md" aria-hidden="true" />;
    }

    if (agent_id) {
      return localize('com_ui_save');
    }

    return localize('com_ui_create');
  };

  return (
    <div className="mx-1 mb-1 flex w-full flex-col">
      <AdvancedSettings />
      {user?.role === SystemRoles.ADMIN && <AdminSettings />}
      {/* Context Button */}
      <div className="flex items-center justify-end gap-2">
        <DeleteButton
          agent_id={agent_id}
          setCurrentAgentId={setCurrentAgentId}
          createMutation={create}
        />
        {(agent?.author === user?.id || user?.role === SystemRoles.ADMIN) &&
          hasAccessToShareAgents && (
          <ShareAgent
            agent_id={agent_id}
            agentName={agent?.name ?? ''}
            projectIds={agent?.projectIds ?? []}
            isCollaborative={agent?.isCollaborative}
          />
        )}
        {agent && agent.author === user?.id && <DuplicateAgent agent_id={agent_id} />}
        {/* Submit Button */}
        <button
          className="btn btn-primary focus:shadow-outline flex h-9 w-full items-center justify-center px-4 py-2 font-semibold text-white hover:bg-green-600 focus:border-green-500"
          type="submit"
          disabled={create.isLoading || update.isLoading}
          aria-busy={create.isLoading || update.isLoading}
        >
          {renderSaveButton()}
        </button>
      </div>
    </div>
  );
}
