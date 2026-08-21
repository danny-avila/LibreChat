import { memo } from 'react';
import { ScrollText } from 'lucide-react';
import { Button, Spinner } from '@librechat/client';
import { useLocalize } from '~/hooks';

interface CompactActionProps {
  compact: () => void;
  canCompact: boolean;
  isCompacting: boolean;
}

/**
 * Manual context compaction, surfaced where the context usage is already read.
 * Summarizes the active branch and persists the summary as the boundary every
 * later turn starts from: the same contract automatic summarization writes.
 *
 * Presentational on purpose. The popover unmounts on hide, so the mutation it
 * drives lives in the always-mounted indicator above; owning it here would
 * drop the in-flight observer (and its toast) the moment the pointer leaves,
 * and re-render an enabled button over a compaction that is still running.
 */
function CompactAction({ compact, canCompact, isCompacting }: CompactActionProps) {
  const localize = useLocalize();

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
