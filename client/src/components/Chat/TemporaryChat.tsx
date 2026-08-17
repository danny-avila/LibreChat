import { TooltipAnchor } from '@librechat/client';
import { MessageCircleDashed } from 'lucide-react';
import { useShortcutAriaKey, useShortcutHint } from '~/hooks/useKeyboardShortcuts';
import useTemporaryChat from '~/hooks/Chat/useTemporaryChat';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export function TemporaryChat() {
  const localize = useLocalize();
  const { show, isTemporary, toggle } = useTemporaryChat();
  const tooltipDescription = useShortcutHint('toggleTemporaryChat', localize('com_ui_temporary'));
  const ariaKey = useShortcutAriaKey('toggleTemporaryChat');

  if (!show) {
    return null;
  }

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <TooltipAnchor
        description={tooltipDescription}
        render={
          <button
            onClick={toggle}
            aria-label={localize('com_ui_temporary')}
            aria-pressed={isTemporary}
            aria-keyshortcuts={ariaKey}
            className={cn(
              'inline-flex size-9 flex-shrink-0 items-center justify-center rounded-xl border border-border-light text-text-primary transition-all ease-in-out',
              isTemporary
                ? 'bg-surface-active'
                : 'bg-presentation shadow-sm hover:bg-surface-active-alt',
            )}
          >
            <MessageCircleDashed className="icon-md" aria-hidden="true" />
          </button>
        }
      />
    </div>
  );
}
