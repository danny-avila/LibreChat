import { useRef } from 'react';
import type * as t from '~/admin/types';
import { useLocalize, useToastClearance } from '~/admin/hooks';
import { StickyActionBar } from '~/admin/components/shared';

/**
 * The unsaved-changes bar (WS7): how many changes Save would write and on
 * which tabs, with Review and Discard (which offers Undo). Shown on every
 * tab, read-only ones included, while edits are pending.
 */
export function ChangesBar({ review }: t.ChangesBarProps) {
  if (!review.isDirty) return null;
  return <ShownChangesBar review={review} />;
}

function ShownChangesBar({ review }: t.ChangesBarProps) {
  const localize = useLocalize();
  const barRef = useRef<HTMLDivElement>(null);
  useToastClearance(barRef);
  const { count, tabTitles } = review.model;
  const message =
    count === 0 ? (
      <span className="text-(--cui-color-text-muted)">
        {localize('com_admin_config_review_bar_none')}
      </span>
    ) : (
      <>
        <span className="font-medium">{localize('com_admin_config_review_bar', { count })}</span>
        {tabTitles.length > 0 && (
          <span className="hidden text-(--cui-color-text-muted) sm:inline">
            {' '}
            · {tabTitles.join(', ')}
          </span>
        )}
      </>
    );
  return (
    <div ref={barRef} className="shrink-0">
      <StickyActionBar
        label={localize('com_admin_config_unsaved_changes')}
        message={message}
        discardLabel={localize('com_admin_config_discard')}
        saveLabel={localize('com_admin_config_review_bar_review')}
        onDiscard={review.discardAll}
        onSave={review.openReview}
      />
    </div>
  );
}
