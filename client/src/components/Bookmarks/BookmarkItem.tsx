import { useState } from 'react';
import { BookmarkFilledIcon, BookmarkIcon } from '@radix-ui/react-icons';
import type { FC } from 'react';
import { Spinner } from '~/components/svg';
import { cn } from '~/utils';

type MenuItemProps = {
  tag: string | React.ReactNode;
  selected: boolean;
  count?: number;
  handleSubmit: (tag: string) => Promise<void>;
  icon?: React.ReactNode;
  highlightSelected?: boolean;
};

const BookmarkItem: FC<MenuItemProps> = ({
  tag,
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

  return (
    <div
      role="menuitem"
      className={cn(
        'group m-1.5 flex w-[225px] cursor-pointer gap-2 rounded px-2 py-2.5 !pr-3 text-sm !opacity-100 focus:ring-0 radix-disabled:pointer-events-none radix-disabled:opacity-50',
        'hover:bg-black/5 dark:hover:bg-white/5',
        highlightSelected && selected && 'bg-black/5 dark:bg-white/5',
      )}
      tabIndex={-1}
      {...rest}
      onClick={clickHandler}
    >
      <div className="flex grow items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon ? (
            icon
          ) : isLoading ? (
            <Spinner className="size-4" />
          ) : selected ? (
            <BookmarkFilledIcon className="size-4" />
          ) : (
            <BookmarkIcon className="size-4" />
          )}
          <div style={breakWordStyle}>{tag}</div>
        </div>

        {count !== undefined && (
          <div className="flex items-center justify-end">
            <span
              className={cn(
                'ml-auto w-7 min-w-max whitespace-nowrap rounded-md bg-white px-2.5 py-0.5 text-center text-xs font-medium leading-5 text-gray-600',
                'dark:bg-gray-800 dark:text-white',
              )}
              aria-hidden="true"
            >
              {count}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
export default BookmarkItem;
