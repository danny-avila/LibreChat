import React from 'react';
import { Listbox, Transition } from '@headlessui/react';
import type { Option } from '~/common';
import CheckMark from '../svg/CheckMark';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils/';

type SelectDropDownProps = {
  id?: string;
  title?: string;
  value: string | null | Option;
  disabled?: boolean;
  setValue: (value: string) => void;
  availableValues: string[] | Option[];
  emptyTitle?: boolean;
  showAbove?: boolean;
  showLabel?: boolean;
  iconSide?: 'left' | 'right';
  renderOption?: () => React.ReactNode;
  containerClassName?: string;
  currentValueClass?: string;
  optionsListClass?: string;
  optionsClass?: string;
  subContainerClassName?: string;
  className?: string;
};

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
  containerClassName,
  optionsListClass,
  optionsClass,
  currentValueClass,
  subContainerClassName,
  className,
  renderOption,
}: SelectDropDownProps) {
  const localize = useLocalize();
  const transitionProps = { className: 'top-full mt-3' };
  if (showAbove) {
    transitionProps.className = 'bottom-full mb-3';
  }

  let title = _title;

  if (emptyTitle) {
    title = '';
  } else if (!title) {
    title = localize('com_ui_model');
  }

  return (
    <div className={cn('flex items-center justify-center gap-2 ', containerClassName ?? '')}>
      <div className={cn('relative w-full', subContainerClassName ?? '')}>
        <Listbox value={value} onChange={setValue} disabled={disabled}>
          {({ open }) => (
            <>
              <Listbox.Button
                data-testid="select-dropdown-button"
                className={cn(
                  'relative flex w-full cursor-default flex-col rounded-md border border-black/10 bg-white py-2 pl-3 pr-10 text-left focus:outline-none focus:ring-0 focus:ring-offset-0 dark:border-white/20 dark:bg-gray-800 sm:text-sm',
                  className ?? '',
                )}
              >
                {' '}
                {showLabel && (
                  <Listbox.Label
                    className="block text-xs text-gray-700 dark:text-gray-500 "
                    id="headlessui-listbox-label-:r1:"
                    data-headlessui-state=""
                  >
                    {title}
                  </Listbox.Label>
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
                    {typeof value !== 'string' && value ? value?.label ?? '' : value ?? ''}
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
              </Listbox.Button>
              <Transition
                show={open}
                as={React.Fragment}
                leave="transition ease-in duration-100"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
                {...transitionProps}
              >
                <Listbox.Options
                  className={cn(
                    'absolute z-10 mt-2 max-h-60 w-full overflow-auto rounded border bg-white text-base text-xs ring-black/10 focus:outline-none dark:bg-gray-800 dark:ring-white/20 dark:last:border-0 md:w-[100%]',
                    optionsListClass ?? '',
                  )}
                >
                  {renderOption && (
                    <Listbox.Option
                      key={'listbox-render-option'}
                      value={null}
                      className={cn(
                        'group relative flex h-[42px] cursor-pointer select-none items-center overflow-hidden border-b border-black/10 pl-3 pr-9 text-gray-800 last:border-0 hover:bg-gray-20 dark:border-white/20 dark:text-white dark:hover:bg-gray-700',
                        optionsClass ?? '',
                      )}
                    >
                      {renderOption()}
                    </Listbox.Option>
                  )}
                  {availableValues.map((option: string | Option, i: number) => {
                    if (!option) {
                      return null;
                    }

                    const currentLabel = typeof option === 'string' ? option : option?.label ?? '';
                    const currentValue = typeof option === 'string' ? option : option?.value ?? '';
                    let activeValue: string | number | null | Option = value;
                    if (typeof activeValue !== 'string') {
                      activeValue = activeValue?.value ?? '';
                    }

                    return (
                      <Listbox.Option
                        key={i}
                        value={currentValue}
                        className={cn(
                          'group relative flex h-[42px] cursor-pointer select-none items-center overflow-hidden border-b border-black/10 pl-3 pr-9 text-gray-800 last:border-0 hover:bg-gray-20 dark:border-white/20 dark:text-white dark:hover:bg-gray-700',
                          optionsClass ?? '',
                        )}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <span
                            className={cn(
                              'flex h-6 items-center gap-1 text-gray-800 dark:text-gray-200',
                              option === value ? 'font-semibold' : '',
                              iconSide === 'left' ? 'ml-4' : '',
                            )}
                          >
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
                      </Listbox.Option>
                    );
                  })}
                </Listbox.Options>
              </Transition>
            </>
          )}
        </Listbox>
      </div>
    </div>
  );
}

export default SelectDropDown;
