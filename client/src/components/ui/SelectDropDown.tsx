import React from 'react';
import {
  Label,
  Listbox,
  Transition,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/react';
import type { Option, OptionWithIcon, DropdownValueSetter } from '~/common';
import CheckMark from '~/components/svg/CheckMark';
import { useMultiSearch } from './MultiSearch';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils/';

type SelectDropDownProps = {
  id?: string;
  title?: string;
  disabled?: boolean;
  value: string | null | Option | OptionWithIcon;
  setValue: DropdownValueSetter | ((value: string) => void);
  tabIndex?: number;
  availableValues: string[] | Option[] | OptionWithIcon[];
  emptyTitle?: boolean;
  showAbove?: boolean;
  showLabel?: boolean;
  iconSide?: 'left' | 'right';
  optionIconSide?: 'left' | 'right';
  renderOption?: () => React.ReactNode;
  containerClassName?: string;
  currentValueClass?: string;
  optionsListClass?: string;
  optionsClass?: string;
  subContainerClassName?: string;
  className?: string;
  placeholder?: string;
  searchClassName?: string;
  searchPlaceholder?: string;
  showOptionIcon?: boolean;
};

function getOptionText(option: string | Option | OptionWithIcon): string {
  if (typeof option === 'string') {
    return option;
  }
  if ('label' in option) {
    return option.label ?? '';
  }
  if ('value' in option) {
    return (option.value ?? '') + '';
  }
  return '';
}

function SelectDropDown({
  title: _title,
  value,
  disabled,
  setValue,
  availableValues,
  showAbove = false,
  showLabel = true,
  emptyTitle = false,
  iconSide = 'right',
  optionIconSide = 'left',
  placeholder,
  containerClassName,
  optionsListClass,
  optionsClass,
  currentValueClass,
  subContainerClassName,
  className,
  renderOption,
  searchClassName,
  searchPlaceholder,
  showOptionIcon = false,
}: SelectDropDownProps) {
  const localize = useLocalize();
  const transitionProps = { className: 'top-full mt-3' };
  if (showAbove) {
    transitionProps.className = 'bottom-full mb-3';
  }

  let title = _title;

  if (emptyTitle) {
    title = '';
  } else if (!(title ?? '')) {
    title = localize('com_ui_model');
  }

  // Detemine if we should to convert this component into a searchable select.  If we have enough elements, a search
  // input will appear near the top of the menu, allowing correct filtering of different model menu items. This will
  // reset once the component is unmounted (as per a normal search)
  const [filteredValues, searchRender] = useMultiSearch<string[] | Option[]>({
    availableOptions: availableValues,
    placeholder: searchPlaceholder,
    getTextKeyOverride: (option) => getOptionText(option).toUpperCase(),
    className: searchClassName,
    disabled,
  });
  const hasSearchRender = searchRender != null;
  const options = hasSearchRender ? filteredValues : availableValues;

  const renderIcon = showOptionIcon && value != null && (value as OptionWithIcon).icon != null;

  return (
    <div className={cn('flex items-center justify-center gap-2 ', containerClassName ?? '')}>
      <div className={cn('relative w-full', subContainerClassName ?? '')}>
        <Listbox value={value} onChange={setValue} disabled={disabled}>
          {({ open }) => (
            <>
              <ListboxButton
                data-testid="select-dropdown-button"
                className={cn(
                  'relative flex w-full cursor-default flex-col rounded-md border border-black/10 bg-white py-2 pl-3 pr-10 text-left disabled:bg-white dark:border-gray-600 dark:bg-gray-700 sm:text-sm',
                  className ?? '',
                )}
              >
                {' '}
                {showLabel && (
                  <Label
                    className="block text-xs text-gray-700 dark:text-gray-500 "
                    id="headlessui-listbox-label-:r1:"
                    data-headlessui-state=""
                  >
                    {title}
                  </Label>
                )}
                <span className="inline-flex w-full truncate">
                  <span
                    className={cn(
                      'flex h-6 items-center gap-1 truncate text-sm text-gray-800 dark:text-white',
                      !showLabel ? 'text-xs' : '',
                      currentValueClass ?? '',
                    )}
                  >
                    {!showLabel && !emptyTitle && (
                      <span className="text-xs text-gray-700 dark:text-gray-500">{title}:</span>
                    )}
                    {renderIcon && optionIconSide !== 'right' && (
                      <span className="icon-md flex items-center">
                        {(value as OptionWithIcon).icon}
                      </span>
                    )}
                    {renderIcon && (
                      <span className="icon-md absolute right-0 mr-8 flex items-center">
                        {(value as OptionWithIcon).icon}
                      </span>
                    )}
                    {(() => {
                      if (!value) {
                        return <span className="text-text-secondary">{placeholder}</span>;
                      }

                      if (typeof value !== 'string') {
                        return value.label ?? '';
                      }

                      return value;
                    })()}
                  </span>
                </span>
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                  <svg
                    stroke="currentColor"
                    fill="none"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4  text-gray-400"
                    height="1em"
                    width="1em"
                    xmlns="http://www.w3.org/2000/svg"
                    style={showAbove ? { transform: 'scaleY(-1)' } : {}}
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </span>
              </ListboxButton>
              <Transition
                show={open}
                as={React.Fragment}
                leave="transition ease-in duration-100"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
                {...transitionProps}
              >
                <ListboxOptions
                  className={cn(
                    'absolute z-10 mt-2 max-h-60 w-full overflow-auto rounded border bg-white text-xs ring-black/10 dark:border-gray-600 dark:bg-gray-700 dark:ring-white/20 md:w-[100%]',
                    optionsListClass ?? '',
                  )}
                >
                  {renderOption && (
                    <ListboxOption
                      key={'listbox-render-option'}
                      value={null}
                      className={cn(
                        'group relative flex h-[42px] cursor-pointer select-none items-center overflow-hidden pl-3 pr-9 text-gray-800 hover:bg-gray-20 dark:text-white dark:hover:bg-gray-700',
                        optionsClass ?? '',
                      )}
                    >
                      {renderOption()}
                    </ListboxOption>
                  )}
                  {searchRender}
                  {options.map((option: string | Option, i: number) => {
                    if (!option) {
                      return null;
                    }

                    const currentLabel =
                      typeof option === 'string' ? option : option.label ?? option.value ?? '';
                    const currentValue = typeof option === 'string' ? option : option.value ?? '';
                    const currentIcon =
                      typeof option === 'string' ? null : (option.icon as React.ReactNode) ?? null;
                    let activeValue: string | number | null | Option = value;
                    if (typeof activeValue !== 'string') {
                      activeValue = activeValue?.value ?? '';
                    }

                    return (
                      <ListboxOption
                        key={i}
                        value={option}
                        className={({ active }) =>
                          cn(
                            'group relative flex h-[42px] cursor-pointer select-none items-center overflow-hidden pl-3 pr-9 text-gray-800 hover:bg-gray-20 dark:text-white dark:hover:bg-gray-600',
                            active ? 'bg-surface-active text-text-primary' : '',
                            optionsClass ?? '',
                          )
                        }
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <span
                            className={cn(
                              'flex h-6 items-center gap-1 text-gray-800 dark:text-gray-200',
                              option === value ? 'font-semibold' : '',
                              iconSide === 'left' ? 'ml-4' : '',
                            )}
                          >
                            {currentIcon != null && (
                              <span
                                className={cn(
                                  'mr-1',
                                  optionIconSide === 'right' ? 'absolute right-0 pr-2' : '',
                                )}
                              >
                                {currentIcon}
                              </span>
                            )}
                            {currentLabel}
                          </span>
                          {currentValue === activeValue && (
                            <span
                              className={cn(
                                'absolute inset-y-0 flex items-center text-gray-800 dark:text-gray-200',
                                iconSide === 'left' ? 'left-0 pl-2' : 'right-0 pr-3',
                              )}
                            >
                              <CheckMark />
                            </span>
                          )}
                        </span>
                      </ListboxOption>
                    );
                  })}
                </ListboxOptions>
              </Transition>
            </>
          )}
        </Listbox>
      </div>
    </div>
  );
}

export default SelectDropDown;
