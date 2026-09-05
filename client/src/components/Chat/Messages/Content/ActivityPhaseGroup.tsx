import { useId, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@librechat/client';
import { ContentTypes } from 'librechat-data-provider';
import { Check, ChevronDown, TriangleAlert } from 'lucide-react';
import type { TAttachment, TMessageContentParts } from 'librechat-data-provider';
import type { CSSProperties, ReactNode } from 'react';
import {
  useExpandCollapse,
  useLazyCollapseBody,
  scheduleMessageContentLayoutReconcile,
  EXPAND_TRANSITION,
} from '~/hooks';
import useSmoothStreaming from '~/hooks/Messages/useSmoothStreaming';
import { getActivityLabelText } from '~/utils/activityLabels';
import { ROW_GLYPH_SLOT, TOOL_ROW_CLASSES } from './rows';
import { AttachmentGroup } from './Parts';
import { cn } from '~/utils';

/** Matches `EXPAND_TRANSITION` so the panel and the label ticker resolve on
 *  the same curve — two properties animating on two different easings is what
 *  makes a fold read as two separate movements.
 *
 *  Written as an arbitrary PROPERTY, not `ease-[…]`: `tailwindcss-animate`
 *  registers its own `ease` utility for `animation-timing-function` alongside
 *  Tailwind's `transition-timing-function` one, so an arbitrary value matches
 *  both, and Tailwind resolves that ambiguity by emitting NOTHING. The class
 *  this replaces had been inert since the plugin landed — the curve it names
 *  never reached the fold. */
const FOLD_EASING = 'duration-300 [animation-timing-function:cubic-bezier(0.16,1,0.3,1)]';

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

/** The header's icon slot. Its only job is geometric: every other row in the
 *  transcript opens with the same glyph slot and an 8px gap, so a summary
 *  rendered without one sits to the left of the rows it replaces — the fold
 *  then moves its own text sideways at the moment the reader is trying to
 *  follow it. */
function PhaseGlyph({ failed }: { failed: boolean }) {
  const Icon = failed ? TriangleAlert : Check;
  return (
    <span
      className={cn(ROW_GLYPH_SLOT, failed ? 'text-text-warning' : 'text-text-secondary')}
      aria-hidden="true"
    >
      <Icon size={14} />
    </span>
  );
}

/**
 * The phase header is a ticker, not a title. A client-synthesized card
 * re-titles itself every time it absorbs another finished block, and swapping
 * that text instantly is what makes the absorbed row look like it simply
 * vanished from under the reader. The retired line rises out of the clipped
 * row while the new summary comes up from below, so the work visibly moves
 * into the line that now stands for it.
 */
function PhaseLabel({
  text,
  animate,
  failed,
}: {
  text: string;
  animate: boolean;
  failed: boolean;
}) {
  const [lines, setLines] = useState<{ current: string; retired: string | null; entered: boolean }>(
    { current: text, retired: null, entered: false },
  );

  /** Adjusted during render rather than in an effect. A passive effect runs
   *  after paint, so a swap with no animation would leave the previous summary
   *  on screen for a frame while the button's `aria-label` already carried the
   *  new one. React re-renders this component immediately instead. */
  if (lines.current !== text) {
    const swaps = animate && lines.current.length > 0;
    setLines({ current: text, retired: swaps ? lines.current : null, entered: swaps });
  }

  /** Clears only the retired line. `entered` outlives it on purpose: dropping
   *  the incoming line's animation class the moment its partner's
   *  `animationend` fires would snap a still-running slide back to its resting
   *  position. The class is inert once the animation has finished, and the
   *  element is keyed by its text, so it cannot replay. */
  const clearRetired = useCallback(() => {
    setLines((previous) => (previous.retired == null ? previous : { ...previous, retired: null }));
  }, []);

  return (
    <span
      className="tool-status-text relative block min-w-0 flex-1 overflow-hidden text-left"
      role="status"
      title={text}
    >
      {lines.retired != null && (
        <span
          key={`retired-${lines.retired}`}
          className={cn(
            'absolute inset-x-0 top-0 block truncate',
            'animate-out fade-out-0 slide-out-to-top-5 fill-mode-forwards',
            FOLD_EASING,
            failed && 'text-text-warning',
          )}
          onAnimationEnd={clearRetired}
          aria-hidden="true"
        >
          {lines.retired}
        </span>
      )}
      <span
        key={`current-${lines.current}`}
        className={cn(
          'block truncate',
          lines.entered && `animate-in fade-in-0 slide-in-from-bottom-5 ${FOLD_EASING}`,
          failed && 'text-text-warning',
        )}
      >
        {lines.current}
      </span>
    </span>
  );
}

export default function ActivityPhaseGroup({
  labelPart,
  children,
  hasContent,
  attachments,
  showCursor = false,
  animateEntrance = false,
  hasPendingApproval = false,
}: {
  labelPart: ActivityPhasePart;
  children: ReactNode;
  hasContent: boolean;
  /** Files the phase produced, lifted out of the fold by the parent renderer.
   *  A summary card is collapsed the moment it settles, so anything rendered
   *  inside it is, for most readers, not rendered at all — and a chart the run
   *  spent its turn producing is exactly what the reader came for. They ride
   *  their own row under the header instead, where the fold cannot take
   *  them. */
  attachments?: TAttachment[];
  showCursor?: boolean;
  animateEntrance?: boolean;
  hasPendingApproval?: boolean;
}) {
  const label = getActivityLabelText(labelPart);
  const hasFailure = labelPart.status === 'failed' || labelPart.status === 'partial';
  /** Already `smoothStreaming && !reducedMotion` — it owns the media query, so
   *  a second subscription here would install one `matchMedia` listener per
   *  phase card without changing the answer. */
  const smoothStreaming = useSmoothStreaming();
  /** Capture the marker's arrival state. The parent renderer records the new
   *  marker after this commit; a later sibling update must not cancel the
   *  already-scheduled fold before its first animation frame. */
  const [shouldAnimateEntrance] = useState(smoothStreaming && animateEntrance && label.length > 0);
  /** A filled phase marker lands on top of activity the reader is already
   *  looking at. The header therefore mounts at zero height with the panel
   *  open — the shape of what was there BEFORE it — and trades one for the
   *  other on the next painted frame. Growing the header while the panel
   *  collapses keeps the block's height strictly decreasing, so the content
   *  compresses upward instead of being shoved down by a header that appeared
   *  underneath it and then yanked back up. Those two grid rows are the ONLY
   *  properties in flight: the card chrome that used to fade in alongside
   *  them (border, background, padding, divider) is gone, and with it the
   *  sideways step its inset used to impose on every folded row. */
  const foldsIn = shouldAnimateEntrance && hasContent;
  const [isExpanded, setIsExpanded] = useState(foldsIn);
  const [isSettled, setIsSettled] = useState(!foldsIn);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();
  const cancelEntranceRef = useRef<(() => void) | null>(null);
  const cancelLayoutReconcileRef = useRef<(() => void) | null>(null);
  const previousIsExpandedRef = useRef(isExpanded);
  const userOverrideRef = useRef(false);
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
    userOverrideRef.current = true;
    cancelEntranceRef.current?.();
    cancelEntranceRef.current = null;
    mountBody();
    setIsSettled(true);
    setIsExpanded((expanded) => !expanded);
  }, [mountBody]);

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

  /** The live slot under a collapsed card alternates between this cursor and
   *  the next call's row for the rest of the run: a label fills, the row it
   *  headed folds into the card and the cursor takes its place; the next call
   *  starts and the cursor gives way to a row again. A cursor in a bare
   *  `Container` (20px, no margins) was 12px shorter than the tool row
   *  (`my-1.5 h-5`), so everything beneath the card stepped up on every
   *  absorb and back down on every call. The cursor takes the row's exact box,
   *  and the dot sits in the row's glyph slot — the in-flow variant, so the
   *  slot can center it, rather than `EmptyText`'s, which hangs the dot off a
   *  text line's baseline. */
  const cursor = showCursor ? (
    <div className={TOOL_ROW_CLASSES} data-testid="activity-phase-cursor">
      <span className={cn(ROW_GLYPH_SLOT, 'submitting')} aria-hidden="true">
        <span className="result-thinking result-thinking-inline block" />
      </span>
    </div>
  ) : null;
  const media =
    attachments != null && attachments.length > 0 ? (
      <AttachmentGroup attachments={attachments} />
    ) : null;
  if (!label) {
    return (
      <>
        {children}
        {media}
      </>
    );
  }
  const group = !hasContent ? (
    <div
      className={cn(
        'mb-2 mt-1 flex min-h-7 w-full items-center gap-2 py-1 text-text-secondary',
        shouldAnimateEntrance && `animate-in fade-in-0 motion-reduce:animate-none ${FOLD_EASING}`,
      )}
      data-testid="activity-phase-card"
    >
      <PhaseGlyph failed={hasFailure} />
      <span
        className={cn(
          'tool-status-text min-w-0 flex-1 truncate text-left font-medium',
          hasFailure && 'text-text-warning',
        )}
        role="status"
        title={label}
      >
        {label}
      </span>
    </div>
  ) : (
    /** No chrome. A phase summary is another row in the same list as the tool
     *  groups it stands for, so it carries the same geometry: 16px glyph, 8px
     *  gap, no inset. Boxing it was what put its text on a third left edge and
     *  forced every folded row 13px sideways as the box materialized. */
    <div className="mb-2 mt-1 w-full" ref={rootRef} data-testid="activity-phase-card">
      <div style={headerStyle}>
        <div className="overflow-hidden">
          <Button
            variant="ghost"
            type="button"
            /** `ring-inset` is not decoration: the clip above is permanent (the
             *  grid rows need it), so an outset ring would be drawn entirely
             *  outside the button's border box and clipped away, leaving
             *  keyboard users with no focus indicator. The ghost variant
             *  supplies it today; stating it here keeps the requirement with
             *  the element that depends on it. */
            className="inline-flex h-auto min-h-7 w-full items-center justify-start gap-2 rounded-none bg-transparent p-0 py-1 text-left font-medium text-text-secondary hover:bg-transparent hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-heavy focus-visible:ring-offset-0"
            onClick={handleToggle}
            aria-expanded={isExpanded}
            aria-controls={panelId}
            aria-label={label}
          >
            <PhaseGlyph failed={hasFailure} />
            <PhaseLabel text={label} failed={hasFailure} animate={smoothStreaming} />
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
            {children}
          </div>
        )}
      </div>
    </div>
  );
  return (
    <>
      {group}
      {media}
      {cursor}
    </>
  );
}
