import { Column } from '@tanstack/react-table';
import { ListFilter, FilterX } from 'lucide-react';
import { ArrowDownIcon, ArrowUpIcon, CaretSortIcon } from '@radix-ui/react-icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/DropdownMenu';
import { Button } from '~/components/ui/Button';
import { useLocalize, TranslationKeys } from '~/hooks';
import { cn } from '~/utils';

interface SortFilterHeaderProps<TData, TValue> extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  column: Column<TData, TValue>;
  filters?: Record<string, string[] | number[]>;
  valueMap?: Record<any, TranslationKeys>;
}

export function SortFilterHeader<TData, TValue>({
  column,
  title,
  className = '',
  filters,
  valueMap,
}: SortFilterHeaderProps<TData, TValue>) {
  const localize = useLocalize();
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>;
  }

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="px-2 py-0 text-xs hover:bg-surface-hover data-[state=open]:bg-surface-hover sm:px-2 sm:py-2 sm:text-sm"
          >
            <span>{title}</span>
            {column.getIsFiltered() ? (
              <ListFilter className="icon-sm ml-2 text-muted-foreground/70" />
            ) : (
              <ListFilter className="icon-sm ml-2 opacity-30" />
            )}
            {(() => {
              const sortState = column.getIsSorted();
              if (sortState === 'desc') {
                return <ArrowDownIcon className="icon-sm ml-2" />;
              }
              if (sortState === 'asc') {
                return <ArrowUpIcon className="icon-sm ml-2" />;
              }
              return <CaretSortIcon className="icon-sm ml-2" />;
            })()}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="z-1001 dark:border-gray-700 dark:bg-gray-850"
        >
          <DropdownMenuItem
            onClick={() => column.toggleSorting(false)}
            className="cursor-pointer text-text-primary"
          >
            <ArrowUpIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
            {localize('com_ui_ascending')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => column.toggleSorting(true)}
            className="cursor-pointer text-text-primary"
          >
            <ArrowDownIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
            {localize('com_ui_descending')}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="dark:bg-gray-500" />
          {filters &&
            Object.entries(filters).map(([key, values]) =>
              values.map((value?: string | number) => {
                const translationKey = valueMap?.[value ?? ''];
                const filterValue =
                  translationKey != null && translationKey.length
                    ? localize(translationKey)
                    : String(value);
                if (!filterValue) {
                  return null;
                }
                return (
                  <DropdownMenuItem
                    className="cursor-pointer text-text-primary"
                    key={`${key}-${value}`}
                    onClick={() => {
                      column.setFilterValue(value);
                    }}
                  >
                    <ListFilter className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
                    {filterValue}
                  </DropdownMenuItem>
                );
              }),
            )}
          {filters && (
            <DropdownMenuItem
              className={
                column.getIsFiltered()
                  ? 'cursor-pointer dark:text-white dark:hover:bg-gray-800'
                  : 'pointer-events-none opacity-30'
              }
              onClick={() => {
                column.setFilterValue(undefined);
              }}
            >
              <FilterX className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
              {localize('com_ui_show_all')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
