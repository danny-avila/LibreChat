import React, { useCallback, useRef, useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { Button, Input, PasskeyIcon, Spinner, TooltipAnchor } from '@librechat/client';
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

type PasskeyItemProps = {
  passkey: TPasskey;
  isRenaming: boolean;
  isBusy: boolean;
  onStartRename: (passkeyId: string | null) => void;
  onRename: (passkeyId: string, name: string) => void;
  onDelete: (passkeyId: string) => void;
};

function PasskeyItem({
  passkey,
  isRenaming,
  isBusy,
  onStartRename,
  onRename,
  onDelete,
}: PasskeyItemProps) {
  const localize = useLocalize();
  const [draftName, setDraftName] = useState(passkey.name);
  const [isConfirming, setIsConfirming] = useState(false);
  const renameButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

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
    onStartRename(null);
    renameButtonRef.current?.focus();
  }, [passkey.name, onStartRename]);

  const submitRename = useCallback(() => {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === passkey.name) {
      cancelRename();
      return;
    }
    onRename(passkey.id, trimmed);
  }, [draftName, passkey.id, passkey.name, onRename, cancelRename]);

  const cancelDelete = useCallback(() => {
    setIsConfirming(false);
    deleteButtonRef.current?.focus();
  }, []);

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
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelDelete();
      }
    },
    [cancelDelete],
  );

  return (
    <li className="flex items-center gap-3 rounded-xl border border-border-light bg-surface-secondary p-3">
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
        <div
          role="group"
          aria-label={localize('com_ui_passkey_remove')}
          onKeyDown={onConfirmKeyDown}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <p className="min-w-0 flex-1 truncate text-sm text-text-primary">
            {localize('com_ui_passkey_remove_confirm', { name: passkey.name })}
          </p>
          <Button ref={focusButtonOnMount} variant="outline" size="sm" onClick={cancelDelete}>
            {localize('com_ui_cancel')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={isBusy}
            onClick={() => onDelete(passkey.id)}
          >
            {isBusy ? <Spinner className="h-4 w-4" /> : localize('com_ui_delete')}
          </Button>
        </div>
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
            <span className="bg-status-success-subtle text-status-success shrink-0 rounded-full px-2 py-0.5 text-xs font-medium">
              {localize('com_ui_passkey_synced')}
            </span>
          )}

          <TooltipAnchor
            description={localize('com_ui_passkey_rename')}
            render={
              <Button
                ref={renameButtonRef}
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
                ref={deleteButtonRef}
                variant="ghost"
                size="icon"
                onClick={() => setIsConfirming(true)}
                aria-label={localize('com_ui_passkey_remove')}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            }
          />
        </>
      )}
    </li>
  );
}

export default React.memo(PasskeyItem);
