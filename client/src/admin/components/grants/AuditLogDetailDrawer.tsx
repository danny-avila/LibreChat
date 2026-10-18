import { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { ReactElement } from 'react';
import type * as t from '~/admin/types';
import {
  ACTION_BADGE_STATE,
  ACTION_LABEL_KEY,
  ACTION_SUMMARY_KEY,
  auditGrantee,
  auditSubject,
  auditTargetConfig,
  capabilityLabel,
  formatTimestamp,
} from './auditLogUtils';
import { CloseButton, DecorativeIcon, LoadingState } from '~/admin/components/shared';
import { Badge, Button, Icon } from '~/admin/ui';
import { useLocalize } from '~/admin/hooks';
import { cn } from '~/admin/utils';

interface AuditLogDetailDrawerProps {
  entry: t.AuditLogEntryWithDiff | null;
  open: boolean;
  onClose: () => void;
  /** Resolves to `true` when the clipboard write succeeded so the drawer only
   * flips to its "Copied!" affordance after a real success. */
  onCopyPermalink: (entryId: string) => Promise<boolean>;
  /** Invoked when any inline `CopyableMono` (timestamp, actor/target/entry IDs,
   * capability) fails to write to the clipboard. The caller is responsible for
   * surfacing the failure — typically via the same screen-reader announcement
   * used for the permalink-copy failure path so the drawer's copy controls are
   * not silent on clipboard error. */
  onCopyFailed?: () => void;
  /** Render a "no entry found" message instead of the detail body when the
   * deep-linked id couldn't be located (e.g. the entry was purged). */
  notFound?: boolean;
  /** Render a loading shell while the single-entry deep-link query is in flight
   * for an entry that is not on the current page. Without this, the drawer
   * would either flicker shut during the fetch or never appear on cold load. */
  loading?: boolean;
  /** Render a load-error message + close affordance when the single-entry
   * fetch failed for reasons other than not-found (network failure, 5xx). The
   * caller is responsible for distinguishing this from `notFound` (which is
   * the 404 case where the request itself succeeded but the entry is gone). */
  loadError?: boolean;
}

function CopyableMono({
  value,
  ariaLabel,
  onCopyFailed,
}: {
  value: string;
  ariaLabel: string;
  onCopyFailed?: () => void;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      onCopyFailed?.();
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      onCopyFailed?.();
      return;
    }
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }, [value, onCopyFailed]);

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={ariaLabel}
      aria-live="polite"
      className={cn(
        'text-2xs inline-flex w-fit items-center gap-1 self-start rounded px-1 py-0.5 font-mono',
        'text-(--cui-color-text-muted) hover:bg-(--cui-color-background-hover)',
        'focus:outline-2 focus:outline-(--cui-color-stroke-focus)',
        copied && 'text-(--cui-color-feedback-success-foreground)',
      )}
    >
      <span>{value}</span>
      <DecorativeIcon name={copied ? 'check' : 'copy'} size="xs" />
    </button>
  );
}

function DiffList({
  items,
  variant,
  localize,
}: {
  items: readonly string[];
  variant: 'added' | 'removed';
  localize: ReturnType<typeof useLocalize>;
}): ReactElement {
  if (items.length === 0) {
    return (
      <p className="text-xs text-(--cui-color-text-muted)">
        {localize('com_admin_audit_detail_no_changes')}
      </p>
    );
  }
  const state = variant === 'added' ? 'success' : 'danger';
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((cap) => (
        <li key={cap} className="flex flex-col gap-0.5">
          <Badge size="sm" state={state} text={capabilityLabel(cap, localize)} />
          <span className="text-3xs font-mono text-(--cui-color-text-muted)">{cap}</span>
        </li>
      ))}
    </ul>
  );
}

