import React, { useState, useEffect } from 'react';
import { Copy, CopyCheck } from 'lucide-react';
import {
  Label,
  Input,
  Button,
  Spinner,
  TrashIcon,
  useToastContext,
  OGDialog,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
  OGDialogTemplate,
} from '@librechat/client';
import {
  SystemRoles,
  Permissions,
  ResourceType,
  PermissionBits,
  PermissionTypes,
} from 'librechat-data-provider';
import { useAuthContext, useHasAccess, useResourcePermissions, MCPServerDefinition } from '~/hooks';
import { GenericGrantAccessDialog } from '~/components/Sharing';
import { useMCPServerForm } from './hooks/useMCPServerForm';
import { useLocalize, useCopyToClipboard } from '~/hooks';
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
  const { showToast } = useToastContext();

  // State for dialogs
  const [isCopying, setIsCopying] = useState(false);
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

  const copyLink = useCopyToClipboard({ text: redirectUri });

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
        <OGDialogContent showCloseButton={false} className="w-11/12 max-w-lg">
          <OGDialogHeader>
            <OGDialogTitle>{localize('com_ui_mcp_server_created')}</OGDialogTitle>
          </OGDialogHeader>
          <div className="space-y-4">
            <Label className="text-sm">{localize('com_ui_redirect_uri_instructions')}</Label>

            <div className="space-y-2">
              <Label className="text-sm font-medium">{localize('com_ui_redirect_uri')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  readOnly
                  value={redirectUri}
                  className="flex-1 text-text-secondary"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    if (isCopying) return;
                    showToast({ message: localize('com_ui_copied_to_clipboard') });
                    copyLink(setIsCopying);
                  }}
                  disabled={isCopying}
                  className="p-0"
                  aria-label={localize('com_ui_copy_link')}
                >
                  {isCopying ? <CopyCheck className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </div>
            <OGDialogHeader>
              <Button
                variant="default"
                onClick={() => {
                  setShowRedirectUriDialog(false);
                  onOpenChange(false);
                  setCreatedServerId(null);
                }}
              >
                {localize('com_ui_done')}
              </Button>
            </OGDialogHeader>
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
          showCloseButton={false}
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
              variant={isEditMode ? 'default' : 'submit'}
              onClick={onSubmit}
              disabled={isSubmitting}
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
