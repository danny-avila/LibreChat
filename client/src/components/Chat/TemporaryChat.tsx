import React from 'react';
import { useRecoilValue } from 'recoil';
import { TooltipAnchor } from '@librechat/client';
import { MessageCircleDashed } from 'lucide-react';
import { useRecoilState, useRecoilCallback } from 'recoil';
import { useShortcutAriaKey, useShortcutHint } from '~/hooks/useKeyboardShortcuts';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

export function TemporaryChat() {
  const localize = useLocalize();
  const [isTemporary, setIsTemporary] = useRecoilState(store.isTemporary);
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(0));
  const tooltipDescription = useShortcutHint('toggleTemporaryChat', localize('com_ui_temporary'));
  const ariaKey = useShortcutAriaKey('toggleTemporaryChat');

  const handleBadgeToggle = useRecoilCallback(
    () => () => {
      setIsTemporary(!isTemporary);
    },
    [isTemporary],
  );

  if (
    (Array.isArray(conversation?.messages) && conversation.messages.length >= 1) ||
    isSubmitting
  ) {
    return null;
  }

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <TooltipAnchor
        description={tooltipDescription}
        render={
          <button
            onClick={handleBadgeToggle}
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
