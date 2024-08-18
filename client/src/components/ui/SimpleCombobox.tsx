import * as Ariakit from '@ariakit/react';
import { matchSorter } from 'match-sorter';
import { startTransition, useMemo, useState } from 'react';
import { cn } from '~/utils';
import type { OptionWithIcon } from '~/common';

import { Search } from 'lucide-react';

interface ComboboxComponentProps {
  selectedValue: string;
  displayValue?: string;
  items: OptionWithIcon[];
  setValue: (value: string) => void;
  ariaLabel: string;
  searchPlaceholder?: string;
  selectPlaceholder?: string;
  isCollapsed: boolean;
  SelectIcon?: React.ReactNode;
}

export default function ComboboxComponent({
  selectedValue,
  displayValue,
  items,
  setValue,
  ariaLabel,
  searchPlaceholder,
  selectPlaceholder,
  isCollapsed,
  SelectIcon,
}: ComboboxComponentProps) {
  const [searchValue, setSearchValue] = useState('');

  const matches = useMemo(() => {
    return matchSorter(items, searchValue, {
      keys: ['value', 'label'],
      baseSort: (a, b) => (a.index < b.index ? -1 : 1),
    });
  }, [searchValue, items]);

  return (
    <div className="w-full">
      <Ariakit.ComboboxProvider
        resetValueOnHide
        setValue={(value) => {
          startTransition(() => {
            setSearchValue(value);
          });
        }}
      >
        <Ariakit.SelectProvider value={selectedValue} setValue={setValue}>
          <Ariakit.SelectLabel className="sr-only">{ariaLabel}</Ariakit.SelectLabel>
          <Ariakit.Select
            className={cn(
              'flex w-full items-center gap-2 rounded-md bg-surface-secondary px-3 py-2 text-sm',
              'text-text-primary hover:bg-surface-tertiary',
              'border border-border-light',
              isCollapsed ? 'h-10 w-10 justify-center p-0' : 'h-10',
            )}
          >
            {SelectIcon != null && (
              <div className="assistant-item overflow-hidden rounded-full">{SelectIcon}</div>
            )}
            <span className="flex-grow truncate text-left">
              {displayValue ?? selectPlaceholder}
            </span>
          </Ariakit.Select>
          <Ariakit.SelectPopover
            gutter={4}
            sameWidth
            className="z-50 overflow-hidden rounded-md border border-border-light bg-surface-secondary shadow-lg"
          >
            <div className="p-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
                <Ariakit.Combobox
                  autoSelect
                  placeholder={searchPlaceholder}
                  className="w-full rounded-md border border-border-light bg-surface-tertiary py-2 pl-9 pr-3 text-sm text-text-primary focus:outline-none"
                />
              </div>
            </div>
            <Ariakit.ComboboxList className="max-h-[50vh] overflow-auto">
              {matches.map((item) => (
                <Ariakit.SelectItem
                  key={item.value}
                  value={`${item.value ?? ''}`}
                  className={cn(
                    'flex cursor-pointer items-center px-3 py-2 text-sm',
                    'text-text-primary hover:bg-surface-tertiary',
                    'data-[active-item]:bg-surface-tertiary',
                  )}
                  render={<Ariakit.ComboboxItem />}
                >
                  {item.icon != null && (
                    <div className="assistant-item mr-2 overflow-hidden rounded-full">
                      {item.icon}
                    </div>
                  )}
                  <span className="flex-grow truncate text-left">{item.label}</span>
                </Ariakit.SelectItem>
              ))}
            </Ariakit.ComboboxList>
          </Ariakit.SelectPopover>
        </Ariakit.SelectProvider>
      </Ariakit.ComboboxProvider>
    </div>
  );
}
