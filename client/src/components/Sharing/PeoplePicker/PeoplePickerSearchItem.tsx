import React, { forwardRef } from 'react';
import { PrincipalType } from 'librechat-data-provider';
import type { TPrincipal } from 'librechat-data-provider';
import PrincipalAvatar from '~/components/Sharing/PrincipalAvatar';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface PeoplePickerSearchItemProps extends React.HTMLAttributes<HTMLDivElement> {
  principal: TPrincipal;
}

const PeoplePickerSearchItem = forwardRef<HTMLDivElement, PeoplePickerSearchItemProps>(
  function PeoplePickerSearchItem(
    { principal, className, style, onClick, ...props },
    forwardedRef,
  ) {
    const localize = useLocalize();
    const { name, email, type } = principal;

    const displayName = name || localize('com_ui_unknown');
    const subtitle = email || `${type} (${principal.source || 'local'})`;

    /** Semantic series roles rather than palette hues, so the dot moves with the
     *  theme. The series slots are contracted as marks at 3:1, so the hue rides
     *  on a leading dot and the 12px label stays on `text-secondary` at 4.5:1. */
    const getBadgeConfig = () => {
      switch (type) {
        case PrincipalType.USER:
          return {
            dotClassName: 'bg-series-1',
            label: localize('com_ui_user'),
          };
        case PrincipalType.GROUP:
          return {
            dotClassName: 'bg-series-7',
            label: localize('com_ui_group'),
          };
        case PrincipalType.ROLE:
          return {
            dotClassName: 'bg-series-6',
            label: localize('com_ui_role'),
          };
        default:
          return {
            dotClassName: undefined,
            label: type,
          };
      }
    };

    const badgeConfig = getBadgeConfig();

    return (
      <div
        {...props}
        ref={forwardedRef}
        className={cn('flex items-center gap-3 p-2', className)}
        style={style}
        onClick={(event) => {
          onClick?.(event);
        }}
      >
        <PrincipalAvatar principal={principal} size="md" />

        <div className="min-w-0 flex-1">
          <div className="text-text-primary truncate text-sm font-medium">{displayName}</div>
          <div className="text-text-secondary truncate text-xs">{subtitle}</div>
        </div>

        <div className="shrink-0">
          <span className="text-text-secondary inline-flex items-center gap-1.5 text-xs font-medium">
            {badgeConfig.dotClassName != null && (
              <span
                aria-hidden="true"
                className={cn('size-2 shrink-0 rounded-full', badgeConfig.dotClassName)}
              />
            )}
            {badgeConfig.label}
          </span>
        </div>
      </div>
    );
  },
);

export default PeoplePickerSearchItem;
