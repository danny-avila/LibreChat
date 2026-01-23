import React, { useState } from 'react';
import {
  useGetAgentApiKeysQuery,
  useCreateAgentApiKeyMutation,
  useDeleteAgentApiKeyMutation,
} from 'librechat-data-provider/react-query';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import { Plus, Trash2, Copy, CopyCheck, Key, Eye, EyeOff, ShieldEllipsis } from 'lucide-react';
import {
  Button,
  Input,
  Label,
  Spinner,
  OGDialog,
  OGDialogClose,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
  OGDialogTrigger,
  useToastContext,
} from '@librechat/client';
import type { PermissionConfig } from '~/components/ui';
import { useUpdateRemoteAgentsPermissionsMutation } from '~/data-provider';
import { useLocalize, useCopyToClipboard } from '~/hooks';
import { AdminSettingsDialog } from '~/components/ui';

function CreateKeyDialog({ onKeyCreated }: { onKeyCreated?: () => void }) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const createMutation = useCreateAgentApiKeyMutation();
  const copyKey = useCopyToClipboard({ text: newKey || '' });

  const handleCreate = async () => {
    if (!name.trim()) {
      showToast({ message: localize('com_ui_api_key_name_required'), status: 'error' });
      return;
    }

    try {
      const result = await createMutation.mutateAsync({ name: name.trim() });
      setNewKey(result.key);
      showToast({ message: localize('com_ui_api_key_created'), status: 'success' });
      onKeyCreated?.();
    } catch {
      showToast({ message: localize('com_ui_api_key_create_error'), status: 'error' });
    }
  };

  const handleClose = () => {
    setName('');
    setNewKey(null);
    setShowKey(false);
    setOpen(false);
  };

  const handleCopy = () => {
    if (isCopying) {
      return;
    }
    copyKey(setIsCopying);
    showToast({ message: localize('com_ui_api_key_copied'), status: 'success' });
  };

  return (
    <OGDialog open={open} onOpenChange={setOpen}>
      <OGDialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          {localize('com_ui_create_api_key')}
        </Button>
      </OGDialogTrigger>
      <OGDialogContent className="max-w-md">
        <OGDialogTitle>{localize('com_ui_create_api_key')}</OGDialogTitle>
        <div className="space-y-4 py-4">
          {!newKey ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="key-name">{localize('com_ui_api_key_name')}</Label>
                <Input
                  id="key-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={localize('com_ui_api_key_name_placeholder')}
                />
              </div>
              <div className="flex justify-end gap-2">
                <OGDialogClose asChild>
                  <Button variant="outline" onClick={handleClose}>
                    {localize('com_ui_cancel')}
                  </Button>
                </OGDialogClose>
                <Button onClick={handleCreate} disabled={createMutation.isLoading}>
                  {createMutation.isLoading ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    localize('com_ui_create')
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-lg border border-yellow-500/50 bg-yellow-50 p-4 dark:bg-yellow-900/20">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  {localize('com_ui_api_key_warning')}
                </p>
              </div>
              <div className="space-y-2">
                <Label>{localize('com_ui_your_api_key')}</Label>
                <div className="flex gap-2">
                  <Input
                    value={showKey ? newKey : '•'.repeat(newKey.length)}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowKey(!showKey)}
                    title={showKey ? localize('com_ui_hide') : localize('com_ui_show')}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopy}
                    disabled={isCopying}
                    title={localize('com_ui_copy')}
                  >
                    {isCopying ? <CopyCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleClose}>{localize('com_ui_done')}</Button>
              </div>
            </>
          )}
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}

