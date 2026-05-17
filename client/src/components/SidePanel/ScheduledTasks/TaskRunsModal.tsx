import { useCallback, useMemo } from 'react';
import throttle from 'lodash/throttle';
import { CalendarClock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, Spinner } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useConversationsInfiniteQuery, useGetEndpointsQuery } from '~/data-provider';
import EndpointIcon from '~/components/Endpoints/EndpointIcon';

interface TaskRunsModalProps {
  taskId: string;
  /** Optional human label (task name / model) shown as a subtitle. */
  taskName?: string;
  isOpen: boolean;
  onClose: () => void;
}

/** Distance from the bottom (px) at which we trigger the next-page fetch. */
const LOAD_MORE_THRESHOLD_PX = 64;

function formatRunTimestamp(value?: string | Date) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function TaskRunsModal({ taskId, taskName, isOpen, onClose }: TaskRunsModalProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { data: endpointsConfig } = useGetEndpointsQuery();

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

  const conversations = data?.pages.flatMap((page) => page.conversations) || [];

  const openConvo = (conversationId?: string | null) => {
    if (!conversationId) return;
    navigate(`/c/${conversationId}`);
    onClose();
  };

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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>{localize('com_sidepanel_task_runs')}</DialogTitle>
          {taskName && <span className="text-sm text-text-secondary">{taskName}</span>}
        </DialogHeader>

        <div className="mt-4 flex-1 overflow-y-auto" onScroll={handleScroll}>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-text-secondary">
              {localize('com_ui_loading')}
            </div>
          ) : conversations.length === 0 ? (
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
            <div className="flex flex-col gap-0.5">
              {conversations.map((convo) => {
                const timestamp = formatRunTimestamp(convo.updatedAt ?? convo.createdAt);
                const title = convo.title || localize('com_ui_new_chat');
                return (
                  <div
                    key={convo.conversationId}
                    role="button"
                    tabIndex={0}
                    onClick={() => openConvo(convo.conversationId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openConvo(convo.conversationId);
                      }
                    }}
                    className="group flex h-12 w-full cursor-pointer items-center gap-2 rounded-lg px-2 outline-none hover:bg-surface-active-alt focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white md:h-10"
                    aria-label={title}
                  >
                    <EndpointIcon
                      conversation={convo}
                      endpointsConfig={endpointsConfig}
                      size={20}
                      context="menu-item"
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm text-text-primary">{title}</span>
                      {timestamp && (
                        <span className="truncate text-xs text-text-secondary">{timestamp}</span>
                      )}
                    </div>
                  </div>
                );
              })}
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
