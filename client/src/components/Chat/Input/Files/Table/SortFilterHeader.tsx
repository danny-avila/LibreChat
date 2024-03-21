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
import useLocalize from '~/hooks/useLocalize';
import { cn } from '~/utils';

interface SortFilterHeaderProps<TData, TValue> extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  column: Column<TData, TValue>;
  filters?: Record<string, string[] | number[]>;
  valueMap?: Record<string, string>;
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
            className="px-2 py-0 text-xs sm:px-2 sm:py-2 sm:text-sm"
            // className="data-[state=open]:bg-accent -ml-3 h-8"
          >
            <span>{title}</span>
            {column.getIsFiltered() ? (
              <ListFilter className="icon-sm text-muted-foreground/70 ml-2" />
            ) : (
              <ListFilter className="icon-sm ml-2 opacity-30" />
            )}
            {column.getIsSorted() === 'desc' ? (
              <ArrowDownIcon className="icon-sm ml-2" />
            ) : column.getIsSorted() === 'asc' ? (
              <ArrowUpIcon className="icon-sm ml-2" />
            ) : (
              <CaretSortIcon className="icon-sm ml-2" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="z-[1001] dark:border-gray-700 dark:bg-gray-750"
        >
          <DropdownMenuItem
            onClick={() => column.toggleSorting(false)}
            className="cursor-pointer dark:text-white dark:hover:bg-gray-800"
          >
            <ArrowUpIcon className="text-muted-foreground/70 mr-2 h-3.5 w-3.5" />
            {localize('com_ui_ascending')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => column.toggleSorting(true)}
            className="cursor-pointer dark:text-white dark:hover:bg-gray-800"
          >
            <ArrowDownIcon className="text-muted-foreground/70 mr-2 h-3.5 w-3.5" />
            {localize('com_ui_descending')}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="dark:bg-gray-500" />
          {filters &&
            Object.entries(filters).map(([key, values]) =>
              values.map((value: string | number) => {
                const localizedValue = localize(valueMap?.[value] ?? '');
                const filterValue = localizedValue?.length ? localizedValue : valueMap?.[value];
                if (!filterValue) {
                  return null;
                }
                return (
                  <DropdownMenuItem
                    className="cursor-pointer dark:text-white dark:hover:bg-gray-800"
                    key={`${key}-${value}`}
                    onClick={() => {
                      column.setFilterValue(value);
                    }}
                  >
                    <ListFilter className="text-muted-foreground/70 mr-2 h-3.5 w-3.5" />
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
              <FilterX className="text-muted-foreground/70 mr-2 h-3.5 w-3.5" />
              {localize('com_ui_show_all')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
