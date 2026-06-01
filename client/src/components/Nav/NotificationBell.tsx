import { useState, useRef, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useNewConvo } from '~/hooks';
import { clearMessagesCache } from '~/utils';
import useNotifications from '~/hooks/useNotifications';
import store from '~/store';

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const { notifications, unreadCount, markAsVisited, markAllVisited, fetchNotifications } =
    useNotifications();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { newConversation: newConvo } = useNewConvo();
  const { conversation } = store.useCreateConversationAtom(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Position the portal dropdown relative to the button
  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      bottom: window.innerHeight - rect.top + 8,
      left: rect.left,
      zIndex: 9999,
      width: '320px',
    });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) fetchNotifications();
  };

  const dropdown = open
    ? createPortal(
        <div
            ref={dropdownRef}
            style={dropdownStyle}
            className="rounded-xl border border-border-light bg-surface-primary shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
              <span className="text-sm font-semibold text-text-primary">Notifications</span>
              {unreadCount > 0 && (
                <button onClick={markAllVisited} className="text-xs text-blue-500 hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-text-secondary">
                  No notifications yet
                </div>
              ) : (
                notifications.map((n) => {
                  const isClickable = !!n.originalQuestion;
                  const displayText = n.message ?? n.originalQuestion ?? '';

                  return (
                    <div
                      key={n._id}
                      onClick={() => {
                        if (!isClickable) return;
                        markAsVisited(n._id);
                        setOpen(false);
                        clearMessagesCache(queryClient, conversation?.conversationId);
                        queryClient.invalidateQueries([QueryKeys.messages]);
                        newConvo();
                        navigate('/c/new', { state: { autoQuestion: n.originalQuestion } });
                      }}
                      className={`border-b border-border-light px-4 py-3 last:border-0 ${
                        isClickable ? 'cursor-pointer hover:bg-surface-active-alt' : 'cursor-default'
                      } ${!n.isVisited ? 'bg-surface-secondary' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        {!n.isVisited && (
                          <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                        )}
                        <div className={!n.isVisited ? '' : 'ml-4'}>
                          {n.message && (
                            <p className="mb-0.5 text-xs font-medium text-blue-500">
                              {n.type === "CUSTOM" ? "Alert" : "Info"}                         
                            </p>
                          )}
                          <p
                            className="line-clamp-2 text-sm text-text-primary"
                            title={displayText}
                          >
                            {displayText}
                          </p>
                          <p className="mt-1 text-xs text-text-secondary">
                            {new Date(n.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="flex-shrink-0">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-surface-active-alt"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5 text-text-primary" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {dropdown}
    </div>
  );
}

export default memo(NotificationBell);
