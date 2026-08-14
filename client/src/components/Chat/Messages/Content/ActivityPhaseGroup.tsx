import { useId, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@librechat/client';
import { ChevronDown, ListTree } from 'lucide-react';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { useExpandCollapse, scheduleMessageContentLayoutReconcile } from '~/hooks';
import useSmoothStreaming from '~/hooks/Messages/useSmoothStreaming';
import { getActivityLabelText } from '~/utils/activityLabels';
import { EmptyText } from './Parts';
import Container from './Container';
import { cn } from '~/utils';

type ActivityPhasePart = Extract<TMessageContentParts, { type: ContentTypes.ACTIVITY_LABEL }> & {
  activity_label_type?: 'phase';
  activity_start_index?: number;
  activity_end_index?: number;
};

export default function ActivityPhaseGroup({
  labelPart,
  children,
  hasContent,
  showCursor = false,
  animateEntrance = false,
}: {
  labelPart: ActivityPhasePart;
  children: ReactNode;
  hasContent: boolean;
  showCursor?: boolean;
  animateEntrance?: boolean;
}) {
  const label = getActivityLabelText(labelPart);
  const hasFailure = labelPart.status === 'failed' || labelPart.status === 'partial';
  const smoothStreaming = useSmoothStreaming();
  /** Capture the marker's arrival state. The parent renderer records the new
   *  marker after this commit; a later sibling update must not cancel the
   *  already-scheduled compression before its first animation frame. */
  const [shouldAnimateEntrance] = useState(
    smoothStreaming && animateEntrance && label.length > 0,
  );
  /** A newly filled phase replaces activity that was already visible in the
   *  transcript. Keep that content in place for the first painted frame,
   *  then compress it into the summary instead of replacing it with a closed
   *  disclosure in one jarring cut. Historical phases remain closed. */
  const [isExpanded, setIsExpanded] = useState(shouldAnimateEntrance && hasContent);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();
  const collapseFrameRef = useRef<number>();
  const cancelLayoutReconcileRef = useRef<(() => void) | null>(null);
  const previousIsExpandedRef = useRef(isExpanded);
  const userOverrideRef = useRef(false);
  const { style: expandStyle, ref: expandRef } = useExpandCollapse(isExpanded);

  useEffect(() => {
    if (!shouldAnimateEntrance || !hasContent || userOverrideRef.current) {
      return;
    }
    collapseFrameRef.current = window.requestAnimationFrame(() => {
      collapseFrameRef.current = undefined;
      if (!userOverrideRef.current) {
        setIsExpanded(false);
      }
    });
    return () => {
      if (collapseFrameRef.current != null) {
        window.cancelAnimationFrame(collapseFrameRef.current);
        collapseFrameRef.current = undefined;
      }
    };
  }, [shouldAnimateEntrance, hasContent]);

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
    if (collapseFrameRef.current != null) {
      window.cancelAnimationFrame(collapseFrameRef.current);
      collapseFrameRef.current = undefined;
    }
    setIsExpanded((expanded) => !expanded);
  }, []);
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
        'my-2 flex min-h-10 w-full items-center gap-2 rounded-lg border border-border-light bg-surface-secondary/40 px-3 py-2 text-text-secondary',
        shouldAnimateEntrance &&
          'duration-300 animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none',
      )}
    >
      <ListTree
        className={cn('size-4 shrink-0', hasFailure && 'text-text-warning')}
        aria-hidden="true"
      />
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-sm font-medium',
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
      className="my-2 w-full rounded-lg border border-border-light bg-surface-secondary/40"
      ref={rootRef}
    >
      <Button
        variant="ghost"
        type="button"
        className={cn(
          'flex h-auto min-h-10 w-full items-center justify-start gap-2 rounded-lg bg-transparent px-3 py-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring-primary focus-visible:ring-offset-0',
          shouldAnimateEntrance &&
            'duration-300 animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none',
        )}
        onClick={handleToggle}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        aria-label={label}
        title={label}
      >
        <ListTree
          className={cn('size-4 shrink-0', hasFailure && 'text-text-warning')}
          aria-hidden="true"
        />
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm font-medium',
            hasFailure && 'text-text-warning',
          )}
          role="status"
        >
          {label}
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 transition-transform duration-200 ease-out',
            isExpanded && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </Button>
      <div
        id={panelId}
        style={expandStyle}
        aria-hidden={!isExpanded}
        data-testid="activity-phase-panel"
      >
        <div className="overflow-hidden" ref={expandRef}>
          <div className="border-t border-border-light px-3 py-2">{children}</div>
        </div>
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
