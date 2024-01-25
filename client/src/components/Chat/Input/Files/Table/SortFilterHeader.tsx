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
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>;
  }

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
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
        <DropdownMenuContent align="start" className="z-[1001]">
          <DropdownMenuItem onClick={() => column.toggleSorting(false)} className="cursor-pointer">
            <ArrowUpIcon className="text-muted-foreground/70 mr-2 h-3.5 w-3.5" />
            Asc
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => column.toggleSorting(true)} className="cursor-pointer">
            <ArrowDownIcon className="text-muted-foreground/70 mr-2 h-3.5 w-3.5" />
            Desc
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {filters &&
            Object.entries(filters).map(([key, values]) =>
              values.map((value: string | number) => (
                <DropdownMenuItem
                  className="cursor-pointer"
                  key={`${key}-${value}`}
                  onClick={() => {
                    column.setFilterValue(value);
                  }}
                >
                  <ListFilter className="text-muted-foreground/70 mr-2 h-3.5 w-3.5" />
                  {valueMap?.[value] ?? value}
                </DropdownMenuItem>
              )),
            )}
          {filters && (
            <DropdownMenuItem
              className={
                column.getIsFiltered() ? 'cursor-pointer' : 'pointer-events-none opacity-30'
              }
              onClick={() => {
                column.setFilterValue(undefined);
              }}
            >
              <FilterX className="text-muted-foreground/70 mr-2 h-3.5 w-3.5" />
              Show All
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
