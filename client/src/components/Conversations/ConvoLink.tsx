import React from 'react';
import { cn } from '~/utils';

interface ConvoLinkProps {
  isActiveConvo: boolean;
  isPopoverActive: boolean;
  isSharedBadgeVisible: boolean;
  title: string | null;
  onRename: () => void;
  isSmallScreen: boolean;
  localize: (key: any, options?: any) => string;
  children: React.ReactNode;
}

const ConvoLink: React.FC<ConvoLinkProps> = ({
  isActiveConvo,
  isPopoverActive,
  isSharedBadgeVisible,
  title,
  onRename,
  isSmallScreen,
  localize,
  children,
}) => {
  return (
    <button
      type="button"
      className={cn(
        'flex min-w-0 grow cursor-pointer items-center gap-2 overflow-hidden rounded-lg px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-primary',
        isActiveConvo || isPopoverActive ? 'bg-surface-active-alt' : '',
      )}
      title={title ?? undefined}
      aria-current={isActiveConvo ? 'page' : undefined}
      aria-label={
        isSharedBadgeVisible
          ? localize('com_ui_conversation_label_shared', {
              title: title || localize('com_ui_untitled'),
            })
          : localize('com_ui_conversation_label', {
              title: title || localize('com_ui_untitled'),
            })
      }
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
      >
        {title || localize('com_ui_untitled')}
        <div
          className={cn(
            'pointer-events-none absolute bottom-0 right-0 top-0 w-20 bg-gradient-to-l',
            isActiveConvo || isPopoverActive
              ? 'from-surface-active-alt'
              : 'from-surface-primary-alt from-0% to-transparent group-hover:from-surface-active-alt group-hover:from-0%',
          )}
          aria-hidden="true"
        />
      </div>
    </button>
  );
};

export default ConvoLink;
