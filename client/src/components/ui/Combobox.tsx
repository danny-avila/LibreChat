import './combobox.css';
import { startTransition, useMemo } from 'react';
import { Combobox, ComboboxItem, ComboboxList, ComboboxProvider } from '@ariakit/react';
import useCombobox from '~/hooks/Input/useCombobox';
import { Search as SearchIcon } from 'lucide-react';
import * as RadixSelect from '@radix-ui/react-select';
import { CheckIcon, ChevronDownIcon } from '@radix-ui/react-icons';
import type { Option } from '~/common';
import { SelectTrigger, SelectValue } from './Select';
import { cn } from '~/utils';

export default function ComboboxComponent({
  selectedValue,
  items,
  setValue,
  ariaLabel,
  searchPlaceholder,
  selectPlaceholder,
  isCollapsed,
  SelectIcon,
}: {
  ariaLabel: string;
  selectedValue: string;
  searchPlaceholder?: string;
  selectPlaceholder?: string;
  items: Option[] | string[];
  setValue: (value: string) => void;
  isCollapsed: boolean;
  SelectIcon?: React.ReactNode;
}) {
  const options: Option[] = useMemo(() => {
    if (!items) {
      return [];
    }

    return items.map((option: string | Option) => {
      if (typeof option === 'string') {
        return { label: option, value: option };
      }

      return option;
    });
  }, [items]);

  const { open, setOpen, setSearchValue, matches } = useCombobox({
    value: selectedValue,
    options,
  });

  return (
    <RadixSelect.Root
      value={selectedValue}
      onValueChange={setValue}
      open={open}
      onOpenChange={setOpen}
    >
      <ComboboxProvider
        open={open}
        setOpen={setOpen}
        resetValueOnHide
        includesBaseElement={false}
        setValue={(value) => {
          startTransition(() => {
            setSearchValue(value);
          });
        }}
      >
        <SelectTrigger
          aria-label={ariaLabel}
          className={cn(
            'flex items-center gap-2 [&>span]:line-clamp-1 [&>span]:flex [&>span]:w-full [&>span]:items-center [&>span]:gap-1 [&>span]:truncate [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
            isCollapsed
              ? 'flex h-9 w-9 shrink-0 items-center justify-center p-0 [&>span]:w-auto [&>svg]:hidden'
              : '',
            'bg-white text-black hover:bg-gray-50 dark:bg-gray-850 dark:text-white',
          )}
        >
          <SelectValue placeholder={selectPlaceholder}>
            <div className="assistant-item flex items-center justify-center overflow-hidden rounded-full">
              {SelectIcon ? SelectIcon : <ChevronDownIcon />}
            </div>
            <span
              className={cn('ml-2', isCollapsed ? 'hidden' : '')}
              style={{ userSelect: 'none' }}
            >
              {selectPlaceholder && selectPlaceholder}
            </span>
          </SelectValue>
        </SelectTrigger>
        <RadixSelect.Content
          role="dialog"
          aria-label={ariaLabel + 's'}
          position="popper"
          className="popover"
          sideOffset={4}
          alignOffset={-16}
        >
          <div className="combobox-wrapper">
            <div className="combobox-icon">
              <SearchIcon />
            </div>
            <Combobox
              autoSelect
              placeholder={searchPlaceholder}
              className="combobox"
              // Ariakit's Combobox manually triggers a blur event on virtually
              // blurred items, making them work as if they had actual DOM
              // focus. These blur events might happen after the corresponding
              // focus events in the capture phase, leading Radix Select to
              // close the popover. This happens because Radix Select relies on
              // the order of these captured events to discern if the focus was
              // outside the element. Since we don't have access to the
              // onInteractOutside prop in the Radix SelectContent component to
              // stop this behavior, we can turn off Ariakit's behavior here.
              onBlurCapture={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            />
          </div>
          <ComboboxList className="listbox">
            {matches.map(({ label, value }) => (
              <RadixSelect.Item key={value} value={`${value ?? ''}`} asChild className="item">
                <ComboboxItem>
                  <RadixSelect.ItemText>{label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator className="item-indicator">
                    <CheckIcon />
                  </RadixSelect.ItemIndicator>
                </ComboboxItem>
              </RadixSelect.Item>
            ))}
          </ComboboxList>
        </RadixSelect.Content>
      </ComboboxProvider>
    </RadixSelect.Root>
  );
}
