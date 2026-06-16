import React from 'react';
import { useRecoilValue } from 'recoil';
import { TooltipAnchor } from '@librechat/client';
import { MessageCircleDashed } from 'lucide-react';
import { Constants } from 'librechat-data-provider';
import { useRecoilState, useRecoilCallback } from 'recoil';
import { isForcedTemporaryRetention } from 'librechat-data-provider';
import { useShortcutAriaKey, useShortcutHint } from '~/hooks/useKeyboardShortcuts';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

export function TemporaryChat() {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const [isTemporary, setIsTemporary] = useRecoilState(store.isTemporary);
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(0));
  const tooltipDescription = useShortcutHint('toggleTemporaryChat', localize('com_ui_temporary'));
  const ariaKey = useShortcutAriaKey('toggleTemporaryChat');

  const isEnforced = isForcedTemporaryRetention(startupConfig?.interface?.retentionMode);

  const handleBadgeToggle = useRecoilCallback(
    () => () => {
      if (isEnforced) {
        return;
      }
      setIsTemporary(!isTemporary);
    },
    [isTemporary, isEnforced],
  );

  const conversationId = conversation?.conversationId;
  const hasStarted = conversationId != null && conversationId !== Constants.NEW_CONVO;

  if (
    hasStarted ||
    (Array.isArray(conversation?.messages) && conversation.messages.length >= 1) ||
    isSubmitting
  ) {
    return null;
  }

  const isActive = isEnforced || isTemporary;
  const label = isEnforced ? localize('com_ui_temporary_enforced') : localize('com_ui_temporary');

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <TooltipAnchor
        description={isEnforced ? label : tooltipDescription}
        render={
          <button
            onClick={handleBadgeToggle}
            aria-label={label}
            aria-pressed={isActive}
            aria-disabled={isEnforced}
            aria-keyshortcuts={isEnforced ? undefined : ariaKey}
            className={cn(
              'inline-flex size-9 flex-shrink-0 items-center justify-center rounded-xl border border-border-light text-text-primary transition-all ease-in-out',
              isActive
                ? 'bg-surface-active'
                : 'bg-presentation shadow-sm hover:bg-surface-active-alt',
              isEnforced && 'cursor-not-allowed',
            )}
          >
            <MessageCircleDashed className="icon-md" aria-hidden="true" />
          </button>
        }
      />
    </div>
  );
}
