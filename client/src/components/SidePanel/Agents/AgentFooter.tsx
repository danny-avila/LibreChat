import { Spinner } from '@librechat/client';
import { useWatch, useFormContext } from 'react-hook-form';
import {
  SystemRoles,
  Permissions,
  ResourceType,
  PermissionBits,
  PermissionTypes,
} from 'librechat-data-provider';
import type { AgentForm, AgentPanelProps } from '~/common';
import { useLocalize, useAuthContext, useHasAccess, useResourcePermissions } from '~/hooks';
import { GenericGrantAccessDialog } from '~/components/Sharing';
import { useUpdateAgentMutation } from '~/data-provider';
import AdvancedButton from './Advanced/AdvancedButton';
import VersionButton from './Version/VersionButton';
import DuplicateAgent from './DuplicateAgent';
import AdminSettings from './AdminSettings';
import DeleteButton from './DeleteButton';
import { Panel } from '~/common';

export default function AgentFooter({
  activePanel,
  createMutation,
  updateMutation,
  setActivePanel,
  setCurrentAgentId,
  isAvatarUploading = false,
}: Pick<
  AgentPanelProps,
  'setCurrentAgentId' | 'createMutation' | 'activePanel' | 'setActivePanel'
> & {
  updateMutation: ReturnType<typeof useUpdateAgentMutation>;
  isAvatarUploading?: boolean;
}) {
  const localize = useLocalize();
  const { user } = useAuthContext();

  const methods = useFormContext<AgentForm>();

  const { control } = methods;
  const agent = useWatch({ control, name: 'agent' });
  const agent_id = useWatch({ control, name: 'id' });
  const hasAccessToShareAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.SHARE,
  });
  const { hasPermission, isLoading: permissionsLoading } = useResourcePermissions(
    ResourceType.AGENT,
    agent?._id || '',
  );

  const canShareThisAgent = hasPermission(PermissionBits.SHARE);
  const canDeleteThisAgent = hasPermission(PermissionBits.DELETE);
  const isSaving = createMutation.isLoading || updateMutation.isLoading || isAvatarUploading;
  const renderSaveButton = () => {
    if (isSaving) {
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
        {(agent?.author === user?.id || user?.role === SystemRoles.ADMIN || canDeleteThisAgent) &&
          !permissionsLoading && (
            <DeleteButton
              agent_id={agent_id}
              setCurrentAgentId={setCurrentAgentId}
              createMutation={createMutation}
            />
          )}
        {(agent?.author === user?.id || user?.role === SystemRoles.ADMIN || canShareThisAgent) &&
          hasAccessToShareAgents &&
          !permissionsLoading && (
            <GenericGrantAccessDialog
              resourceDbId={agent?._id}
              resourceId={agent_id}
              resourceName={agent?.name ?? ''}
              resourceType={ResourceType.AGENT}
            />
          )}
        {agent && agent.author === user?.id && <DuplicateAgent agent_id={agent_id} />}
        {/* Submit Button */}
        <button
          className="btn btn-primary focus:shadow-outline flex h-9 w-full items-center justify-center px-4 py-2 font-semibold text-white hover:bg-green-600 focus:border-green-500"
          type="submit"
          disabled={isSaving}
          aria-busy={isSaving}
        >
          {renderSaveButton()}
        </button>
      </div>
    </div>
  );
}
