import { useWatch, useFormContext } from 'react-hook-form';
import { SystemRoles, Permissions, PermissionTypes } from 'librechat-data-provider';
import type { AgentForm, AgentPanelProps } from '~/common';
import { useLocalize, useAuthContext, useHasAccess } from '~/hooks';
import { useUpdateAgentMutation } from '~/data-provider';
import AdvancedButton from './Advanced/AdvancedButton';
import DuplicateAgent from './DuplicateAgent';
import AdminSettings from './AdminSettings';
import DeleteButton from './DeleteButton';
import { Spinner } from '~/components';
import ShareAgent from './ShareAgent';
import { Panel } from '~/common';
import VersionButton from './Version/VersionButton';

export default function AgentFooter({
  activePanel,
  createMutation,
  updateMutation,
  setActivePanel,
  setCurrentAgentId,
}: Pick<
  AgentPanelProps,
  'setCurrentAgentId' | 'createMutation' | 'activePanel' | 'setActivePanel'
> & {
  updateMutation: ReturnType<typeof useUpdateAgentMutation>;
}) {
  const localize = useLocalize();
  const { user } = useAuthContext();

  const methods = useFormContext<AgentForm>();

  const { control } = methods;
  const agent = useWatch({ control, name: 'agent' });
  const agent_id = useWatch({ control, name: 'id' });

  const hasAccessToShareAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.SHARED_GLOBAL,
  });

  const renderSaveButton = () => {
    if (createMutation.isLoading || updateMutation.isLoading) {
      return <Spinner className="icon-md" aria-hidden="true" />;
    }

    if (agent_id) {
      return localize('com_ui_save');
    }

    return localize('com_ui_create');
  };

  const showButtons = activePanel === Panel.builder;

  return (
    <div className="mb-1 flex w-full flex-col gap-2">
      {showButtons && <AdvancedButton setActivePanel={setActivePanel} />}
      {showButtons && agent_id && <VersionButton setActivePanel={setActivePanel} />}
      {user?.role === SystemRoles.ADMIN && showButtons && <AdminSettings />}
      {/* Context Button */}
      <div className="flex items-center justify-end gap-2">
        <DeleteButton
          agent_id={agent_id}
          setCurrentAgentId={setCurrentAgentId}
          createMutation={createMutation}
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
          disabled={createMutation.isLoading || updateMutation.isLoading}
          aria-busy={createMutation.isLoading || updateMutation.isLoading}
        >
          {renderSaveButton()}
        </button>
      </div>
    </div>
  );
}