function KeyItem({
  id,
  name,
  keyPrefix,
  createdAt,
  lastUsedAt,
}: {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt?: string;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteMutation = useDeleteAgentApiKeyMutation();

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id);
      showToast({ message: localize('com_ui_api_key_deleted'), status: 'success' });
    } catch {
      showToast({ message: localize('com_ui_api_key_delete_error'), status: 'error' });
    }
    setConfirmDelete(false);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="flex items-center justify-between rounded-lg border border-border-light p-3">
      <div className="flex items-center gap-3">
        <Key className="h-5 w-5 text-text-secondary" />
        <div>
          <div className="font-medium">{name}</div>
          <div className="text-sm text-text-secondary">
            <span className="font-mono">{keyPrefix}...</span>
            <span className="mx-2">•</span>
            <span>
              {localize('com_ui_created')} {formatDate(createdAt)}
            </span>
            {lastUsedAt && (
              <>
                <span className="mx-2">•</span>
                <span>
                  {localize('com_ui_last_used')} {formatDate(lastUsedAt)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      <div>
        {confirmDelete ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
              {localize('com_ui_cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isLoading}
            >
              {deleteMutation.isLoading ? (
                <Spinner className="h-4 w-4" />
              ) : (
                localize('com_ui_delete')
              )}
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setConfirmDelete(true)}
            title={localize('com_ui_delete')}
          >
            <Trash2 className="h-4 w-4 text-text-secondary hover:text-red-500" />
          </Button>
        )}
      </div>
    </div>
  );
}

function ApiKeysContent({ isOpen }: { isOpen: boolean }) {
  const localize = useLocalize();
  const { data, isLoading, error } = useGetAgentApiKeysQuery({ enabled: isOpen });

  if (error) {
    return <div className="text-sm text-red-500">{localize('com_ui_api_keys_load_error')}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <RemoteAgentsAdminSettings />
        <CreateKeyDialog />
      </div>

      <div className="max-h-[400px] space-y-2 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Spinner className="h-6 w-6" />
          </div>
        )}
        {!isLoading &&
          data?.keys &&
          data.keys.length > 0 &&
          data.keys.map((key) => (
            <KeyItem
              key={key.id}
              id={key.id}
              name={key.name}
              keyPrefix={key.keyPrefix}
              createdAt={key.createdAt}
              lastUsedAt={key.lastUsedAt}
            />
          ))}
        {!isLoading && (!data?.keys || data.keys.length === 0) && (
          <div className="rounded-lg border-2 border-dashed border-border-light p-8 text-center">
            <Key className="mx-auto h-8 w-8 text-text-secondary" />
            <p className="mt-2 text-sm text-text-secondary">{localize('com_ui_no_api_keys')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

const remoteAgentsPermissions: PermissionConfig[] = [
  { permission: Permissions.USE, labelKey: 'com_ui_remote_agents_allow_use' },
  { permission: Permissions.CREATE, labelKey: 'com_ui_remote_agents_allow_create' },
  { permission: Permissions.SHARE, labelKey: 'com_ui_remote_agents_allow_share' },
  { permission: Permissions.SHARE_PUBLIC, labelKey: 'com_ui_remote_agents_allow_share_public' },
];

function RemoteAgentsAdminSettings() {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const mutation = useUpdateRemoteAgentsPermissionsMutation({
    onSuccess: () => {
      showToast({ status: 'success', message: localize('com_ui_saved') });
    },
    onError: () => {
      showToast({ status: 'error', message: localize('com_ui_error_save_admin_settings') });
    },
  });

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      aria-label={localize('com_ui_admin_settings')}
    >
      <ShieldEllipsis className="h-5 w-5" aria-hidden="true" />
    </Button>
  );

  return (
    <AdminSettingsDialog
      permissionType={PermissionTypes.REMOTE_AGENTS}
      sectionKey="com_ui_remote_agents"
      permissions={remoteAgentsPermissions}
      menuId="remote-agents-role-dropdown"
      mutation={mutation}
      trigger={trigger}
    />
  );
}

export function AgentApiKeys() {
  const localize = useLocalize();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex items-center justify-between">
      <Label id="api-keys-label">{localize('com_ui_agent_api_keys')}</Label>

      <OGDialog open={isOpen} onOpenChange={setIsOpen}>
        <OGDialogTrigger asChild>
          <Button aria-labelledby="api-keys-label" variant="outline">
            {localize('com_ui_manage')}
          </Button>
        </OGDialogTrigger>

        <OGDialogContent
          title={localize('com_ui_agent_api_keys')}
          className="w-11/12 max-w-2xl bg-background text-text-primary shadow-2xl"
        >
          <OGDialogHeader>
            <OGDialogTitle>{localize('com_ui_agent_api_keys')}</OGDialogTitle>
            <p className="text-sm text-text-secondary">
              {localize('com_ui_agent_api_keys_description')}
            </p>
          </OGDialogHeader>
          <ApiKeysContent isOpen={isOpen} />
        </OGDialogContent>
      </OGDialog>
    </div>
  );
}
