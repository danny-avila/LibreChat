import { memo, useEffect, useRef, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { TooltipAnchor } from '@librechat/client';
import { ListTodo, Maximize2, Minimize2, Square, X } from 'lucide-react';
import useBackgroundTasks from './useTasks';
import { useLocalize } from '~/hooks';
import Section from './Section';
import TaskCard from './Card';
import { cn } from '~/utils';

const TICK_MS = 1_000;

const iconButtonClass =
  'flex size-7 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary disabled:pointer-events-none disabled:opacity-50';

/** Header control listing the conversation's background tools and subagents. */
function BackgroundTasksButton({
  conversationId,
  isSubmitting,
}: {
  conversationId: string;
  isSubmitting: boolean;
}) {
  const localize = useLocalize();
  const popover = Ariakit.usePopoverStore({ placement: 'bottom-end' });
  const open = Ariakit.useStoreState(popover, 'open');
  const disclosureRef = useRef<HTMLButtonElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const [wide, setWide] = useState(false);
  const view = useBackgroundTasks({ conversationId, isSubmitting, now });
  const { rows, activeCount } = view;

  useEffect(() => {
    if (!open || activeCount === 0) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [open, activeCount]);

  if (rows.length === 0) {
    return null;
  }

  const title = localize('com_ui_background_tasks');
  const triggerLabel =
    activeCount > 0 ? localize('com_ui_background_tasks_label', { 0: activeCount }) : title;
  const running = rows.filter((row) => row.status === 'running' || row.status === 'stopping');
  const finished = rows.filter((row) => row.status !== 'running' && row.status !== 'stopping');
  const anyStoppable = running.some(view.canStop);
  const stopAllLabel = anyStoppable
    ? localize('com_ui_background_tasks_stop_all')
    : localize('com_ui_background_tasks_cancel_disabled');
  const card = (row: (typeof rows)[number]) => (
    <TaskCard
      key={row.id}
      row={row}
      now={now}
      canStop={view.canStop(row)}
      isStopping={view.isStopping}
      onStop={view.stop}
    />
  );

  return (
    <>
      <TooltipAnchor
        description={triggerLabel}
        render={
          <Ariakit.PopoverDisclosure
            ref={disclosureRef}
            store={popover}
            aria-label={triggerLabel}
            data-testid="header-background-tasks-button"
            className="relative inline-flex size-9 flex-shrink-0 items-center justify-center rounded-xl border border-border-light bg-presentation text-text-primary transition-all ease-in-out hover:bg-surface-tertiary aria-expanded:bg-surface-tertiary"
          >
            <ListTodo className="icon-md" aria-hidden="true" />
            {activeCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 size-2 animate-pulse rounded-full bg-status-info ring-2 ring-presentation motion-reduce:animate-none"
              />
            )}
          </Ariakit.PopoverDisclosure>
        }
      />
      <Ariakit.Popover
        store={popover}
        gutter={8}
        portal
        unmountOnHide
        finalFocus={disclosureRef}
        aria-label={title}
        className={cn(
          'z-[200] flex max-h-[min(36rem,calc(100vh-5rem))] max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-border-medium bg-surface-secondary text-text-primary shadow-lg focus:outline-none',
          wide ? 'w-[36rem]' : 'w-80',
        )}
      >
        <div className="flex items-center gap-1 px-3 pb-2 pt-3">
          <Ariakit.PopoverHeading className="flex-1 text-sm font-semibold">
            {title}
          </Ariakit.PopoverHeading>
          <button
            type="button"
            aria-label={localize(wide ? 'com_ui_collapse' : 'com_ui_expand')}
            aria-pressed={wide}
            onClick={() => setWide((value) => !value)}
            className={cn(iconButtonClass, 'max-sm:hidden')}
          >
            {wide ? (
              <Minimize2 className="size-4" aria-hidden="true" />
            ) : (
              <Maximize2 className="size-4" aria-hidden="true" />
            )}
          </button>
          <Ariakit.PopoverDismiss aria-label={localize('com_ui_close')} className={iconButtonClass}>
            <X className="size-4" aria-hidden="true" />
          </Ariakit.PopoverDismiss>
        </div>
        <div className="space-y-4 overflow-y-auto px-3 pb-3">
          {running.length > 0 && (
            <Section
              label={localize('com_ui_background_tasks_running')}
              count={running.length}
              action={
                <TooltipAnchor
                  description={stopAllLabel}
                  render={
                    <button
                      type="button"
                      aria-label={stopAllLabel}
                      disabled={!anyStoppable || view.isStopping}
                      onClick={() => void view.stopAll()}
                      data-testid="background-tasks-stop-all"
                      className={cn(iconButtonClass, 'border border-border-medium')}
                    >
                      <Square className="size-3 fill-current" aria-hidden="true" />
                    </button>
                  }
                />
              }
            >
              {running.map(card)}
            </Section>
          )}
          {finished.length > 0 && (
            <Section label={localize('com_ui_background_tasks_finished')} count={finished.length}>
              {finished.map(card)}
            </Section>
          )}
        </div>
      </Ariakit.Popover>
    </>
  );
}

export default memo(BackgroundTasksButton);
