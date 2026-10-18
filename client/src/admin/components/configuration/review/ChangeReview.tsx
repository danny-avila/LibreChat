import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import type * as t from '~/admin/types';
import { CloseButton } from '~/admin/components/shared';
import { getScopeTypeConfig } from '~/admin/constants';
import { Button, Icon, Link } from '~/admin/ui';
import { useLocalize } from '~/admin/hooks';
import { ReviewList } from './ReviewList';
import { scopeTypeLabel } from './group';
import { cn } from '~/admin/utils';

function ScopeChip({ scope }: { scope?: t.ConfigScope }) {
  const localize = useLocalize();
  const config = getScopeTypeConfig(scope?.principalType ?? 'BASE');
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-(--cui-color-stroke-default) px-2 py-0.5 text-xs font-medium text-(--cui-color-text-default)">
      <span aria-hidden="true" className={cn('flex', config.colorClass)}>
        <Icon name={config.icon} size="xs" />
      </span>
      <span className="truncate">
        {scope
          ? `${scopeTypeLabel(scope, localize)}: ${scope.name}`
          : localize('com_admin_config_review_base_chip')}
      </span>
    </span>
  );
}

function IssueList({
  title,
  issues,
  onGoTo,
  footer,
}: {
  title: string;
  issues: t.ReviewIssue[];
  onGoTo: (issue: t.ReviewIssue) => void;
  /** A way out shown inside the alert (sign in again after the session ended). */
  footer?: ReactNode;
}) {
  const localize = useLocalize();
  const first = issues.find((issue) => issue.path);
  return (
    <div role="alert" className="bg-status-error-subtle flex flex-col gap-2 rounded-lg px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 text-sm font-medium text-(--cui-color-text-danger)">{title}</p>
        {first && (
          <button
            type="button"
            onClick={() => onGoTo(first)}
            className="shrink-0 cursor-pointer rounded px-1.5 py-0.5 text-xs font-medium text-(--cui-color-text-danger) underline-offset-2 hover:underline"
          >
            {localize('com_admin_config_review_jump_first')}
          </button>
        )}
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs text-(--cui-color-text-danger)">
        {issues.map((issue, i) => (
          <li key={`${issue.path ?? ''}:${i}`} className="wrap-anywhere">
            {issue.label && <span className="font-medium">{issue.label}: </span>}
            {issue.message}
          </li>
        ))}
      </ul>
      {footer}
    </div>
  );
}

/**
 * The change review drawer (WS7): what Save writes to the open target,
 * grouped tab › section › entry, with BEFORE → AFTER, the value a reset
 * reverts to, masked secrets, warnings and problems. Save stays disabled
 * while pre-flight problems exist.
 */
export function ChangeReview({ review }: t.ChangeReviewProps) {
  const localize = useLocalize();
  const { model, open, saving, blocked } = review;
  const blocking = model.issues.filter((issue) => issue.blocking);
  const isEmpty = model.count === 0;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !saving) review.closeReview();
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
          className={cn(
            'fixed top-0 right-0 z-(--z-overlay) flex h-full w-full flex-col bg-(--cui-color-background-panel) shadow-xl sm:w-xl',
            'border-l border-(--cui-color-stroke-default)',
            'will-change-transform',
            'data-[state=closed]:animate-(--admin-drawer-out) data-[state=open]:animate-(--admin-drawer-in) motion-reduce:animate-none',
          )}
        >
          <header className="flex items-start justify-between gap-3 border-b border-(--cui-color-stroke-default) px-4 py-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Dialog.Title className="m-0 text-base font-semibold text-(--cui-color-text-default)">
                {review.title}
              </Dialog.Title>
              <div className="flex flex-wrap items-center gap-2">
                <ScopeChip scope={review.scope} />
              </div>
              <Dialog.Description className="m-0 text-xs text-(--cui-color-text-muted)">
                {review.scope
                  ? localize('com_admin_config_review_scope_affects', {
                      type: scopeTypeLabel(review.scope, localize).toLowerCase(),
                      name: review.scope.name,
                    })
                  : localize('com_admin_config_review_base_affects')}
              </Dialog.Description>
            </div>
            <CloseButton
              label={localize('com_admin_config_review_close')}
              onClick={review.closeReview}
              disabled={saving}
            />
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
            {blocking.length > 0 && (
              <IssueList
                title={localize('com_admin_config_review_issues', { count: blocking.length })}
                issues={blocking}
                onGoTo={review.goToRow}
              />
            )}
            {review.saveIssues.length > 0 && (
              <IssueList
                title={localize('com_admin_config_review_save_failed')}
                issues={review.saveIssues}
                onGoTo={review.goToRow}
                footer={
                  review.sessionExpired ? (
                    <Link href="/login" target="_blank" rel="noopener" size="sm" weight="medium">
                      {localize('com_admin_config_session_sign_in')}
                    </Link>
                  ) : undefined
                }
              />
            )}
            {isEmpty && (
              <p className="m-0 text-sm text-(--cui-color-text-muted)">
                {localize('com_admin_config_review_none')}
              </p>
            )}
            <ReviewList
              tabs={model.tabs}
              isScope={review.scope != null}
              onRevert={review.revertRow}
              onGoTo={review.goToRow}
            />
            {model.skipped.length > 0 && (
              <div className="rounded-lg border border-(--cui-color-stroke-default) px-3 py-2 text-xs text-(--cui-color-text-muted)">
                <p className="m-0 mb-1 font-medium text-(--cui-color-text-default)">
                  {localize('com_admin_config_review_skipped_title', {
                    count: model.skipped.length,
                  })}
                </p>
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                  {model.skipped.map((skip) => (
                    <li key={skip.key} className="wrap-anywhere">
                      <span className="text-(--cui-color-text-default)">{skip.label}</span>:{' '}
                      {skip.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-(--cui-color-stroke-default) px-4 py-3">
            <Button
              htmlType="button"
              type="secondary"
              label={localize('com_admin_ui_cancel')}
              onClick={review.closeReview}
              disabled={saving}
            />
            <Button
              htmlType="button"
              type="primary"
              label={
                saving
                  ? localize('com_admin_config_review_saving')
                  : localize('com_admin_config_review_save')
              }
              onClick={() => void review.confirm()}
              disabled={saving || blocked}
            />
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
