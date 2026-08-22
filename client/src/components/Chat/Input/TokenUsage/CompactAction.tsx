import { memo, useId } from 'react';
import { ScrollText } from 'lucide-react';
import { Button, Spinner, TooltipAnchor } from '@librechat/client';
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
  const descriptionId = useId();
  const description = localize('com_ui_context_compact_info');

  return (
    <>
      <TooltipAnchor
        side="bottom"
        description={description}
        render={
          <Button
            type="button"
            variant="outline"
            onClick={compact}
            disabled={!canCompact}
            aria-busy={isCompacting}
            aria-describedby={descriptionId}
            className="h-8 w-full justify-center gap-2 text-sm"
          >
            {isCompacting ? (
              <Spinner className="size-4" />
            ) : (
              <ScrollText className="size-4" aria-hidden="true" />
            )}
            {isCompacting
              ? localize('com_ui_context_compacting')
              : localize('com_ui_context_compact')}
          </Button>
        }
      />
      {/* Ariakit's tooltip anchor sets no `aria-describedby`, and the tooltip
          exists only while hovered, so the copy stays reachable here. */}
      <span id={descriptionId} className="sr-only">
        {description}
      </span>
    </>
  );
}

export default memo(CompactAction);
