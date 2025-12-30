import React from 'react';
import { TooltipAnchor } from '@librechat/client';
import { Brain } from 'lucide-react';
import { useRecoilState, useRecoilCallback } from 'recoil';
import { useChatContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

export function DeepResearchChat() {
  const localize = useLocalize();
  const [isDeepResearch, setIsDeepResearch] = useRecoilState(store.isDeepResearch);
  const { conversation, isSubmitting } = useChatContext();

  const deepResearchBadge = {
    id: 'deepResearch',
    icon: Brain,
    label: 'com_ui_deepResearch' as const,
    atom: store.isDeepResearch,
    isAvailable: true,
  };

  const handleBadgeToggle = useRecoilCallback(
    () => () => {
      setIsDeepResearch(!isDeepResearch);
    },
    [isDeepResearch],
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
        description={localize(deepResearchBadge.label)}
        render={
          <button
            onClick={handleBadgeToggle}
            aria-label={localize(deepResearchBadge.label)}
            aria-pressed={isDeepResearch}
            className={cn(
              'inline-flex size-10 flex-shrink-0 items-center justify-center rounded-xl border border-border-light text-text-primary transition-all ease-in-out hover:bg-surface-tertiary',
              isDeepResearch
                ? 'bg-surface-active shadow-md'
                : 'bg-transparent shadow-sm hover:bg-surface-hover hover:shadow-md',
              'active:shadow-inner',
            )}
          >
            {deepResearchBadge.icon && (
              <deepResearchBadge.icon
                className={cn(
                  'relative h-5 w-5 md:h-4 md:w-4',
                  !deepResearchBadge.label && 'mx-auto',
                )}
                aria-hidden="true"
              />
            )}
          </button>
        }
      />
    </div>
  );
}
