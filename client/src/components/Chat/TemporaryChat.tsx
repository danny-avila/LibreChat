import React from 'react';
import { motion } from 'framer-motion';
import { MessageCircleDashed } from 'lucide-react';
import { useRecoilState, useRecoilCallback } from 'recoil';
import { TooltipAnchor } from '~/components/ui';
import { useChatContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

export function TemporaryChat() {
  const localize = useLocalize();
  const [isTemporary, setIsTemporary] = useRecoilState(store.isTemporary);
  const { conversation, isSubmitting } = useChatContext();

  const temporaryBadge = {
    id: 'temporary',
    icon: MessageCircleDashed,
    label: 'com_ui_temporary' as const,
    atom: store.isTemporary,
    isAvailable: true,
  };

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
        description={localize(temporaryBadge.label)}
        render={
          <button
            onClick={handleBadgeToggle}
            aria-label={localize(temporaryBadge.label)}
            className={cn(
              'inline-flex size-10 flex-shrink-0 items-center justify-center rounded-xl border border-border-light text-text-primary transition-all ease-in-out hover:bg-surface-tertiary',
              isTemporary
                ? 'bg-surface-active shadow-md'
                : 'bg-transparent shadow-sm hover:bg-surface-hover hover:shadow-md',
              'active:shadow-inner',
            )}
          >
            {temporaryBadge.icon && (
              <temporaryBadge.icon
                className={cn('relative h-5 w-5 md:h-4 md:w-4', !temporaryBadge.label && 'mx-auto')}
              />
            )}
          </button>
        }
      />
    </div>
  );
}
