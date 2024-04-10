import './combobox.css';
import { startTransition, useMemo } from 'react';
import { Combobox, ComboboxItem, ComboboxList, ComboboxProvider } from '@ariakit/react';
import useCombobox from '~/hooks/Input/useCombobox';
import { Search as SearchIcon } from 'lucide-react';
import * as RadixSelect from '@radix-ui/react-select';
import { CheckIcon, ChevronDownIcon } from '@radix-ui/react-icons';
import type { Option } from '~/common';

export default function ComboboxComponent({
  selectedValue,
  items,
  setValue,
  ariaLabel,
  searchPlaceholder,
  selectPlaceholder,
  isCollapsed,
}: {
  ariaLabel: string;
  selectedValue: string;
  searchPlaceholder?: string;
  selectPlaceholder?: string;
  items: Option[] | string[];
  setValue: (value: string) => void;
  isCollapsed: boolean;
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
        <RadixSelect.Trigger aria-label={ariaLabel} className="select">
          <RadixSelect.Value placeholder={selectPlaceholder} />
          <RadixSelect.Icon className="select-icon">
            <ChevronDownIcon />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
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
