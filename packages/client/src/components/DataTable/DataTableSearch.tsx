import { memo, startTransition, useId, type MemoExoticComponent } from 'react';
import { JSX } from 'react/jsx-runtime';
import type { DataTableSearchProps } from './DataTable.types';
import { useLocalize } from '~/hooks';
import { Input } from '../Input';
import { cn } from '~/utils';

export const DataTableSearch: MemoExoticComponent<
  ({ value, onChange, placeholder, className, disabled }: DataTableSearchProps) => JSX.Element
> = memo(
  ({
    value,
    onChange,
    placeholder,
    className,
    disabled = false,
  }: DataTableSearchProps): JSX.Element => {
    const localize = useLocalize();
    const searchId = useId();
    const descriptionId = `${searchId}-description`;

    return (
      <div className="relative flex-1">
        <label htmlFor={searchId} className="sr-only">
          {localize('com_ui_search_table')}
        </label>
        <Input
          id={searchId}
          value={value}
          onChange={(e) => {
            startTransition(() => onChange(e.target.value));
          }}
          disabled={disabled}
          aria-label={localize('com_ui_search_table')}
          aria-describedby={descriptionId}
          placeholder={placeholder || localize('com_ui_search')}
          className={cn('h-10 rounded-b-none border-0 bg-surface-secondary md:h-12', className)}
        />
        <span id={descriptionId} className="sr-only">
          {localize('com_ui_search_table_description')}
        </span>
      </div>
    );
  },
);

DataTableSearch.displayName = 'DataTableSearch';
