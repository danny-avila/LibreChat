import React from 'react';
import { cn } from '~/utils';
import type { MouseEvent } from 'react';

interface ConvoLinkProps {
  conversationId: string | null;
  isActiveConvo: boolean;
  title: string | null;
  onNavigate: (ctrlOrMetaKey: boolean) => void;
  onRename: () => void;
  isSmallScreen: boolean;
  localize: (key: any, options?: any) => string;
  children: React.ReactNode;
}

const ConvoLink: React.FC<ConvoLinkProps> = ({
  conversationId,
  isActiveConvo,
  title,
  onNavigate,
  onRename,
  isSmallScreen,
  localize,
  children,
}) => {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    onNavigate(event.button === 0 && (event.ctrlKey || event.metaKey));
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      onNavigate(false);
    }
  };

  return (
    <a
      href={`/c/${conversationId}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex grow cursor-pointer items-center gap-2 overflow-hidden rounded-lg px-2',
        isActiveConvo ? 'bg-surface-active-alt' : '',
      )}
      title={title ?? undefined}
      aria-current={isActiveConvo ? 'page' : undefined}
      data-testid="convo-item"
      tabIndex={0}
    >
      {children}
      <div
        className="relative flex-1 grow overflow-hidden whitespace-nowrap"
        style={{ textOverflow: 'clip' }}
        onDoubleClick={(e) => {
          if (isSmallScreen) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          onRename();
        }}
        role="button"
        aria-label={isSmallScreen ? undefined : localize('com_ui_double_click_to_rename')}
      >
        {title || localize('com_ui_untitled')}
      </div>
      <div
        className={cn(
          'absolute bottom-0 right-0 top-0 w-20 rounded-r-lg bg-gradient-to-l',
          isActiveConvo
            ? 'from-surface-active-alt'
            : 'from-surface-primary-alt from-0% to-transparent group-hover:from-surface-active-alt group-hover:from-40%',
        )}
        aria-hidden="true"
      />
    </a>
  );
};

export default ConvoLink;
