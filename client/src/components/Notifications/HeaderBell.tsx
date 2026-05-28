import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Content, Portal, Root, Trigger } from '@radix-ui/react-popover';
import { Bell, BellDot, ExternalLink, Megaphone, ShieldAlert } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  TooltipAnchor,
} from '@librechat/client';
import type { TNotification } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import {
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotificationsQuery,
  useUnreadNotificationCount,
} from '~/data-provider';
import { cn } from '~/utils';

const READ_SECTION_VALUE = 'read-notifications';

const markReadButtonClass =
  'cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60';

const linkIconButtonClass =
  'absolute right-2 top-2 rounded-md p-1 text-text-secondary transition-colors hover:bg-surface-hover';

function resolveTypeIcon(type: TNotification['type']) {
  if (type === 'announcement') {
    return <Megaphone className="size-4" aria-hidden="true" />;
  }
  if (type === 'system') {
    return <ShieldAlert className="size-4" aria-hidden="true" />;
  }
  return <BellDot className="size-4" aria-hidden="true" />;
}

function NotificationCard({
  notification,
  onMarkRead,
  onOpenLink,
  isMarkingRead,
}: {
  notification: TNotification;
  onMarkRead: (id: string) => void;
  onOpenLink: (notification: TNotification) => void;
  isMarkingRead: boolean;
}) {
  const localize = useLocalize();
  const timestamp = formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true });
  const markAsReadLabel = localize('com_ui_mark_as_read');
  const openLinkLabel = localize('com_ui_notification_open_link');
  const hasLink = Boolean(notification.link);

  return (
    <article
      className={cn(
        'relative rounded-lg border px-3 py-2',
        notification.read
          ? 'border-transparent bg-transparent'
          : 'border-border-light bg-surface-hover',
      )}
    >
      {hasLink ? (
        <TooltipAnchor
          description={openLinkLabel}
          side="left"
          render={
            <button
              type="button"
              aria-label={openLinkLabel}
              className={linkIconButtonClass}
              onClick={(e) => {
                e.stopPropagation();
                onOpenLink(notification);
              }}
            >
              <ExternalLink className="size-4" aria-hidden="true" />
            </button>
          }
        />
      ) : null}
      <div className="mb-1 flex items-center gap-2 pr-6">
        <span className="text-text-secondary">{resolveTypeIcon(notification.type)}</span>
        <span
          className={cn(
            'line-clamp-1 text-sm',
            notification.read ? 'font-medium text-text-primary' : 'font-semibold text-text-primary',
          )}
        >
          {notification.title}
        </span>
      </div>
      <p className="line-clamp-2 text-xs text-text-secondary">{notification.message}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <span className="text-[11px] text-text-tertiary">{timestamp}</span>
        {!notification.read ? (
          <button
            type="button"
            aria-label={markAsReadLabel}
            disabled={isMarkingRead}
            className={cn(markReadButtonClass, 'flex-shrink-0')}
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead(notification.id);
            }}
          >
            {markAsReadLabel}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export default function HeaderBell({
  className,
  panelSide = 'right',
  panelDirection = 'down',
}: {
  className?: string;
  panelSide?: 'left' | 'right';
  panelDirection?: 'up' | 'down';
}) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = useUnreadNotificationCount();
  const hasUnread = unreadCount > 0;
  const badgeCount = unreadCount > 99 ? '99+' : String(unreadCount);
  const markReadMutation = useMarkNotificationReadMutation();
  const markAllReadMutation = useMarkAllNotificationsReadMutation();
  const { data, isLoading } = useNotificationsQuery(
    { limit: 50 },
    {
      enabled: isOpen,
      refetchOnMount: true,
    },
  );

  const { unread, read } = useMemo(() => {
    const list = data?.notifications ?? [];
    const sorted = [...list].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    const unreadList: TNotification[] = [];
    const readList: TNotification[] = [];
    for (const notification of sorted) {
      if (notification.read) {
        readList.push(notification);
      } else {
        unreadList.push(notification);
      }
    }
    return { unread: unreadList, read: readList };
  }, [data?.notifications]);

  const hasNotifications = unread.length > 0 || read.length > 0;

  const label = hasUnread
    ? localize('com_ui_notifications_unread_count', { count: unreadCount })
    : localize('com_ui_notifications');

  const handleMarkRead = useCallback(
    (id: string) => {
      markReadMutation.mutate(id);
    },
    [markReadMutation],
  );

  const handleOpenLink = useCallback(
    (notification: TNotification) => {
      const link = notification.link;
      if (!link) {
        return;
      }

      setIsOpen(false);
      if (link.startsWith('http://') || link.startsWith('https://')) {
        window.location.assign(link);
        return;
      }
      navigate(link);
    },
    [navigate],
  );

  const popoverSide = panelDirection === 'up' ? 'top' : 'bottom';
  const popoverAlign = panelSide === 'left' ? 'start' : 'end';

  return (
    <Root open={isOpen} onOpenChange={setIsOpen}>
      <div className={className}>
        <TooltipAnchor
          description={label}
          render={
            <Trigger asChild>
              <button
                id="notification-bell-button"
                type="button"
                aria-label={label}
                aria-expanded={isOpen}
                className="relative inline-flex size-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border-light bg-presentation text-text-primary shadow-sm transition-all ease-in-out hover:bg-surface-active-alt"
              >
                <Bell className="icon-md" aria-hidden="true" />
                {hasUnread ? (
                  <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-5 text-white">
                    {badgeCount}
                  </span>
                ) : null}
              </button>
            </Trigger>
          }
        />
        <Portal>
          <Content
            side={popoverSide}
            align={popoverAlign}
            sideOffset={8}
            collisionPadding={12}
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="z-[125] w-[22rem] max-w-[calc(100vw-1.5rem)] rounded-xl border border-border-light bg-surface-primary p-3 shadow-xl outline-none"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-text-primary">
                {localize('com_ui_notifications')}
              </p>
              {hasUnread ? (
                <button
                  type="button"
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isLoading}
                  className={markReadButtonClass}
                >
                  {localize('com_ui_mark_all_as_read')}
                </button>
              ) : null}
            </div>
            <div className="max-h-96 space-y-1 overflow-y-auto pr-1">
              {isLoading ? (
                <p className="px-2 py-3 text-sm text-text-secondary">
                  {localize('com_ui_loading')}
                </p>
              ) : !hasNotifications ? (
                <p className="px-2 py-3 text-sm text-text-secondary">
                  {localize('com_ui_notifications_empty')}
                </p>
              ) : (
                <>
                  {unread.map((notification) => (
                    <NotificationCard
                      key={notification.id}
                      notification={notification}
                      onMarkRead={handleMarkRead}
                      onOpenLink={handleOpenLink}
                      isMarkingRead={
                        markReadMutation.isLoading &&
                        markReadMutation.variables === notification.id
                      }
                    />
                  ))}
                  {read.length > 0 ? (
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value={READ_SECTION_VALUE} className="border-none">
                        <AccordionTrigger className="px-2 py-2 text-xs font-medium text-text-secondary hover:no-underline">
                          {localize('com_ui_notifications_read_section', { count: read.length })}
                        </AccordionTrigger>
                        <AccordionContent className="space-y-1 pb-0 pt-0">
                          {read.map((notification) => (
                            <NotificationCard
                              key={notification.id}
                              notification={notification}
                              onMarkRead={handleMarkRead}
                              onOpenLink={handleOpenLink}
                              isMarkingRead={false}
                            />
                          ))}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  ) : null}
                </>
              )}
            </div>
          </Content>
        </Portal>
      </div>
    </Root>
  );
}
