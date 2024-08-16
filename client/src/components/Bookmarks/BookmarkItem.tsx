import { useState } from 'react';
import { BookmarkFilledIcon, BookmarkIcon } from '@radix-ui/react-icons';
import type { FC } from 'react';
import { Spinner } from '~/components/svg';
import { cn } from '~/utils';

type MenuItemProps = {
  tag: string | React.ReactNode;
  selected: boolean;
  ctx: 'header' | 'nav';
  count?: number;
  handleSubmit: (tag: string) => Promise<void>;
  icon?: React.ReactNode;
  highlightSelected?: boolean;
};

const BookmarkItem: FC<MenuItemProps> = ({
  tag,
  ctx,
  selected,
  count,
  handleSubmit,
  icon,
  highlightSelected,
  ...rest
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const clickHandler = async () => {
    setIsLoading(true);
    await handleSubmit(tag as string);
    setIsLoading(false);
  };

  const breakWordStyle: React.CSSProperties = {
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
  };

  const renderIcon = () => {
    if (icon) {
      return icon;
    }
    if (isLoading) {
      return <Spinner className="size-4" />;
    }
    if (selected) {
      return <BookmarkFilledIcon className="size-4" />;
    }
    return <BookmarkIcon className="size-4" />;
  };

  const ariaLabel =
    ctx === 'header' ? `${selected ? 'Remove' : 'Add'} bookmark for ${tag}` : (tag as string);

  return (
    <button
      aria-label={ariaLabel}
      role="menuitem"
      className={cn(
        'group m-1.5 flex w-[225px] cursor-pointer gap-2 rounded bg-transparent px-2 py-2.5 !pr-3 text-sm !opacity-100 focus:ring-0 radix-disabled:pointer-events-none radix-disabled:opacity-50',
        highlightSelected && selected ? 'bg-surface-secondary' : '',
        ctx === 'header' ? 'hover:bg-header-hover' : 'hover:bg-surface-hover',
      )}
      tabIndex={-1}
      {...rest}
      onClick={clickHandler}
    >
      <div className="flex grow items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {renderIcon()}
          <div style={breakWordStyle}>{tag}</div>
        </div>

        {count !== undefined && (
          <div className="flex items-center justify-end">
            <span
              className="ml-auto w-7 min-w-max whitespace-nowrap rounded-md bg-surface-secondary px-2.5 py-0.5 text-center text-xs font-medium leading-5 text-text-secondary"
              aria-hidden="true"
            >
              {count}
            </span>
          </div>
        )}
      </div>
    </button>
  );
};

export default BookmarkItem;
