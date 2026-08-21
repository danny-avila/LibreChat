import { memo } from 'react';
import { ScrollText } from 'lucide-react';
import { Button, Spinner } from '@librechat/client';
import { useCompactConversation, useLocalize } from '~/hooks';

/**
 * Manual context compaction, surfaced where the context usage is already read.
 * Summarizes the active branch and persists the summary as the boundary every
 * later turn starts from: the same contract automatic summarization writes.
 */
function CompactAction() {
  const localize = useLocalize();
  const { compact, canCompact, isCompacting } = useCompactConversation();

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant="outline"
        onClick={compact}
        disabled={!canCompact}
        aria-busy={isCompacting}
        className="h-8 w-full justify-center gap-2 text-sm"
      >
        {isCompacting ? (
          <Spinner className="size-4" />
        ) : (
          <ScrollText className="size-4" aria-hidden="true" />
        )}
        {isCompacting ? localize('com_ui_context_compacting') : localize('com_ui_context_compact')}
      </Button>
      <p className="text-xs text-text-secondary">{localize('com_ui_context_compact_info')}</p>
    </div>
  );
}

export default memo(CompactAction);
