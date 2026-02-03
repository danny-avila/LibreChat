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
  onClick?: React.MouseEventHandler<HTMLDivElement | HTMLButtonElement>;
  children?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const localize = useLocalize();
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement | HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick?.(event as unknown as React.MouseEvent<HTMLDivElement | HTMLButtonElement>);
    }
  };

  return (
    <div
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className="relative flex w-full cursor-pointer flex-col gap-2 rounded-xl px-3 pb-4 pt-3 text-start align-top text-[15px]"
      role="button"
      tabIndex={0}
      aria-labelledby={`card-title-${name}`}
      aria-describedby={`card-snippet-${name}`}
      aria-label={`${name} Prompt, ${category ? `${localize('com_ui_category')}: ${category}` : ''}`}
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
        <div>{children}</div>
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
