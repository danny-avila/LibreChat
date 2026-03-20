import { memo } from 'react';
import { startTransition } from 'react';
import type { DataTableSearchProps } from './DataTable.types';
import { useLocalize } from '~/hooks';
import { Input } from '../Input';
import { cn } from '~/utils';

export const DataTableSearch = memo(
  ({ value, onChange, placeholder, className, disabled = false }: DataTableSearchProps) => {
    const localize = useLocalize();

    return (
      <div className="relative flex-1">
        <label htmlFor="table-search" className="sr-only">
          {localize('com_ui_search_table')}
        </label>
        <Input
          id="table-search"
          value={value}
          onChange={(e) => {
            startTransition(() => onChange(e.target.value));
          }}
          disabled={disabled}
          aria-label={localize('com_ui_search_table')}
          aria-describedby="search-description"
          placeholder={placeholder || localize('com_ui_search')}
          className={cn('h-10 rounded-b-none border-0 bg-surface-secondary md:h-12', className)}
        />
        <span id="search-description" className="sr-only">
          {localize('com_ui_search_table_description')}
        </span>
      </div>
    );
  },
);

DataTableSearch.displayName = 'DataTableSearch';
