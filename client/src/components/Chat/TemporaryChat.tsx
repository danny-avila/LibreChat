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

/** Once the first message is sent the toggle retires, so the active mode still
 * needs a persistent, read-only cue in the header. */
export function TemporaryChatIndicator() {
  const localize = useLocalize();
  const { isActive } = useTemporaryChat();

  if (!isActive) {
    return null;
  }

  return (
    <div className="flex h-9 flex-shrink-0 items-center gap-1.5 rounded-xl border border-border-light bg-surface-tertiary px-2.5 text-xs font-medium text-text-secondary">
      <MessageCircleDashed className="size-4" aria-hidden="true" />
      <span className="max-md:sr-only">{localize('com_ui_temporary')}</span>
    </div>
  );
}
