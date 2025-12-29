import React, { useState, useEffect } from 'react';
import {
  OGDialog,
  OGDialogTemplate,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  Button,
  TrashIcon,
  Spinner,
} from '@librechat/client';
import {
  SystemRoles,
  Permissions,
  ResourceType,
  PermissionBits,
  PermissionTypes,
} from 'librechat-data-provider';
import { GenericGrantAccessDialog } from '~/components/Sharing';
import { useAuthContext, useHasAccess, useResourcePermissions, MCPServerDefinition } from '~/hooks';
import { useLocalize } from '~/hooks';
import { useMCPServerForm } from './hooks/useMCPServerForm';
import MCPServerForm from './MCPServerForm';

interface MCPServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: React.ReactNode;
  triggerRef?: React.MutableRefObject<HTMLDivElement | HTMLButtonElement | null>;
  server?: MCPServerDefinition | null;
}

export default function MCPServerDialog({
  open,
  onOpenChange,
  children,
  triggerRef,
  server,
}: MCPServerDialogProps) {
  const localize = useLocalize();
  const { user } = useAuthContext();

  // State for dialogs
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRedirectUriDialog, setShowRedirectUriDialog] = useState(false);
  const [createdServerId, setCreatedServerId] = useState<string | null>(null);

  // Form hook
  const formHook = useMCPServerForm({
    server,
    onSuccess: (serverName, isOAuth) => {
      if (isOAuth) {
        setCreatedServerId(serverName);
        setShowRedirectUriDialog(true);
      } else {
        onOpenChange(false);
        setTimeout(() => {
          triggerRef?.current?.focus();
        }, 0);
      }
    },
    onClose: () => {
      onOpenChange(false);
      setTimeout(() => {
        triggerRef?.current?.focus();
      }, 0);
    },
  });

  const { isEditMode, isSubmitting, isDeleting, onSubmit, handleDelete, resetForm } = formHook;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open, resetForm]);

  // Permissions
  const hasAccessToShareMcpServers = useHasAccess({
    permissionType: PermissionTypes.MCP_SERVERS,
    permission: Permissions.SHARE,
  });

  const { hasPermission, isLoading: permissionsLoading } = useResourcePermissions(
    ResourceType.MCPSERVER,
    server?.dbId || '',
  );

  const canShareThisServer = hasPermission(PermissionBits.SHARE);

  const shouldShowShareButton =
    server &&
    (user?.role === SystemRoles.ADMIN || canShareThisServer) &&
    hasAccessToShareMcpServers &&
    !permissionsLoading;

  const redirectUri = createdServerId
    ? `${window.location.origin}/api/mcp/${createdServerId}/oauth/callback`
    : '';

  return (
    <>
      {/* Delete confirmation dialog */}
      <OGDialog open={showDeleteConfirm} onOpenChange={(isOpen) => setShowDeleteConfirm(isOpen)}>
        <OGDialogTemplate
          title={localize('com_ui_delete')}
          className="max-w-[450px]"
          main={<p className="text-left text-sm">{localize('com_ui_mcp_server_delete_confirm')}</p>}
          selection={{
            selectHandler: handleDelete,
            selectClasses:
              'bg-destructive text-white transition-all duration-200 hover:bg-destructive/80',
            selectText: isDeleting ? <Spinner /> : localize('com_ui_delete'),
          }}
        />
      </OGDialog>

      {/* Post-creation redirect URI dialog */}
      <OGDialog
        open={showRedirectUriDialog}
        onOpenChange={(isOpen) => {
          setShowRedirectUriDialog(isOpen);
          if (!isOpen) {
            onOpenChange(false);
            setCreatedServerId(null);
          }
        }}
      >
        <OGDialogContent className="w-full max-w-lg border-none bg-surface-primary text-text-primary">
          <OGDialogHeader className="border-b border-border-light px-4 py-3">
            <OGDialogTitle>{localize('com_ui_mcp_server_created')}</OGDialogTitle>
          </OGDialogHeader>
          <div className="space-y-4 p-4">
            <p className="text-sm text-text-secondary">
              {localize('com_ui_redirect_uri_instructions')}
            </p>
            <div className="rounded-lg border border-border-medium bg-surface-secondary p-3">
              <label className="mb-2 block text-xs font-medium text-text-secondary">
                {localize('com_ui_redirect_uri')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 rounded border border-border-medium bg-surface-primary px-3 py-2 text-sm"
                  value={redirectUri}
                  readOnly
                />
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(redirectUri);
                  }}
                  variant="outline"
                  className="whitespace-nowrap"
                >
                  {localize('com_ui_copy_link')}
                </Button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setShowRedirectUriDialog(false);
                  onOpenChange(false);
                  setCreatedServerId(null);
                }}
                variant="submit"
                className="text-white"
              >
                {localize('com_ui_done')}
              </Button>
            </div>
          </div>
        </OGDialogContent>
      </OGDialog>

      {/* Main Dialog */}
      <OGDialog open={open} onOpenChange={onOpenChange} triggerRef={triggerRef}>
        {children}
        <OGDialogTemplate
          title={
            isEditMode ? localize('com_ui_edit_mcp_server') : localize('com_ui_add_mcp_server')
          }
          description={
            isEditMode
              ? localize('com_ui_edit_mcp_server_dialog_description', {
                  serverName: server?.serverName || '',
                })
              : undefined
          }
          className="w-11/12 md:max-w-3xl"
          main={<MCPServerForm formHook={formHook} />}
          footerClassName="sm:justify-between"
          leftButtons={
            isEditMode ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={localize('com_ui_delete')}
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isSubmitting || isDeleting}
                >
                  <div className="flex w-full items-center justify-center gap-2 text-red-500">
                    <TrashIcon />
                  </div>
                </Button>
                {shouldShowShareButton && server && (
                  <GenericGrantAccessDialog
                    resourceDbId={server.dbId}
                    resourceName={server.config.title || ''}
                    resourceType={ResourceType.MCPSERVER}
                  />
                )}
              </div>
            ) : null
          }
          buttons={
            <Button
              type="button"
              variant="submit"
              onClick={onSubmit}
              disabled={isSubmitting}
              className="text-white"
            >
              {isSubmitting ? (
                <Spinner className="size-4" />
              ) : (
                localize(isEditMode ? 'com_ui_update' : 'com_ui_create')
              )}
            </Button>
          }
        />
      </OGDialog>
    </>
  );
}
