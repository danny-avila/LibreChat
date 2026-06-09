/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import { Globe } from 'lucide-react';
import { Spinner } from '@librechat/client';
import { useWatch, useFormContext } from 'react-hook-form';
import {
  SystemRoles,
  Permissions,
  ResourceType,
  PermissionBits,
  PermissionTypes,
} from 'librechat-data-provider';
import { AgentForm, AgentPanelProps, isEphemeralAgent } from '~/common';
import {
  useLocalize,
  useAuthContext,
  useHasAccess,
  useResourcePermissions,
  useSelectAgent,
} from '~/hooks';
import { GenericGrantAccessDialog } from '~/components/Sharing';
import { useUpdateAgentMutation } from '~/data-provider';
import AdvancedButton from './Advanced/AdvancedButton';
import VersionButton from './Version/VersionButton';
import DuplicateAgent from './DuplicateAgent';
import AdminSettings from './AdminSettings';
import DeleteButton from './DeleteButton';
import { Panel } from '~/common';
import NewJerseyPanelButton from '~/nj/components/NewJerseyPanelButton';
import { useCallback } from 'react';

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
  const hasAccessToShareRemoteAgents = useHasAccess({
    permissionType: PermissionTypes.REMOTE_AGENTS,
    permission: Permissions.SHARE,
  });
  const { hasPermission, isLoading: permissionsLoading } = useResourcePermissions(
    ResourceType.AGENT,
    agent?._id || '',
  );
  const { hasPermission: hasRemoteAgentPermission, isLoading: remotePermissionsLoading } =
    useResourcePermissions(ResourceType.REMOTE_AGENT, agent?._id || '');

  const { onSelect: onSelectAgent } = useSelectAgent();
  const handleSelectAgent = useCallback(() => {
    if (agent_id) {
      onSelectAgent(agent_id);
    }
  }, [agent_id, onSelectAgent]);

  const canShareThisAgent = hasPermission(PermissionBits.SHARE);
  const canEditThisAgent = hasPermission(PermissionBits.EDIT);
  const canDeleteThisAgent = hasPermission(PermissionBits.DELETE);
  const canShareRemoteAgent = hasRemoteAgentPermission(PermissionBits.SHARE);
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

  /**
   * NJ: There are enough customizations that we simply return our own component lib
   *
   * Make sure to check that the LibreChat implementation hasn't drifted too far functionality-wise!
   */
  return (
    <div className="bg-surface-tertiary-alt">
      {/* Advanced settings */}
      {showButtons && (
        <div data-testid="advanced-button">
          <NewJerseyPanelButton label="Advanced settings" setActivePanel={setActivePanel} />
          <hr />
        </div>
      )}

      {/* Version history */}
      {showButtons && agent_id && (
        <div data-testid="version-button">
          <NewJerseyPanelButton label="Version history" setActivePanel={setActivePanel} />
          <hr />
        </div>
      )}

      {/* Admin settings (permissions & sharing) - we only let admins share agents atm */}
      {user?.role === SystemRoles.ADMIN && showButtons && (
        <div className="mt-4 flex gap-4 px-4">
          <GenericGrantAccessDialog
            resourceDbId={agent?._id}
            resourceId={agent_id}
            resourceName={agent?.name ?? ''}
            resourceType={ResourceType.AGENT}
          />

          <AdminSettings />
        </div>
      )}

      {showButtons && <hr className="my-4" />}

      {/* Create / save */}
      <div className="mb-4 px-4">
        <button
          type="submit"
          className="btn btn-primary w-full justify-center"
          disabled={isSaving}
          aria-busy={isSaving}
        >
          {renderSaveButton()}
        </button>
      </div>

      {/* Run agent */}
      {!isEphemeralAgent(agent_id) && (
        <div className="px-4 pb-4">
          <button
            className="btn btn-neutral w-full justify-center"
            onClick={(e) => {
              e.preventDefault();
              handleSelectAgent();
            }}
          >
            <span className="font-bold underline hover:decoration-2">Run agent</span>
          </button>
        </div>
      )}
    </div>
  );

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
        {(agent?.author === user?.id || user?.role === SystemRoles.ADMIN || canShareRemoteAgent) &&
          hasAccessToShareRemoteAgents &&
          !remotePermissionsLoading &&
          agent?._id && (
            <GenericGrantAccessDialog
              resourceDbId={agent?._id}
              resourceId={agent_id}
              resourceName={agent?.name ?? ''}
              resourceType={ResourceType.REMOTE_AGENT}
            >
              <button
                type="button"
                className="btn btn-neutral border-token-border-light h-9 px-3"
                title={localize('com_ui_remote_access')}
              >
                <Globe className="h-4 w-4" aria-hidden="true" />
              </button>
            </GenericGrantAccessDialog>
          )}
        {(agent?.author === user?.id || user?.role === SystemRoles.ADMIN || canEditThisAgent) &&
          !permissionsLoading && <DuplicateAgent agent_id={agent_id} />}
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
