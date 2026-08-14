import { TooltipAnchor, NewChatIcon } from '@librechat/client';
import { useShortcutAriaKey, useShortcutHint } from '~/hooks/useKeyboardShortcuts';
import useNewChat from '~/hooks/Chat/useNewChat';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/**
 * Header entry point for starting a new conversation. Renders as an anchor so
 * modified clicks still open `/c/new` in a new tab; `useNewChat` claims only
 * plain left clicks.
 */
export default function NewChat({ className }: { className?: string }) {
  const localize = useLocalize();
  const { handleNewChatClick } = useNewChat();
  const tooltipDescription = useShortcutHint('newChat', localize('com_ui_new_chat'));
  const ariaKey = useShortcutAriaKey('newChat');

  return (
    <TooltipAnchor
      description={tooltipDescription}
      render={
        <a
          href="/c/new"
          data-testid="header-new-chat-button"
          aria-label={localize('com_ui_new_chat')}
          aria-keyshortcuts={ariaKey}
          className={cn(
            'inline-flex size-9 flex-shrink-0 items-center justify-center rounded-xl border border-border-light bg-presentation text-text-primary transition-colors hover:bg-surface-active-alt',
            className,
          )}
          onClick={handleNewChatClick}
        >
          <NewChatIcon className="icon-md" aria-hidden="true" />
        </a>
      }
    />
  );
}
