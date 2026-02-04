import React, { useCallback, useRef } from 'react';
import { Clock4 } from 'lucide-react';
import { cn } from '~/utils';

export interface MentionItemProps {
  name: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  index: number;
  type?: 'prompt' | 'mention' | 'add-convo';
  icon?: React.ReactNode;
  isActive?: boolean;
  description?: string;
  style?: React.CSSProperties;
}

export default function MentionItem({
  name,
  onClick,
  index,
  icon,
  isActive,
  description,
  style,
  type = 'mention',
}: MentionItemProps) {
  const touchHandled = useRef(false);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLButtonElement>) => {
      e.preventDefault();
      touchHandled.current = true;
      onClick(e as unknown as React.MouseEvent<HTMLButtonElement>);
    },
    [onClick],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (touchHandled.current) {
        touchHandled.current = false;
        return;
      }
      onClick(e);
    },
    [onClick],
  );

  return (
    <button
      tabIndex={index}
      onClick={handleClick}
      onTouchEnd={handleTouchEnd}
      id={`${type}-item-${index}`}
      className="w-full touch-manipulation"
      style={style}
    >
      <div
        className={cn(
          'text-token-text-primary bg-token-main-surface-secondary group flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm font-medium hover:bg-surface-secondary active:bg-surface-active',
          isActive === true ? 'bg-surface-active' : 'bg-transparent',
        )}
      >
        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">{icon}</div>
        <div className="flex min-w-0 flex-grow items-center justify-between">
          <div className="truncate">
            <span className="font-medium">{name}</span>
            {description != null && description ? (
              <span className="text-token-text-tertiary ml-2 text-sm font-light">
                {description}
              </span>
            ) : null}
          </div>
          <Clock4 size={16} className="ml-2 flex-shrink-0" />
        </div>
      </div>
    </button>
  );
}
