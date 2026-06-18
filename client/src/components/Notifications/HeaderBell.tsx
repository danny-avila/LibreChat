import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
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
const PANEL_ID = 'notification-panel';
const PANEL_TITLE_ID = 'notification-panel-title';
const UNREAD_LIST_ID = 'notification-unread-list';

const sidebarIconButtonClassName =
  'relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-surface-active-alt aria-[expanded=true]:bg-surface-active-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white';

const actionButtonClassName =
  'inline-flex min-h-9 cursor-pointer items-center rounded-md px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-white';

const linkIconButtonClassName =
  'absolute right-2 top-2 inline-flex min-h-9 min-w-9 items-center justify-center rounded-md p-1 text-text-primary transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white';

function resolvePopoverPlacement(
  panelSide: 'left' | 'right',
  panelDirection: 'up' | 'down',
): 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end' {
  if (panelDirection === 'up') {
    return panelSide === 'left' ? 'top-start' : 'top-end';
  }
  return panelSide === 'left' ? 'bottom-start' : 'bottom-end';
}

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
  titleId,
}: {
  notification: TNotification;
  onMarkRead: (id: string) => void;
  onOpenLink: (notification: TNotification) => void;
  isMarkingRead: boolean;
  titleId: string;
}) {
  const localize = useLocalize();
  const timestamp = formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true });
  const markAsReadLabel = localize('com_ui_mark_as_read');
  const openLinkLabel = localize('com_ui_notification_open_link');
  const hasLink = Boolean(notification.link);
  const readStateLabel = notification.read
    ? localize('com_ui_notification_read')
    : localize('com_ui_notification_unread');
  const typeLabel = `${readStateLabel}, ${notification.type}`;

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        'relative rounded-lg border px-3 py-2',
        notification.read
          ? 'border-transparent bg-transparent'
          : 'border-border-light bg-surface-hover',
      )}
    >
      <span className="sr-only">{typeLabel}</span>
      {hasLink ? (
        <button
          type="button"
          aria-label={openLinkLabel}
          className={linkIconButtonClassName}
          onClick={(e) => {
            e.stopPropagation();
            onOpenLink(notification);
          }}
        >
          <ExternalLink className="size-4" aria-hidden="true" />
        </button>
      ) : null}
      <div className="mb-1 flex items-center gap-2 pr-6">
        <span className="text-text-secondary" aria-hidden="true">
          {resolveTypeIcon(notification.type)}
        </span>
        <span
          id={titleId}
          className={cn(
            'line-clamp-1 text-sm text-text-primary',
            notification.read ? 'font-medium' : 'font-semibold',
          )}
        >
          {notification.title}
        </span>
      </div>
      <p className="line-clamp-2 text-xs text-text-secondary">{notification.message}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <span className="text-xs text-text-secondary">{timestamp}</span>
        {!notification.read ? (
          <button
            type="button"
            aria-label={markAsReadLabel}
            disabled={isMarkingRead}
            className={cn(actionButtonClassName, 'flex-shrink-0')}
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

function renderPanelBody({
  isLoading,
  hasNotifications,
  unread,
  read,
  localize,
  handleMarkRead,
  handleOpenLink,
  markReadMutation,
  cardIdPrefix,
}: {
  isLoading: boolean;
  hasNotifications: boolean;
  unread: TNotification[];
  read: TNotification[];
  localize: ReturnType<typeof useLocalize>;
  handleMarkRead: (id: string) => void;
  handleOpenLink: (notification: TNotification) => void;
  markReadMutation: ReturnType<typeof useMarkNotificationReadMutation>;
  cardIdPrefix: string;
}) {
  if (isLoading) {
    return <p className="px-2 py-3 text-sm text-text-secondary">{localize('com_ui_loading')}</p>;
  }

  if (!hasNotifications) {
    return (
      <p className="px-2 py-3 text-sm text-text-secondary">
        {localize('com_ui_notifications_empty')}
      </p>
    );
  }

  return (
    <>
      {unread.length > 0 ? (
        <div id={UNREAD_LIST_ID} role="list" aria-label={localize('com_ui_notification_unread')}>
          {unread.map((notification) => (
            <div key={notification.id} role="listitem">
              <NotificationCard
                notification={notification}
                onMarkRead={handleMarkRead}
                onOpenLink={handleOpenLink}
                isMarkingRead={
                  markReadMutation.isLoading && markReadMutation.variables === notification.id
                }
                titleId={`${cardIdPrefix}-unread-${notification.id}`}
              />
            </div>
          ))}
        </div>
      ) : null}
      {read.length > 0 ? (
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value={READ_SECTION_VALUE} className="border-none">
            <AccordionTrigger className="px-2 py-2 text-xs font-medium text-text-primary hover:no-underline">
              {localize('com_ui_notifications_read_section', { count: read.length })}
            </AccordionTrigger>
            <AccordionContent className="space-y-1 pb-0 pt-0">
              <div role="list" aria-label={localize('com_ui_notification_read')}>
                {read.map((notification) => (
                  <div key={notification.id} role="listitem">
                    <NotificationCard
                      notification={notification}
                      onMarkRead={handleMarkRead}
                      onOpenLink={handleOpenLink}
                      isMarkingRead={false}
                      titleId={`${cardIdPrefix}-read-${notification.id}`}
                    />
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}
    </>
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
  const cardIdPrefix = useId();
  const bellButtonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const unreadCount = useUnreadNotificationCount();
  const hasUnread = unreadCount > 0;
  const badgeCount = unreadCount > 99 ? '99+' : String(unreadCount);
  const markReadMutation = useMarkNotificationReadMutation();
  const markAllReadMutation = useMarkAllNotificationsReadMutation({
    onSuccess: () => {
      setAnnouncement(localize('com_ui_mark_all_as_read'));
    },
  });

  const popover = Ariakit.usePopoverStore({
    placement: resolvePopoverPlacement(panelSide, panelDirection),
    open: isOpen,
    setOpen: setIsOpen,
  });

  const { data: unreadData, isLoading: isUnreadLoading } = useNotificationsQuery(
    { unreadOnly: true, limit: 100 },
    {
      enabled: isOpen,
      refetchOnMount: true,
    },
  );

  const { data: recentData, isLoading: isRecentLoading } = useNotificationsQuery(
    { limit: 50 },
    {
      enabled: isOpen,
      refetchOnMount: true,
    },
  );

  const unread = useMemo(() => {
    const list = unreadData?.notifications ?? [];
    return [...list].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [unreadData?.notifications]);

  const read = useMemo(() => {
    const list = recentData?.notifications ?? [];
    return [...list]
      .filter((notification) => notification.read)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [recentData?.notifications]);

  const isLoading = isUnreadLoading || isRecentLoading;
  const hasNotifications = unread.length > 0 || read.length > 0;

  const label = hasUnread
    ? localize('com_ui_notifications_unread_count', { count: unreadCount })
    : localize('com_ui_notifications');

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (isLoading) {
      setAnnouncement(localize('com_ui_loading'));
      return;
    }
    if (!hasNotifications) {
      setAnnouncement(localize('com_ui_notifications_empty'));
    }
  }, [hasNotifications, isLoading, isOpen, localize]);

  const handleMarkRead = useCallback(
    (id: string) => {
      markReadMutation.mutate(id, {
        onSuccess: () => {
          setAnnouncement(localize('com_ui_mark_as_read'));
        },
      });
    },
    [localize, markReadMutation],
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

  return (
    <div className={className}>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
      <TooltipAnchor
        side="right"
        description={label}
        render={
          <Ariakit.PopoverDisclosure
            ref={bellButtonRef}
            store={popover}
            id="notification-bell-button"
            type="button"
            aria-label={label}
            aria-haspopup="dialog"
            aria-controls={PANEL_ID}
            className={sidebarIconButtonClassName}
          >
            <Bell className="h-5 w-5 text-text-primary" aria-hidden="true" />
            {hasUnread ? (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-700 px-1 text-center text-[10px] font-semibold leading-5 text-white dark:bg-red-600">
                {badgeCount}
              </span>
            ) : null}
          </Ariakit.PopoverDisclosure>
        }
      />
      <Ariakit.Popover
        store={popover}
        id={PANEL_ID}
        portal
        unmountOnHide
        gutter={8}
        shift={12}
        aria-labelledby={PANEL_TITLE_ID}
        finalFocus={bellButtonRef}
        className="notifications-popover popover-ui z-[125] w-[22rem] max-w-[calc(100vw-1.5rem)] rounded-xl border border-border-light p-3 shadow-xl outline-none"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <p id={PANEL_TITLE_ID} className="text-sm font-semibold text-text-primary">
            {localize('com_ui_notifications')}
          </p>
          {hasUnread ? (
            <button
              type="button"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isLoading}
              aria-busy={markAllReadMutation.isLoading}
              className={actionButtonClassName}
            >
              {localize('com_ui_mark_all_as_read')}
            </button>
          ) : null}
        </div>
        <div
          className="max-h-96 space-y-1 overflow-y-auto pr-1"
          role="region"
          aria-label={localize('com_ui_notifications')}
        >
          {renderPanelBody({
            isLoading,
            hasNotifications,
            unread,
            read,
            localize,
            handleMarkRead,
            handleOpenLink,
            markReadMutation,
            cardIdPrefix,
          })}
        </div>
      </Ariakit.Popover>
    </div>
  );
}
