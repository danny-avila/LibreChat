import React, { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { MAX_PASSKEYS_PER_USER } from 'librechat-data-provider';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Button,
  Label,
  OGDialog,
  OGDialogContent,
  OGDialogDescription,
  OGDialogHeader,
  OGDialogTitle,
  OGDialogTrigger,
  PasskeyIcon,
  Skeleton,
  Spinner,
  useToastContext,
} from '@librechat/client';
import {
  useDeletePasskeyMutation,
  usePasskeysQuery,
  useRenamePasskeyMutation,
} from '~/data-provider';
import { usePasskeyRegistration } from '~/hooks/Auth/usePasskey';
import { useLocalize } from '~/hooks';
import PasskeyItem from './PasskeyItem';

function Passkeys() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data, isLoading } = usePasskeysQuery({ enabled: isDialogOpen });
  const { registerPasskey, isRegistering } = usePasskeyRegistration();
  const { mutate: renameMutate } = useRenamePasskeyMutation();
  const { mutate: deleteMutate } = useDeletePasskeyMutation();

  const passkeys = data?.passkeys ?? [];
  const atLimit = passkeys.length >= MAX_PASSKEYS_PER_USER;

  const handleAdd = useCallback(async () => {
    const passkey = await registerPasskey();
    if (passkey) {
      /** Drop straight into rename so the default label is easy to replace. */
      setRenamingId(passkey.id);
    }
  }, [registerPasskey]);

  const handleRename = useCallback(
    (passkeyId: string, name: string) => {
      setPendingId(passkeyId);
      renameMutate(
        { passkeyId, name },
        {
          onSuccess: () => setRenamingId(null),
          onError: () =>
            showToast({ message: localize('com_ui_passkey_rename_error'), status: 'error' }),
          onSettled: () => setPendingId(null),
        },
      );
    },
    [renameMutate, localize, showToast],
  );

  const handleDelete = useCallback(
    (passkeyId: string) => {
      setPendingId(passkeyId);
      deleteMutate(passkeyId, {
        onSuccess: () => showToast({ message: localize('com_ui_passkey_removed') }),
        onError: () =>
          showToast({ message: localize('com_ui_passkey_remove_error'), status: 'error' }),
        onSettled: () => setPendingId(null),
      });
    },
    [deleteMutate, localize, showToast],
  );

  return (
    <OGDialog open={isDialogOpen} onOpenChange={setDialogOpen}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Label className="font-light">{localize('com_ui_passkeys')}</Label>
        </div>
        <OGDialogTrigger asChild>
          <Button variant="outline" aria-label={localize('com_ui_passkeys')}>
            {localize('com_ui_manage')}
          </Button>
        </OGDialogTrigger>
      </div>

      <OGDialogContent className="w-11/12 max-w-lg" showCloseButton={true}>
        <OGDialogHeader>
          <OGDialogTitle className="flex items-center gap-3 text-xl font-semibold">
            <PasskeyIcon className="h-5 w-5 text-text-secondary" />
            {localize('com_ui_passkeys')}
          </OGDialogTitle>
          <OGDialogDescription className="text-sm text-text-secondary">
            {localize('com_ui_passkeys_description')}
          </OGDialogDescription>
        </OGDialogHeader>

        <div className="mt-4">
          {isLoading && (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          )}
          {!isLoading && passkeys.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border-light p-8 text-center">
              <PasskeyIcon className="h-6 w-6 text-text-tertiary" />
              <p className="text-sm text-text-secondary">{localize('com_ui_passkey_empty')}</p>
            </div>
          )}
          {!isLoading && passkeys.length > 0 && (
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {passkeys.map((passkey) => (
                  <motion.div
                    key={passkey.id}
                    layout
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                  >
                    <PasskeyItem
                      passkey={passkey}
                      isRenaming={renamingId === passkey.id}
                      isBusy={pendingId === passkey.id}
                      onStartRename={setRenamingId}
                      onRename={handleRename}
                      onDelete={handleDelete}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        <div className="mt-6 flex flex-col items-end gap-2">
          <Button
            variant="submit"
            onClick={() => void handleAdd()}
            disabled={isRegistering || atLimit}
            aria-label={localize('com_ui_passkey_add')}
          >
            {isRegistering ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            {localize('com_ui_passkey_add')}
          </Button>
          {atLimit && (
            <p className="text-xs text-text-secondary">
              {localize('com_ui_passkey_limit_reached')}
            </p>
          )}
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}

export default React.memo(Passkeys);
