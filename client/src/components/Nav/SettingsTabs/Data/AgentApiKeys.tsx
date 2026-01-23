import React, { useState } from 'react';
import { Plus, Trash2, Copy, CopyCheck, Key, Eye, EyeOff } from 'lucide-react';
import {
  useGetAgentApiKeysQuery,
  useCreateAgentApiKeyMutation,
  useDeleteAgentApiKeyMutation,
} from 'librechat-data-provider/react-query';
import {
  Button,
  Input,
  Label,
  OGDialog,
  OGDialogClose,
  OGDialogContent,
  OGDialogTitle,
  OGDialogTrigger,
  Spinner,
  useToastContext,
} from '@librechat/client';
import { useLocalize, useCopyToClipboard } from '~/hooks';

function CreateKeyDialog({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
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
    if (isCopying) return;
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

export function AgentApiKeys() {
  const localize = useLocalize();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { data, isLoading, error } = useGetAgentApiKeysQuery();

  if (error) {
    return <div className="text-sm text-red-500">{localize('com_ui_api_keys_load_error')}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-base font-medium">{localize('com_ui_agent_api_keys')}</Label>
          <p className="text-sm text-text-secondary">
            {localize('com_ui_agent_api_keys_description')}
          </p>
        </div>
        <CreateKeyDialog open={createDialogOpen} setOpen={setCreateDialogOpen} />
      </div>

      <div className="space-y-2">
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
