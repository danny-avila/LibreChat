import React, { useCallback, useId, useMemo, useRef, useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { Button, Input, Label, PasskeyIcon, Spinner, TooltipAnchor } from '@librechat/client';
import type { TPasskey } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

const MAX_NAME_LENGTH = 60;

/** Moves focus into the rename field as it mounts, then selects the current label. */
const focusOnMount = (input: HTMLInputElement | null): void => {
  input?.select();
};

/** Keeps focus inside the row when it swaps into confirmation mode. */
const focusButtonOnMount = (button: HTMLButtonElement | null): void => {
  button?.focus();
};

const formatDate = (value: string | null): string | null => {
  if (value == null || value === '') {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
};

type RowMode = 'idle' | 'renaming' | 'confirming';

/**
 * Callback ref that restores focus to the control which opened the mode named by
 * `from`, once that control is back in the tree.
 */
const returnFocusRef =
  (pending: React.MutableRefObject<RowMode | null>, from: RowMode) =>
  (button: HTMLButtonElement | null): void => {
    if (button && pending.current === from) {
      pending.current = null;
      button.focus();
    }
  };

/** Outcome of a removal attempt, so a rejected password lands next to its field. */
export type PasskeyRemovalResult = 'removed' | 'incorrect-password' | 'failed';

type PasskeyItemProps = {
  passkey: TPasskey;
  isRenaming: boolean;
  isBusy: boolean;
  /** False for an account with no local password, which cannot be asked for one. */
  requiresPassword: boolean;
  onStartRename: (passkeyId: string | null) => void;
  onRename: (passkeyId: string, name: string) => void;
  onDelete: (passkeyId: string, password: string) => Promise<PasskeyRemovalResult>;
};

function PasskeyItem({
  passkey,
  isRenaming,
  isBusy,
  requiresPassword,
  onStartRename,
  onRename,
  onDelete,
}: PasskeyItemProps) {
  const localize = useLocalize();
  const [draftName, setDraftName] = useState(passkey.name);
  const [isConfirming, setIsConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [hasPasswordError, setHasPasswordError] = useState(false);
  /**
   * The server waives the step-up only for accounts carrying no password hash, which the
   * client cannot see: an account moved to an identity provider without its old hash
   * cleared still has to prove it. Reveal the field when the server actually asks, so
   * those credentials stay removable instead of failing on every attempt.
   */
  const [serverDemandedPassword, setServerDemandedPassword] = useState(false);
  const showPasswordField = requiresPassword || serverDemandedPassword;
  const passwordRef = useRef<HTMLInputElement | null>(null);
  /**
   * Leaving a mode unmounts the control that opened it, so focus cannot be
   * restored inline: the element is gone by the time the handler runs. The flag
   * is read by the callback ref below, which fires once the control is back.
   */
  const returnFocusTo = useRef<RowMode | null>(null);
  const rowId = useId();
  const passwordFieldId = `${rowId}-password`;
  const passwordErrorId = `${rowId}-password-error`;

  const added = formatDate(passkey.createdAt);
  const lastUsed = formatDate(passkey.lastUsedAt);
  /**
   * Confirmation is inline rather than an `AlertDialog`: this row already lives
   * inside a dialog, and stacking a modal on a modal both traps focus twice and
   * renders beneath the parent's depth-aware z-index.
   */
  let mode: RowMode = 'idle';
  if (isRenaming) {
    mode = 'renaming';
  } else if (isConfirming) {
    mode = 'confirming';
  }

  const beginRename = useCallback(() => {
    setDraftName(passkey.name);
    onStartRename(passkey.id);
  }, [passkey.id, passkey.name, onStartRename]);

  const cancelRename = useCallback(() => {
    setDraftName(passkey.name);
    returnFocusTo.current = 'renaming';
    onStartRename(null);
  }, [passkey.name, onStartRename]);

  const submitRename = useCallback(() => {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === passkey.name) {
      cancelRename();
      return;
    }
    onRename(passkey.id, trimmed);
  }, [draftName, passkey.id, passkey.name, onRename, cancelRename]);

  /** Callback ref so the step-up field takes focus the moment the row swaps mode. */
  const bindPasswordField = useCallback((input: HTMLInputElement | null) => {
    passwordRef.current = input;
    input?.focus();
  }, []);

  const bindRenameButton = useMemo(() => returnFocusRef(returnFocusTo, 'renaming'), []);
  const bindDeleteButton = useMemo(() => returnFocusRef(returnFocusTo, 'confirming'), []);

  const beginDelete = useCallback(() => {
    setPassword('');
    setHasPasswordError(false);
    setIsConfirming(true);
  }, []);

  const cancelDelete = useCallback(() => {
    setPassword('');
    setHasPasswordError(false);
    returnFocusTo.current = 'confirming';
    setIsConfirming(false);
  }, []);

  const submitDelete = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setHasPasswordError(false);
      const result = await onDelete(passkey.id, password);
      if (result === 'removed') {
        return;
      }
      if (result === 'incorrect-password') {
        setHasPasswordError(true);
        setServerDemandedPassword(true);
      } else {
        setHasPasswordError(false);
      }
      /** Put focus back on the field the error describes so it can be corrected. */
      passwordRef.current?.focus();
    },
    [onDelete, passkey.id, password],
  );

  const onRenameKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitRename();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelRename();
      }
    },
    [submitRename, cancelRename],
  );

  const onConfirmKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLFormElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelDelete();
      }
    },
    [cancelDelete],
  );

  return (
    <div
      className={`flex gap-3 rounded-xl border border-border-light bg-surface-secondary p-3 ${
        mode === 'confirming' ? 'items-start' : 'items-center'
      }`}
    >
      <PasskeyIcon className="h-5 w-5 shrink-0 text-text-secondary" />

      {mode === 'renaming' && (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            ref={focusOnMount}
            value={draftName}
            maxLength={MAX_NAME_LENGTH}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={onRenameKeyDown}
            aria-label={localize('com_ui_passkey_name')}
            className="h-9"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={submitRename}
            disabled={isBusy}
            aria-label={localize('com_ui_save')}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={cancelRename}
            aria-label={localize('com_ui_cancel')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      {mode === 'confirming' && (
        <form
          aria-label={localize('com_ui_passkey_remove')}
          onSubmit={submitDelete}
          onKeyDown={onConfirmKeyDown}
          className="flex min-w-0 flex-1 flex-col gap-2"
        >
          <p className="min-w-0 text-sm text-text-primary">
            {localize('com_ui_passkey_remove_confirm', { name: passkey.name })}
          </p>

          {showPasswordField && (
            <>
              <Label htmlFor={passwordFieldId} className="text-xs font-medium text-text-primary">
                {localize('com_ui_passkey_confirm_password')}
              </Label>
              <p className="text-xs text-text-secondary">
                {localize('com_ui_passkey_remove_password_description')}
              </p>
              <Input
                id={passwordFieldId}
                ref={bindPasswordField}
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={hasPasswordError}
                aria-describedby={hasPasswordError ? passwordErrorId : undefined}
                className="h-9"
              />
              {hasPasswordError && (
                <p id={passwordErrorId} role="alert" className="text-xs text-text-destructive">
                  {localize('com_ui_passkey_password_incorrect')}
                </p>
              )}
            </>
          )}

          <div className="flex justify-end gap-2">
            <Button
              ref={showPasswordField ? undefined : focusButtonOnMount}
              type="button"
              variant="outline"
              size="sm"
              onClick={cancelDelete}
            >
              {localize('com_ui_cancel')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={isBusy || (showPasswordField && password === '')}
            >
              {isBusy ? <Spinner className="h-4 w-4" /> : localize('com_ui_delete')}
            </Button>
          </div>
        </form>
      )}

      {mode === 'idle' && (
        <>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">{passkey.name}</p>
            <p className="truncate text-xs text-text-secondary">
              {added != null && localize('com_ui_passkey_added_on', { date: added })}
              {added != null && ' · '}
              {lastUsed != null
                ? localize('com_ui_passkey_last_used', { date: lastUsed })
                : localize('com_ui_passkey_never_used')}
            </p>
          </div>

          {passkey.backedUp && (
            <span className="shrink-0 rounded-full bg-status-success-subtle px-2 py-0.5 text-xs font-medium text-status-success">
              {localize('com_ui_passkey_synced')}
            </span>
          )}

          <TooltipAnchor
            description={localize('com_ui_passkey_rename')}
            render={
              <Button
                ref={bindRenameButton}
                variant="ghost"
                size="icon"
                onClick={beginRename}
                aria-label={localize('com_ui_passkey_rename')}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Button>
            }
          />
          <TooltipAnchor
            description={localize('com_ui_passkey_remove')}
            render={
              <Button
                ref={bindDeleteButton}
                variant="ghost"
                size="icon"
                onClick={beginDelete}
                aria-label={localize('com_ui_passkey_remove')}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            }
          />
        </>
      )}
    </div>
  );
}

export default React.memo(PasskeyItem);
