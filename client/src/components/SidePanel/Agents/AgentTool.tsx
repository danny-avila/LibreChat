import React, { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import {
  OGDialog,
  TrashIcon,
  CircleHelpIcon,
  GearIcon,
  useToastContext,
  OGDialogTrigger,
  OGDialogTemplate,
} from '@librechat/client';
import type { TPlugin, TPluginAction } from 'librechat-data-provider';
import { SystemRoles, ResourceType, PermissionBits } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import { useLocalize, useAuthContext, useResourcePermissions } from '~/hooks';
import { cn } from '~/utils';
import PluginAuthForm from '~/components/Plugins/Store/PluginAuthForm';
import { useGetAgentByIdQuery, usePluginAuthValuesQuery } from '~/data-provider';

export default function AgentTool({
  tool,
  regularTools,
  agent_id,
}: {
  tool: string;
  regularTools?: TPlugin[];
  agent_id?: string;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { user } = useAuthContext();
  const updateUserPlugins = useUpdateUserPluginsMutation();
  const { getValues, setValue } = useFormContext<AgentForm>();
  const { data: agentData } = useGetAgentByIdQuery(agent_id);

  const [isFocused, setIsFocused] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  // Hooks must be called before any early returns
  const currentTool = regularTools?.find((t) => t.pluginKey === tool);
  const hasAuthConfig = currentTool?.authConfig && currentTool.authConfig.length > 0;

  const { data: authValuesData } = usePluginAuthValuesQuery(tool, {
    enabled: showEditDialog && !!hasAuthConfig && !!currentTool,
  });

  const { hasPermission: hasAgentPermission } = useResourcePermissions(
    ResourceType.AGENT,
    agentData?._id || agent_id || '',
  );

  if (!regularTools) {
    return null;
  }

  if (!currentTool) {
    return null;
  }

  const removeTool = (toolId: string) => {
    if (toolId) {
      updateUserPlugins.mutate(
        { pluginKey: toolId, action: 'uninstall', auth: {}, isEntityTool: true },
        {
          onError: (error: unknown) => {
            showToast({ message: `Error while deleting the tool: ${error}`, status: 'error' });
          },
          onSuccess: () => {
            const remainingToolIds = getValues('tools')?.filter((id: string) => id !== toolId);
            setValue('tools', remainingToolIds);
            showToast({ message: 'Tool deleted successfully', status: 'success' });
          },
        },
      );
    }
  };

  const canEdit = agent_id
    ? agentData?.author === user?.id ||
      user?.role === SystemRoles.ADMIN ||
      hasAgentPermission(PermissionBits.EDIT)
    : true; // Can edit when creating new agent

  const handleEditConfig = (pluginAction: TPluginAction) => {
    updateUserPlugins.mutate(pluginAction, {
      onError: (error: unknown) => {
        showToast({
          message: `Error while updating tool configuration: ${error}`,
          status: 'error',
        });
      },
      onSuccess: () => {
        setShowEditDialog(false);
        showToast({ message: 'Tool configuration updated successfully', status: 'success' });
      },
    });
  };

  return (
    <>
      <OGDialog>
        <div
          className="group relative flex w-full items-center gap-1 rounded-lg p-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50"
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          onFocus={() => setIsFocused(true)}
          onBlur={(e) => {
            // Check if focus is moving to a child element
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setIsFocused(false);
            }
          }}
        >
          <div className="flex grow items-center">
            {currentTool.icon && (
              <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full">
                <div
                  className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-center bg-no-repeat dark:bg-white/20"
                  style={{
                    backgroundImage: `url(${currentTool.icon})`,
                    backgroundSize: 'cover',
                  }}
                />
              </div>
            )}
            <div
              className="grow px-2 py-1.5"
              style={{ textOverflow: 'ellipsis', wordBreak: 'break-all', overflow: 'hidden' }}
            >
              {currentTool.name}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {canEdit && hasAuthConfig && (
              <OGDialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                <OGDialogTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded transition-all duration-200',
                      'hover:bg-gray-200 dark:hover:bg-gray-700',
                      'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                      'focus:opacity-100',
                      isHovering || isFocused ? 'opacity-100' : 'pointer-events-none opacity-0',
                    )}
                    aria-label={`Edit ${currentTool.name} configuration`}
                    tabIndex={0}
                    onFocus={() => setIsFocused(true)}
                  >
                    <GearIcon className="h-4 w-4" />
                  </button>
                </OGDialogTrigger>
                <OGDialogTemplate
                  showCloseButton={true}
                  title={`${localize('com_ui_edit')} ${currentTool.name}`}
                  className="max-w-[700px]"
                  onClose={() => setShowEditDialog(false)}
                  main={
                    <div className="p-4 sm:p-6 sm:pt-4">
                      <PluginAuthForm
                        plugin={currentTool}
                        onSubmit={handleEditConfig}
                        isEntityTool={true}
                        initialValues={authValuesData?.authValues || {}}
                      />
                    </div>
                  }
                />
              </OGDialog>
            )}
            <OGDialogTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded transition-all duration-200',
                  'hover:bg-gray-200 dark:hover:bg-gray-700',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                  'focus:opacity-100',
                  isHovering || isFocused ? 'opacity-100' : 'pointer-events-none opacity-0',
                )}
                aria-label={`Delete ${currentTool.name}`}
                tabIndex={0}
                onFocus={() => setIsFocused(true)}
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </OGDialogTrigger>
          </div>
        </div>
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_ui_delete_tool')}
          className="max-w-[450px]"
          main={
            <>
              <div className="flex w-full flex-col items-start gap-2 text-sm text-text-secondary">
                <p>
                  {localize('com_ui_delete_tool_confirm')}{' '}
                  <strong>&quot;{currentTool.name}&quot;</strong>?
                </p>
                {currentTool.description && (
                  <div className="flex items-start gap-2">
                    <CircleHelpIcon className="h-4 w-4 flex-shrink-0 text-text-secondary" />
                    <p className="text-sm">{currentTool.description}</p>
                  </div>
                )}
              </div>
            </>
          }
          selection={{
            selectHandler: () => removeTool(tool),
            selectClasses:
              'bg-red-700 hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-800 text-white',
            selectText: localize('com_ui_delete'),
          }}
        />
      </OGDialog>
    </>
  );
}
