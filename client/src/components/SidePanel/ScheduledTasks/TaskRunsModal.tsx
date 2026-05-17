import { useCallback, useMemo } from 'react';
import throttle from 'lodash/throttle';
import { CalendarClock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, Spinner } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useConversationsInfiniteQuery } from '~/data-provider';
import Convo from '~/components/Conversations/Convo';
import { DateLabel } from '~/components/Conversations/Conversations';
import { groupConversationsByDate } from '~/utils';

interface TaskRunsModalProps {
  taskId: string;
  /** Optional human label (task name / model) shown as a subtitle. */
  taskName?: string;
  isOpen: boolean;
  onClose: () => void;
}

/** Distance from the bottom (px) at which we trigger the next-page fetch. */
const LOAD_MORE_THRESHOLD_PX = 64;

export default function TaskRunsModal({ taskId, taskName, isOpen, onClose }: TaskRunsModalProps) {
  const localize = useLocalize();

  const {
    data,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useConversationsInfiniteQuery(
    { taskId, includeScheduled: true },
    { enabled: isOpen && !!taskId },
  );

  const conversations = useMemo(
    () => data?.pages.flatMap((page) => page.conversations) ?? [],
    [data?.pages],
  );

  const groupedConversations = useMemo(
    () => groupConversationsByDate(conversations),
    [conversations],
  );

  const throttledFetchNextPage = useMemo(
    () => throttle(() => fetchNextPage(), 300, { trailing: false }),
    [fetchNextPage],
  );

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (!hasNextPage || isFetchingNextPage) return;
      const el = e.currentTarget;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom <= LOAD_MORE_THRESHOLD_PX) {
        throttledFetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, throttledFetchNextPage],
  );

  /**
   * `Convo` calls `toggleNav()` before navigating; we hijack that callback to
   * close the modal so opening a run feels like opening a chat from the
   * sidebar. `retainView` is the sidebar's "move-to-top" callback, irrelevant
   * here — query refetch handles ordering on next open.
   */
  const handleConvoToggle = useCallback(() => {
    onClose();
  }, [onClose]);
  const handleRetainView = useCallback(() => {}, []);

  const isEmpty = !isLoading && conversations.length === 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>{localize('com_sidepanel_task_runs')}</DialogTitle>
          {taskName && <span className="text-sm text-text-secondary">{taskName}</span>}
        </DialogHeader>

        <div className="mt-4 flex-1 overflow-y-auto px-3 pb-3" onScroll={handleScroll}>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-text-secondary">
              {localize('com_ui_loading')}
            </div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="rounded-full bg-surface-secondary p-3 text-text-secondary">
                <CalendarClock className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="text-sm font-medium text-text-primary">
                {localize('com_sidepanel_no_runs')}
              </div>
              <p className="max-w-xs text-xs text-text-secondary">
                {localize('com_sidepanel_no_runs_description')}
              </p>
            </div>
          ) : (
            <div className="flex flex-col text-sm text-text-primary">
              {groupedConversations.map(([groupName, convos], groupIndex) => (
                <div key={groupName} className="flex flex-col">
                  <DateLabel groupName={groupName} isFirst={groupIndex === 0} />
                  {convos.map((convo) => (
                    <Convo
                      key={convo.conversationId}
                      conversation={convo}
                      retainView={handleRetainView}
                      toggleNav={handleConvoToggle}
                      menuClassName="z-[1100]"
                    />
                  ))}
                </div>
              ))}
              {isFetchingNextPage && (
                <div className="flex items-center justify-center gap-2 py-3 text-xs text-text-secondary">
                  <Spinner className="h-3.5 w-3.5 text-text-primary" />
                  <span className="animate-pulse">{localize('com_ui_loading')}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
