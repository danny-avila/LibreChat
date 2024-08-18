import * as Ariakit from '@ariakit/react';
import { matchSorter } from 'match-sorter';
import { startTransition, useMemo, useState, useEffect, useRef } from 'react';
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [buttonWidth, setButtonWidth] = useState<number | null>(null);

  const matches = useMemo(() => {
    return matchSorter(items, searchValue, {
      keys: ['value', 'label'],
      baseSort: (a, b) => (a.index < b.index ? -1 : 1),
    });
  }, [searchValue, items]);

  useEffect(() => {
    if (buttonRef.current && !isCollapsed) {
      setButtonWidth(buttonRef.current.offsetWidth);
    }
  }, [isCollapsed]);

  return (
    <div className="flex w-full items-center justify-center px-1">
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
            ref={buttonRef}
            className={cn(
              'flex items-center justify-center gap-2 rounded-full bg-surface-secondary',
              'text-text-primary hover:bg-surface-tertiary',
              'border border-border-light',
              isCollapsed ? 'h-10 w-10' : 'h-10 w-full rounded-md px-3 py-2 text-sm',
            )}
          >
            {SelectIcon != null && (
              <div className="assistant-item flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
                {SelectIcon}
              </div>
            )}
            {!isCollapsed && (
              <span className="flex-grow truncate text-left">
                {displayValue ?? selectPlaceholder}
              </span>
            )}
          </Ariakit.Select>
          <Ariakit.SelectPopover
            gutter={4}
            portal
            className="z-50 overflow-hidden rounded-md border border-border-light bg-surface-secondary shadow-lg"
            style={{ width: isCollapsed ? '300px' : buttonWidth ?? '300px' }}
          >
            <div className="p-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-primary" />
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
                  aria-label={`${item.label ?? item.value ?? ''}`}
                  className={cn(
                    'flex cursor-pointer items-center px-3 py-2 text-sm',
                    'text-text-primary hover:bg-surface-tertiary',
                    'data-[active-item]:bg-surface-tertiary',
                  )}
                  render={<Ariakit.ComboboxItem />}
                >
                  {item.icon != null && (
                    <div className="assistant-item mr-2 flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
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
