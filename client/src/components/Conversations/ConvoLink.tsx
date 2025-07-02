import React from 'react';
import { PinIcon } from '~/components/svg';
import { cn } from '~/utils';

interface ConvoLinkProps {
  isActiveConvo: boolean;
  title: string | null;
  onRename: () => void;
  isSmallScreen: boolean;
  localize: (key: any, options?: any) => string;
  children: React.ReactNode;
  isPinned?: boolean;
}

const ConvoLink: React.FC<ConvoLinkProps> = ({
  isActiveConvo,
  title,
  onRename,
  isSmallScreen,
  localize,
  children,
  isPinned = false,
}) => {
  return (
    <div
      className={cn(
        'flex grow items-center gap-2 overflow-hidden rounded-lg px-2',
        isActiveConvo ? 'bg-surface-active-alt' : '',
      )}
      title={title ?? undefined}
      aria-current={isActiveConvo ? 'page' : undefined}
      style={{ width: '100%' }}
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
        aria-label={isSmallScreen ? undefined : title || localize('com_ui_untitled')}
      >
        <div className="flex items-center gap-1">
          {title || localize('com_ui_untitled')}
          {isPinned && (
            <div className="flex-shrink-0">
              <PinIcon className="icon-xs text-text-secondary fill-current" />
            </div>
          )}
        </div>
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
    </div>
  );
};

export default ConvoLink;
