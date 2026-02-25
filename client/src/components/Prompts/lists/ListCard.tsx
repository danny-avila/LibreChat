import React from 'react';
import { Label } from '@librechat/client';
import CategoryIcon from '../utils/CategoryIcon';
import { useLocalize } from '~/hooks';

export default function ListCard({
  category,
  name,
  snippet,
  onClick,
  children,
  icon,
}: {
  category: string;
  name: string;
  snippet: string;
  onClick?: () => void;
  children?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const localize = useLocalize();

  const ariaLabel = category
    ? localize('com_ui_prompt_group_button', { name, category })
    : localize('com_ui_prompt_group_button_no_category', { name });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onClick || e.target !== e.currentTarget) {
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className="relative flex w-full cursor-pointer flex-col gap-2 rounded-xl px-3 pb-4 pt-3 text-start align-top text-[15px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={ariaLabel}
      aria-describedby={`card-snippet-${name}`}
    >
      <div className="flex w-full justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-row items-center gap-2 overflow-hidden">
          <CategoryIcon category={category} className="icon-md shrink-0" aria-hidden="true" />
          <Label
            id={`card-title-${name}`}
            className="min-w-0 select-none truncate text-sm font-semibold text-text-primary"
            title={name}
          >
            {name}
          </Label>
          {icon}
        </div>
        <div className="relative z-10">{children}</div>
      </div>
      <div
        id={`card-snippet-${name}`}
        className="ellipsis max-w-full select-none text-balance pt-1 text-sm text-text-secondary"
      >
        {snippet}
      </div>
    </div>
  );
}
