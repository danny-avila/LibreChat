import React from 'react';
import { motion } from 'framer-motion';
import { MessageCircleDashed } from 'lucide-react';
import { useRecoilState, useRecoilValue, useRecoilCallback } from 'recoil';
import type { LucideIcon } from 'lucide-react';
import { Badge, TooltipAnchor } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

export function TemporaryChat() {
  const localize = useLocalize();
  const [isTemporary, setIsTemporary] = useRecoilState(store.isTemporary);
  const isEditing = useRecoilValue(store.isEditingBadges);

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

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <div className="badge-icon h-full">
        <TooltipAnchor
          description={localize(temporaryBadge.label)}
          render={
            <motion.button
              onClick={handleBadgeToggle}
              className={cn(
                'group relative inline-flex items-center gap-1.5 rounded-full px-4 py-1.5',
                'border border-border-medium text-sm font-medium transition-shadow md:w-full',
                'size-9 p-2 md:p-3',
                isTemporary
                  ? 'bg-surface-active shadow-md'
                  : 'bg-surface-transparent shadow-sm hover:bg-surface-hover hover:shadow-md',
                'active:scale-95 active:shadow-inner',
              )}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'tween', duration: 0.1, ease: 'easeOut' }}
            >
              {temporaryBadge.icon && (
                <temporaryBadge.icon
                  className={cn(
                    'relative h-5 w-5 md:h-4 md:w-4',
                    !temporaryBadge.label && 'mx-auto',
                  )}
                />
              )}
            </motion.button>
          }
        />
      </div>
    </div>
  );
}
