import { useId, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@librechat/client';
import { ChevronDown } from 'lucide-react';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';
import type { CSSProperties, ReactNode } from 'react';
import type { ToolCallGroupExpansionState } from './ToolCallGroup';
import {
  useExpandCollapse,
  useLazyCollapseBody,
  scheduleMessageContentLayoutReconcile,
  EXPAND_TRANSITION,
} from '~/hooks';
import useSmoothStreaming from '~/hooks/Messages/useSmoothStreaming';
import { getActivityLabelText } from '~/utils/activityLabels';
import { EmptyText } from './Parts';
import Container from './Container';
import { cn } from '~/utils';

/** Matches `EXPAND_TRANSITION` so the header, the panel, and the card chrome
 *  all resolve on the same curve — three properties animating on two different
 *  easings is what makes a fold read as two separate movements. */
const FOLD_EASING = 'duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none';

type ActivityPhasePart = Extract<TMessageContentParts, { type: ContentTypes.ACTIVITY_LABEL }> & {
  activity_label_type?: 'phase';
  activity_start_index?: number;
  activity_end_index?: number;
};

/**
 * Runs `callback` once the browser has painted the current styles. One frame
 * is not enough: React can flush passive effects before paint, and a start
 * value the compositor never saw produces an instant jump rather than a
 * transition. Returns a canceller for whichever frame is still pending.
 */
function schedulePostPaint(callback: () => void): () => void {
  let frameId: number | undefined;
  frameId = window.requestAnimationFrame(() => {
    frameId = window.requestAnimationFrame(() => {
      frameId = undefined;
      callback();
    });
  });
  return () => {
    if (frameId != null) {
      window.cancelAnimationFrame(frameId);
      frameId = undefined;
    }
  };
}

export default function ActivityPhaseGroup({
  labelPart,
  children,
  hasContent,
  showCursor = false,
  animateEntrance = false,
  hasPendingApproval = false,
  initialExpansionState,
  onExpansionChange,
}: {
  labelPart: ActivityPhasePart;
  children: ReactNode;
  hasContent: boolean;
  showCursor?: boolean;
  animateEntrance?: boolean;
  hasPendingApproval?: boolean;
  /** Message-wide toggle memory, shared with `ToolCallGroup`. A synthesized
   *  card is replaced by the real phase card once the run's summary lands,
   *  and a reader who opened the ticker to watch must not have it snap shut
   *  underneath them by that swap. */
  initialExpansionState?: ToolCallGroupExpansionState;
  onExpansionChange?: (state: ToolCallGroupExpansionState) => void;
}) {
  const label = getActivityLabelText(labelPart);
  const hasFailure = labelPart.status === 'failed' || labelPart.status === 'partial';
  const smoothStreaming = useSmoothStreaming();
  /** Capture the marker's arrival state. The parent renderer records the new
   *  marker after this commit; a later sibling update must not cancel the
   *  already-scheduled fold before its first animation frame. */
  const [shouldAnimateEntrance] = useState(smoothStreaming && animateEntrance && label.length > 0);
  const restoredExpansion =
    initialExpansionState?.userOverride === true ? initialExpansionState : null;
  /** A filled phase marker lands on top of activity the reader is already
   *  looking at. The card therefore mounts in the shape of what was there
   *  BEFORE it — header at zero height, panel open, chrome transparent — and
   *  folds into the summary on the next painted frame. Growing the header
   *  while the panel collapses keeps the block's height strictly decreasing,
   *  so the content compresses upward instead of being shoved down by a
   *  header that appeared underneath it and then yanked back up.
   *
   *  A restored toggle skips it: that fold is the reader's own decision about
   *  a card they have already watched arrive. */
  const foldsIn = shouldAnimateEntrance && hasContent && restoredExpansion == null;
  const [isExpanded, setIsExpanded] = useState(restoredExpansion?.isExpanded ?? foldsIn);
  const [isSettled, setIsSettled] = useState(!foldsIn);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();
  const cancelEntranceRef = useRef<(() => void) | null>(null);
  const cancelLayoutReconcileRef = useRef<(() => void) | null>(null);
  const previousIsExpandedRef = useRef(isExpanded);
  const userOverrideRef = useRef(restoredExpansion != null);
  const { style: expandStyle, ref: expandRef } = useExpandCollapse(isExpanded);
  /** A phase label can resolve while an approval card inside it is still
   *  pending (see ApprovalContext), and ToolApproval owns unsent local
   *  edit/respond/reason state — so a collapsed phase retains its body until
   *  every nested approval resolves, exactly like ToolCallGroup. */
  const { shouldRenderBody, mountBody, handleTransitionEnd } = useLazyCollapseBody(
    isExpanded,
    hasPendingApproval,
  );

  useEffect(() => {
    if (!foldsIn || userOverrideRef.current) {
      return;
    }
    cancelEntranceRef.current = schedulePostPaint(() => {
      cancelEntranceRef.current = null;
      if (userOverrideRef.current) {
        return;
      }
      setIsSettled(true);
      setIsExpanded(false);
    });
    return () => {
      cancelEntranceRef.current?.();
      cancelEntranceRef.current = null;
    };
  }, [foldsIn]);

  useEffect(() => {
    const wasExpanded = previousIsExpandedRef.current;
    previousIsExpandedRef.current = isExpanded;
    if (wasExpanded && !isExpanded) {
      cancelLayoutReconcileRef.current?.();
      cancelLayoutReconcileRef.current = scheduleMessageContentLayoutReconcile(rootRef.current);
    }
  }, [isExpanded]);

  useEffect(
    () => () => {
      cancelLayoutReconcileRef.current?.();
    },
    [],
  );

  const handleToggle = useCallback(() => {
    const nextExpanded = !isExpanded;
    userOverrideRef.current = true;
    cancelEntranceRef.current?.();
    cancelEntranceRef.current = null;
    mountBody();
    setIsSettled(true);
    setIsExpanded(nextExpanded);
    onExpansionChange?.({ isExpanded: nextExpanded, userOverride: true });
  }, [isExpanded, mountBody, onExpansionChange]);

  /** Only the folding entrance drives the header off its natural height.
   *  History and reduced-motion render the plain, unstyled row. */
  const headerStyle = useMemo<CSSProperties | undefined>(() => {
    if (!foldsIn) {
      return undefined;
    }
    return {
      display: 'grid',
      gridTemplateRows: isSettled ? '1fr' : '0fr',
      transition: EXPAND_TRANSITION,
      opacity: isSettled ? 1 : 0,
    };
  }, [foldsIn, isSettled]);

  const cursor = showCursor ? (
    <Container>
      <EmptyText />
    </Container>
  ) : null;
  if (!label) {
    return <>{children}</>;
  }
  const group = !hasContent ? (
    <div
      className={cn(
        'my-2 flex min-h-10 w-full items-center rounded-lg border border-border-light bg-surface-secondary/40 px-3 py-2 text-text-secondary',
        shouldAnimateEntrance && `animate-in fade-in-0 motion-reduce:animate-none ${FOLD_EASING}`,
      )}
    >
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-left text-sm font-medium',
          hasFailure && 'text-text-warning',
        )}
        role="status"
        title={label}
      >
        {label}
      </span>
    </div>
  ) : (
    <div
      className={cn(
        'my-2 w-full rounded-lg border transition-colors',
        FOLD_EASING,
        isSettled ? 'border-border-light bg-surface-secondary/40' : 'border-transparent',
      )}
      ref={rootRef}
    >
      <div style={headerStyle}>
        <div className="overflow-hidden">
          <Button
            variant="ghost"
            type="button"
            className="flex h-auto min-h-10 w-full items-center justify-start gap-2 rounded-lg bg-transparent px-3 py-2 text-left text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring-primary focus-visible:ring-offset-0"
            onClick={handleToggle}
            aria-expanded={isExpanded}
            aria-controls={panelId}
            aria-label={label}
            title={label}
          >
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-left text-sm font-medium',
                hasFailure && 'text-text-warning',
              )}
              role="status"
            >
              {label}
            </span>
            <ChevronDown
              className={cn(
                'size-4 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none',
                isExpanded && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </Button>
        </div>
      </div>
      <div
        id={panelId}
        style={expandStyle}
        onTransitionEnd={handleTransitionEnd}
        aria-hidden={!isExpanded}
        data-testid="activity-phase-panel"
      >
        {shouldRenderBody && (
          <div className="overflow-hidden" ref={expandRef}>
            {/** Padding and the divider ride the same curve as the fold: the
             *   children occupy the exact position they held before the marker
             *   arrived and settle into the card as it materializes, instead of
             *   stepping sideways by the card's inset on the first frame. */}
            <div
              className={cn(
                'border-t transition-[border-color,padding]',
                FOLD_EASING,
                isSettled ? 'border-border-light px-3 py-2' : 'border-transparent px-0 py-0',
              )}
            >
              {children}
            </div>
          </div>
        )}
      </div>
    </div>
  );
  return (
    <>
      {group}
      {cursor}
    </>
  );
}
