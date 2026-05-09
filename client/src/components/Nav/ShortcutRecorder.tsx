import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import type { RefObject } from 'react';
import type { ShortcutBinding } from '~/utils/shortcuts';
import {
  bindingDisplayKeys,
  bindingHash,
  isCancelKey,
  isModifierKey,
  normalizeKey,
} from '~/utils/shortcuts';
import { isMac } from '~/hooks/useKeyboardShortcuts';
import ShortcutKeyCombo from './ShortcutKeyCombo';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type ConflictInfo = {
  conflictId: string;
  conflictLabel: string;
  binding: ShortcutBinding;
};

type RecorderState = {
  containerRef: RefObject<HTMLDivElement>;
  previewKeys: string[];
  hasConflict: boolean;
  conflict: ConflictInfo | null;
  showInvalid: boolean;
  showHint: boolean;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onKeyUp: () => void;
  onTryAgain: () => void;
};

type Options = {
  initial: ShortcutBinding | null;
  bindingMap: Map<string, string>;
  ownerId: string;
  getActionLabel: (id: string) => string;
  onSave: (binding: ShortcutBinding) => void;
  onCancel: () => void;
};

function isValidBinding(binding: ShortcutBinding): { valid: boolean; reason?: 'noModifier' } {
  if (binding.meta || binding.ctrl || binding.alt) {
    return { valid: true };
  }
  const isPrintable = binding.key.length === 1 && binding.key !== ' ';
  if (!isPrintable) {
    return { valid: true };
  }
  return { valid: false, reason: 'noModifier' };
}

export function useShortcutRecorder({
  initial,
  bindingMap,
  ownerId,
  getActionLabel,
  onSave,
  onCancel,
}: Options): RecorderState {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<ShortcutBinding | null>(null);
  const [draft, setDraft] = useState<ShortcutBinding | null>(initial);
  const [error, setError] = useState<'noModifier' | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);

  const previewKeys = useMemo(() => {
    const source = pending ?? draft;
    if (!source) return [];
    return bindingDisplayKeys(source, isMac);
  }, [pending, draft]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      if (isCancelKey(e.nativeEvent)) {
        onCancel();
        return;
      }

      const previewBinding: ShortcutBinding = {
        meta: e.metaKey,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        key: isModifierKey(e.key) ? '' : normalizeKey(e.key, e.shiftKey),
      };

      if (!previewBinding.key) {
        setPending({ ...previewBinding, key: '…' });
        return;
      }

      setPending(null);
      const validation = isValidBinding(previewBinding);
      if (!validation.valid) {
        setDraft(previewBinding);
        setError('noModifier');
        setConflict(null);
        return;
      }
      setError(null);
      const hash = bindingHash(previewBinding);
      const conflictId = bindingMap.get(hash);
      if (conflictId && conflictId !== ownerId) {
        setDraft(previewBinding);
        setConflict({
          conflictId,
          conflictLabel: getActionLabel(conflictId),
          binding: previewBinding,
        });
        return;
      }
      setConflict(null);
      onSave(previewBinding);
    },
    [bindingMap, getActionLabel, onCancel, onSave, ownerId],
  );

  const onKeyUp = useCallback(() => {
    setPending(null);
  }, []);

  const onTryAgain = useCallback(() => {
    setDraft(initial);
    setConflict(null);
    setError(null);
    containerRef.current?.focus();
  }, [initial]);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCancel();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [onCancel]);

  return {
    containerRef,
    previewKeys,
    hasConflict: !!conflict,
    conflict,
    showInvalid: error === 'noModifier',
    showHint: previewKeys.length === 0,
    onKeyDown,
    onKeyUp,
    onTryAgain,
  };
}

export function RecorderPill({
  state,
  ariaLabel,
  ownerId,
}: {
  state: RecorderState;
  ariaLabel: string;
  ownerId: string;
}) {
  const localize = useLocalize();
  const { containerRef, previewKeys, hasConflict, showInvalid, showHint, onKeyDown, onKeyUp } =
    state;
  return (
    <div
      ref={containerRef}
      role="textbox"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-describedby={`${ownerId}-recorder-hint`}
      data-testid={`shortcut-recorder-${ownerId}`}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      className={cn(
        'group relative flex h-[30px] items-center gap-1.5 rounded-lg px-2.5 outline-none transition-all duration-200',
        'ring-2 ring-offset-2 ring-offset-surface-primary',
        hasConflict
          ? 'bg-amber-500/10 ring-amber-500/50'
          : showInvalid
            ? 'animate-shortcut-shake bg-red-500/10 ring-red-500/50'
            : 'bg-blue-500/10 ring-blue-500/50',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full',
          hasConflict ? 'bg-amber-500' : showInvalid ? 'bg-red-500' : 'bg-blue-500',
        )}
      />
      {showHint ? (
        <span className="text-[11.5px] font-medium text-text-secondary">
          {localize('com_shortcut_recorder_placeholder')}
        </span>
      ) : (
        <ShortcutKeyCombo keys={previewKeys} />
      )}
    </div>
  );
}

export function RecorderInfo({
  state,
  ownerId,
  onCancel,
  onSaveReplacing,
}: {
  state: RecorderState;
  ownerId: string;
  onCancel: () => void;
  onSaveReplacing: (binding: ShortcutBinding, conflictId: string) => void;
}) {
  const localize = useLocalize();
  const { hasConflict, conflict, showInvalid, onTryAgain } = state;

  if (hasConflict && conflict) {
    return (
      <div
        id={`${ownerId}-recorder-hint`}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2"
      >
        <span className="text-[12.5px] text-text-primary">
          <span className="font-medium text-text-secondary">
            {localize('com_shortcut_recorder_conflict_prefix')}
          </span>{' '}
          <span className="font-semibold">{conflict.conflictLabel}</span>
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onTryAgain}
            className="inline-flex items-center rounded-md px-2.5 py-1 text-[12px] font-medium text-text-secondary transition-colors hover:bg-surface-active-alt hover:text-text-primary"
          >
            {localize('com_shortcut_recorder_try_again')}
          </button>
          <button
            type="button"
            onClick={() => onSaveReplacing(conflict.binding, conflict.conflictId)}
            className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-3 py-1 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
          >
            {localize('com_shortcut_recorder_replace')}
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id={`${ownerId}-recorder-hint`} className="flex items-center justify-end gap-2">
      {showInvalid ? (
        <span className="text-[11.5px] font-medium text-red-600 dark:text-red-400">
          {localize('com_shortcut_recorder_needs_modifier')}
        </span>
      ) : (
        <span className="text-[11.5px] font-medium text-text-secondary">
          {localize('com_shortcut_recorder_hint')}
        </span>
      )}
      <button
        type="button"
        onClick={onCancel}
        aria-label={localize('com_ui_cancel')}
        className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-active-alt hover:text-text-primary"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
