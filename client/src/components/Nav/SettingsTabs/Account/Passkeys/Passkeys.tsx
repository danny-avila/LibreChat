import React, { useCallback, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { MAX_PASSKEYS_PER_USER } from 'librechat-data-provider';
import {
  Button,
  Input,
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
import type { PasskeyRemovalResult } from './PasskeyItem';
import {
  useDeletePasskeyMutation,
  usePasskeysQuery,
  useRenamePasskeyMutation,
} from '~/data-provider';
import { isPasswordRejection, usePasskeyRegistration } from '~/hooks/Auth/usePasskey';
import { useAuthContext, useLocalize } from '~/hooks';
import PasskeyItem from './PasskeyItem';

const PASSWORD_FIELD_ID = 'passkey-confirm-password';
const PASSWORD_ERROR_ID = 'passkey-confirm-password-error';
const PASSWORD_FORM_ID = 'passkey-confirm-password-form';

function Passkeys() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  const { data, isLoading, isError } = usePasskeysQuery({ enabled: isDialogOpen });
  const { registerPasskey, isRegistering, passwordErrorKey, clearPasswordError } =
    usePasskeyRegistration();
  const { mutate: renameMutate } = useRenamePasskeyMutation();
  const { mutateAsync: deleteMutate } = useDeletePasskeyMutation();

  const passkeys = data?.passkeys ?? [];
  const atLimit = passkeys.length >= MAX_PASSKEYS_PER_USER;
  /**
   * Removing a passkey is password-confirmed, but an account provisioned by an
   * identity provider has no password to confirm with. The server waives the
   * check for those accounts so a credential enrolled before the provider check
   * existed stays removable, and the form must not demand one either. Those same
   * accounts cannot enroll new credentials, so the panel stays reachable for
   * cleanup while the add control is hidden.
   */
  const isLocalAccount = user?.provider === 'local';

  /** Callback ref so the field takes focus the moment the step-up form appears. */
  const bindPasswordField = useCallback((input: HTMLInputElement | null) => {
    passwordRef.current = input;
    input?.focus();
  }, []);

  const handleAdd = useCallback(() => {
    if (isConfirming) {
      passwordRef.current?.focus();
      return;
    }
    clearPasswordError();
    setPassword('');
    setIsConfirming(true);
  }, [isConfirming, clearPasswordError]);

  const handleCancelAdd = useCallback(() => {
    setIsConfirming(false);
    setPassword('');
    clearPasswordError();
    addButtonRef.current?.focus();
  }, [clearPasswordError]);

  const handleConfirmAdd = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const passkey = await registerPasskey(password);
      if (!passkey) {
        /** Put focus back on the field the error describes so it can be corrected. */
        passwordRef.current?.focus();
        return;
      }
      setPassword('');
      setIsConfirming(false);
      /** Drop straight into rename so the default label is easy to replace. */
      setRenamingId(passkey.id);
    },
    [password, registerPasskey],
  );

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
    async (passkeyId: string, password: string): Promise<PasskeyRemovalResult> => {
      setPendingId(passkeyId);
      try {
        await deleteMutate({ passkeyId, password: password === '' ? undefined : password });
        showToast({ message: localize('com_ui_passkey_removed') });
        return 'removed';
      } catch (error) {
        if (isPasswordRejection(error)) {
          return 'incorrect-password';
        }
        showToast({ message: localize('com_ui_passkey_remove_error'), status: 'error' });
        return 'failed';
      } finally {
        setPendingId(null);
      }
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
          {!isLoading && isError && (
            <div
              role="alert"
              className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border-light p-8 text-center"
            >
              <PasskeyIcon className="h-6 w-6 text-text-tertiary" aria-hidden="true" />
              <p className="text-sm text-text-secondary">{localize('com_ui_passkey_load_error')}</p>
            </div>
          )}
          {!isLoading && !isError && passkeys.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border-light p-8 text-center">
              <PasskeyIcon className="h-6 w-6 text-text-tertiary" />
              <p className="text-sm text-text-secondary">{localize('com_ui_passkey_empty')}</p>
            </div>
          )}
          {!isLoading && passkeys.length > 0 && (
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {passkeys.map((passkey) => (
                  <motion.li
                    key={passkey.id}
                    layout
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                    className="list-none"
                  >
                    <PasskeyItem
                      passkey={passkey}
                      isRenaming={renamingId === passkey.id}
                      isBusy={pendingId === passkey.id}
                      requiresPassword={isLocalAccount}
                      onStartRename={setRenamingId}
                      onRename={handleRename}
                      onDelete={handleDelete}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        {isLocalAccount && (
          <div className="mt-6 flex flex-col items-end gap-2">
            <Button
              ref={addButtonRef}
              variant="submit"
              onClick={handleAdd}
              disabled={isRegistering || atLimit || isLoading}
              aria-expanded={isConfirming}
              aria-controls={isConfirming ? PASSWORD_FORM_ID : undefined}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {localize('com_ui_passkey_add')}
            </Button>
            {atLimit && (
              <p className="text-xs text-text-secondary">
                {localize('com_ui_passkey_limit_reached')}
              </p>
            )}
          </div>
        )}

        {isConfirming && (
          <form
            id={PASSWORD_FORM_ID}
            onSubmit={handleConfirmAdd}
            className="mt-4 flex flex-col gap-2 rounded-xl border border-border-light p-4"
          >
            <Label htmlFor={PASSWORD_FIELD_ID} className="text-sm font-medium text-text-primary">
              {localize('com_ui_passkey_confirm_password')}
            </Label>
            <p className="text-xs text-text-secondary">
              {localize('com_ui_passkey_confirm_password_description')}
            </p>
            <Input
              id={PASSWORD_FIELD_ID}
              ref={bindPasswordField}
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={passwordErrorKey != null}
              aria-describedby={passwordErrorKey != null ? PASSWORD_ERROR_ID : undefined}
            />
            {passwordErrorKey != null && (
              <p id={PASSWORD_ERROR_ID} role="alert" className="text-xs text-text-destructive">
                {localize(passwordErrorKey)}
              </p>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleCancelAdd}>
                {localize('com_ui_cancel')}
              </Button>
              <Button type="submit" variant="submit" disabled={isRegistering || password === ''}>
                {isRegistering && <Spinner className="h-4 w-4" />}
                {localize('com_ui_confirm')}
              </Button>
            </div>
          </form>
        )}
      </OGDialogContent>
    </OGDialog>
  );
}

export default React.memo(Passkeys);