export function AuditLogDetailDrawer({
  entry,
  open,
  onClose,
  onCopyPermalink,
  onCopyFailed,
  notFound = false,
  loading = false,
  loadError = false,
}: AuditLogDetailDrawerProps): ReactElement | null {
  const localize = useLocalize();

  // Keep the last non-null entry so the close animation has content to render
  // while Radix Dialog slides the panel out. Without this, unmounting on
  // `entry === null` would cut off the data-state="closed" exit animation.
  const [latestEntry, setLatestEntry] = useState<t.AuditLogEntryWithDiff | null>(entry);
  // Mirror the `latestEntry` pattern for the not-found path so the drawer can
  // animate out: when the user closes the not-found drawer, `notFound` flips
  // false in the same tick that `open` flips false. Without this latch the
  // component would short-circuit to `return null` and skip the exit animation.
  const [latestNotFound, setLatestNotFound] = useState<boolean>(notFound);
  // Same latch idea for the load-error branch — close should slide the error
  // shell out rather than yank it.
  const [latestLoadError, setLatestLoadError] = useState<boolean>(loadError);
  useEffect(() => {
    if (entry) {
      setLatestEntry(entry);
      setLatestNotFound(false);
      setLatestLoadError(false);
    } else if (notFound) {
      /**
       * A permalink to a missing entry can arrive after the user has opened a
       * real entry earlier in the session, leaving `latestEntry` stale. Clear
       * it so the not-found branch — which is gated on `!latestEntry` — fires
       * instead of falling through and showing the previous entry's content
       * under a not-found URL.
       */
      setLatestEntry(null);
      setLatestNotFound(true);
      setLatestLoadError(false);
    } else if (loadError) {
      /** Fetch failed non-404 — surface the error shell + drop any stale latches. */
      setLatestEntry(null);
      setLatestNotFound(false);
      setLatestLoadError(true);
    } else if (loading) {
      /**
       * `entryId` switched to a new row while its fetch is in flight (e.g.
       * the user clicks a different audit row before the previous one
       * loaded). Without clearing the latches, the loading branch — gated on
       * empty latches — would skip and the drawer would keep rendering the
       * previous entry's content (or a stale not-found state) under the new
       * `entryId`.
       */
      setLatestEntry(null);
      setLatestNotFound(false);
      setLatestLoadError(false);
    }
  }, [entry, notFound, loading, loadError]);

  // Copied-feedback state for the permalink button.
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);
  const handleCopyPermalinkClick = useCallback(async () => {
    if (!entry) return;
    const ok = await onCopyPermalink(entry.id);
    if (!ok) return;
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 1500);
  }, [entry, onCopyPermalink]);

  /**
   * Loading shell while the single-entry deep-link fetch is in flight for an
   * entry that is not on the current page. Shows the same panel chrome (header
   * + close button) as the not-found / regular branches so the drawer never
   * appears to flicker shut during the fetch.
   */
  if (loading && !latestEntry && !latestNotFound) {
    return (
      <Dialog.Root
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) onClose();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay
            className={cn(
              'bg-surface-overlay/30 fixed inset-0 z-(--z-overlay) backdrop-blur-xs',
              'data-[state=closed]:animate-(--admin-overlay-out) data-[state=open]:animate-(--admin-overlay-in) motion-reduce:animate-none',
            )}
          />
          <Dialog.Content
            aria-label={localize('com_admin_audit_detail_title')}
            onEscapeKeyDown={() => onClose()}
            className={cn(
              'fixed top-0 right-0 z-(--z-overlay) flex h-full w-full flex-col bg-(--cui-color-background-panel) shadow-xl sm:w-120',
              'border-l border-(--cui-color-stroke-default)',
              'will-change-transform',
              'data-[state=closed]:animate-(--admin-drawer-out) data-[state=open]:animate-(--admin-drawer-in) motion-reduce:animate-none',
            )}
          >
            <Dialog.Title className="sr-only">
              {localize('com_admin_audit_detail_title')}
            </Dialog.Title>
            <header className="flex items-center justify-between gap-3 border-b border-(--cui-color-stroke-default) px-4 py-3">
              <span className="text-sm font-semibold text-(--cui-color-text-default)">
                {localize('com_admin_audit_detail_title')}
              </span>
              <CloseButton label={localize('com_admin_audit_detail_close')} onClick={onClose} />
            </header>
            <div className="flex flex-1 items-center justify-center px-4 py-8">
              <LoadingState />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  if (latestLoadError && !latestEntry && !latestNotFound) {
    return (
      <Dialog.Root
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) onClose();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay
            className={cn(
              'bg-surface-overlay/30 fixed inset-0 z-(--z-overlay) backdrop-blur-xs',
              'data-[state=closed]:animate-(--admin-overlay-out) data-[state=open]:animate-(--admin-overlay-in) motion-reduce:animate-none',
            )}
          />
          <Dialog.Content
            aria-label={localize('com_admin_audit_detail_title')}
            onEscapeKeyDown={() => onClose()}
            className={cn(
              'fixed top-0 right-0 z-(--z-overlay) flex h-full w-full flex-col bg-(--cui-color-background-panel) shadow-xl sm:w-120',
              'border-l border-(--cui-color-stroke-default)',
              'will-change-transform',
              'data-[state=closed]:animate-(--admin-drawer-out) data-[state=open]:animate-(--admin-drawer-in) motion-reduce:animate-none',
            )}
          >
            <Dialog.Title className="sr-only">
              {localize('com_admin_audit_detail_title')}
            </Dialog.Title>
            <header className="flex items-center justify-between gap-3 border-b border-(--cui-color-stroke-default) px-4 py-3">
              <span className="text-sm font-semibold text-(--cui-color-text-default)">
                {localize('com_admin_audit_detail_title')}
              </span>
              <CloseButton label={localize('com_admin_audit_detail_close')} onClick={onClose} />
            </header>
            <div className="flex flex-1 items-center justify-center px-4 py-8 text-center">
              <p className="text-sm text-(--cui-color-text-muted)">
                {localize('com_admin_audit_detail_load_error')}
              </p>
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-(--cui-color-stroke-default) px-4 py-3">
              <Button
                htmlType="button"
                type="primary"
                label={localize('com_admin_audit_detail_close')}
                onClick={onClose}
              />
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  if (latestNotFound && !latestEntry) {
    return (
      <Dialog.Root
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) onClose();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay
            className={cn(
              'bg-surface-overlay/30 fixed inset-0 z-(--z-overlay) backdrop-blur-xs',
              'data-[state=closed]:animate-(--admin-overlay-out) data-[state=open]:animate-(--admin-overlay-in) motion-reduce:animate-none',
            )}
          />
          <Dialog.Content
            aria-label={localize('com_admin_audit_detail_title')}
            onEscapeKeyDown={() => onClose()}
            className={cn(
              'fixed top-0 right-0 z-(--z-overlay) flex h-full w-full flex-col bg-(--cui-color-background-panel) shadow-xl sm:w-120',
              'border-l border-(--cui-color-stroke-default)',
              'will-change-transform',
              'data-[state=closed]:animate-(--admin-drawer-out) data-[state=open]:animate-(--admin-drawer-in) motion-reduce:animate-none',
            )}
          >
            <Dialog.Title className="sr-only">
              {localize('com_admin_audit_detail_title')}
            </Dialog.Title>
            <header className="flex items-center justify-between gap-3 border-b border-(--cui-color-stroke-default) px-4 py-3">
              <span className="text-sm font-semibold text-(--cui-color-text-default)">
                {localize('com_admin_audit_detail_title')}
              </span>
              <CloseButton label={localize('com_admin_audit_detail_close')} onClick={onClose} />
            </header>
            <div className="flex flex-1 items-center justify-center px-4 py-8 text-center">
              <p className="text-sm text-(--cui-color-text-muted)">
                {localize('com_admin_audit_detail_not_found')}
              </p>
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-(--cui-color-stroke-default) px-4 py-3">
              <Button
                htmlType="button"
                type="primary"
                label={localize('com_admin_audit_detail_close')}
                onClick={onClose}
              />
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  if (!latestEntry) return null;

  const targetConfig = auditTargetConfig(latestEntry.target.type);
  const subject = auditSubject(latestEntry, localize);
  const grantee = auditGrantee(latestEntry);
  const targetLabel = latestEntry.target.name ?? latestEntry.target.id ?? '';

  const before = latestEntry.before ?? [];
  const after = latestEntry.after ?? [];
  const hasDiff = before.length > 0 || after.length > 0;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'bg-surface-overlay/30 fixed inset-0 z-(--z-overlay) backdrop-blur-xs',
            'data-[state=closed]:animate-(--admin-overlay-out) data-[state=open]:animate-(--admin-overlay-in) motion-reduce:animate-none',
          )}
        />
        <Dialog.Content
          aria-label={localize('com_admin_audit_detail_title')}
          onEscapeKeyDown={() => onClose()}
          className={cn(
            'fixed top-0 right-0 z-(--z-overlay) flex h-full w-full flex-col bg-(--cui-color-background-panel) shadow-xl sm:w-120',
            'border-l border-(--cui-color-stroke-default)',
            'will-change-transform',
            'data-[state=closed]:animate-(--admin-drawer-out) data-[state=open]:animate-(--admin-drawer-in) motion-reduce:animate-none',
          )}
        >
          <Dialog.Title className="sr-only">
            {localize('com_admin_audit_detail_title')}
          </Dialog.Title>
          <header className="flex items-center justify-between gap-3 border-b border-(--cui-color-stroke-default) px-4 py-3">
            <div className="flex items-center gap-2">
              <Badge
                size="sm"
                state={ACTION_BADGE_STATE[latestEntry.action]}
                text={localize(ACTION_LABEL_KEY[latestEntry.action])}
              />
              <span className="text-sm font-semibold text-(--cui-color-text-default)">
                {localize('com_admin_audit_detail_title')}
              </span>
            </div>
            <CloseButton label={localize('com_admin_audit_detail_close')} onClick={onClose} />
          </header>

          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-5 px-4 py-4">
              <p className="text-sm text-(--cui-color-text-default)">
                {localize(ACTION_SUMMARY_KEY[latestEntry.action], {
                  actor: latestEntry.actor.name,
                  capability: subject.label,
                  target: targetLabel,
                  grantee: grantee ? `${grantee.type} ${grantee.id}` : '',
                })}
              </p>

              <dl className="flex flex-col gap-3">
                <DetailRow label={localize('com_admin_audit_detail_timestamp')}>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-(--cui-color-text-default)">
                      {formatTimestamp(latestEntry.timestamp)}
                    </span>
                    <CopyableMono
                      value={latestEntry.timestamp}
                      ariaLabel={`Copy ${localize('com_admin_audit_detail_timestamp')}`}
                      onCopyFailed={onCopyFailed}
                    />
                  </div>
                </DetailRow>

                <DetailRow label={localize('com_admin_audit_detail_actor')}>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-(--cui-color-text-default)">
                      {latestEntry.actor.name}
                    </span>
                    <CopyableMono
                      value={latestEntry.actor.id ?? ''}
                      ariaLabel={`Copy ${localize('com_admin_audit_detail_actor')} ID`}
                      onCopyFailed={onCopyFailed}
                    />
                  </div>
                </DetailRow>

                <DetailRow label={localize('com_admin_audit_detail_target')}>
                  <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-2">
                      <Badge
                        size="sm"
                        state="neutral"
                        text={
                          <span className="inline-flex items-center gap-1">
                            <Icon name={targetConfig.icon} size="xs" />
                            {localize(targetConfig.labelKey)}
                          </span>
                        }
                      />
                      <span className="text-sm font-medium text-(--cui-color-text-default)">
                        {targetLabel}
                      </span>
                    </span>
                    <CopyableMono
                      value={latestEntry.target.id ?? ''}
                      ariaLabel={`Copy ${localize('com_admin_audit_detail_target')} ID`}
                      onCopyFailed={onCopyFailed}
                    />
                  </div>
                </DetailRow>

                {grantee && (
                  <DetailRow label={localize('com_admin_audit_detail_grantee')}>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm text-(--cui-color-text-default)">
                        {grantee.type}
                      </span>
                      <CopyableMono
                        value={grantee.id}
                        ariaLabel={`Copy ${localize('com_admin_audit_detail_grantee')} ID`}
                        onCopyFailed={onCopyFailed}
                      />
                    </div>
                  </DetailRow>
                )}

                <DetailRow label={localize('com_admin_audit_detail_capability')}>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-(--cui-color-text-default)">{subject.label}</span>
                    <CopyableMono
                      value={subject.value}
                      ariaLabel={`Copy ${localize('com_admin_audit_detail_capability')}`}
                      onCopyFailed={onCopyFailed}
                    />
                  </div>
                </DetailRow>

                <DetailRow label={localize('com_admin_audit_detail_entry_id')}>
                  <CopyableMono
                    value={latestEntry.id}
                    ariaLabel={`Copy ${localize('com_admin_audit_detail_entry_id')}`}
                    onCopyFailed={onCopyFailed}
                  />
                </DetailRow>
              </dl>

              {hasDiff && (
                <div className="flex flex-col gap-3 border-t border-(--cui-color-stroke-default) pt-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <section className="flex flex-col gap-2">
                      <h3 className="text-xs font-semibold tracking-wide text-(--cui-color-text-muted) uppercase">
                        {localize('com_admin_audit_detail_before')}
                      </h3>
                      <DiffList items={before} variant="removed" localize={localize} />
                    </section>
                    <section className="flex flex-col gap-2">
                      <h3 className="text-xs font-semibold tracking-wide text-(--cui-color-text-muted) uppercase">
                        {localize('com_admin_audit_detail_after')}
                      </h3>
                      <DiffList items={after} variant="added" localize={localize} />
                    </section>
                  </div>
                </div>
              )}
            </div>
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-(--cui-color-stroke-default) px-4 py-3">
            <Button
              htmlType="button"
              type="secondary"
              iconLeft={copied ? 'check' : 'share'}
              label={
                copied
                  ? localize('com_admin_audit_detail_copied')
                  : localize('com_admin_audit_detail_copy_permalink')
              }
              onClick={() => void handleCopyPermalinkClick()}
            />
            <Button
              htmlType="button"
              type="primary"
              label={localize('com_admin_audit_detail_close')}
              onClick={onClose}
            />
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3">
      <dt className="text-xs font-medium tracking-wide text-(--cui-color-text-muted) uppercase">
        {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
