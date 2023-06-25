import React from 'react';
import CheckMark from '../svg/CheckMark.jsx';
import { Listbox, Transition } from '@headlessui/react';
import { cn } from '~/utils/';

function SelectDropDown({
  title = navigator.languages[0] === 'zh-CN'?'模型':'Model',
  value,
  disabled,
  setValue,
  availableValues,
  showAbove = false,
  showLabel = true,
  containerClassName,
  subContainerClassName,
  className
}) {
  return (
    <div className={cn('flex items-center justify-center gap-2', containerClassName)}>
      <div className={cn("relative w-full", subContainerClassName)}>
        <Listbox value={value} onChange={setValue} disabled={disabled}>
          {({ open }) => (
            <>
              <Listbox.Button
                className={cn(
                  'relative flex w-full cursor-default flex-col rounded-md border border-black/10 bg-white py-2 pl-3 pr-10 text-left focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600 dark:border-white/20 dark:bg-gray-800 sm:text-sm',
                  className
                )}
              >
                {' '}
                {showLabel && (
                  <Listbox.Label
                    className="block text-xs text-gray-700 dark:text-gray-500"
                    id="headlessui-listbox-label-:r1:"
                    data-headlessui-state=""
                  >
                    {title}
                  </Listbox.Label>
                )}
                <span className="inline-flex w-full truncate">
                  <span
                    className={cn(
                      'flex h-6 items-center gap-1 truncate text-sm text-gray-900 dark:text-white',
                      !showLabel ? 'text-xs' : ''
                    )}
                  >
                    {!showLabel && (
                      <span className="text-xs text-gray-700 dark:text-gray-500">{title}:</span>
                    )}
                    {value}
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
                className={showAbove ? 'bottom-full mb-3' : 'top-full mt-3'}
              >
                <Listbox.Options className="absolute z-10 mt-2 max-h-60 w-full overflow-auto rounded bg-white text-base text-xs ring-1 ring-black/10 focus:outline-none dark:bg-gray-800 dark:ring-white/20 dark:last:border-0 md:w-[100%]">
                  {availableValues.map((option, i) => (
                    <Listbox.Option
                      key={i}
                      value={option}
                      className="group relative flex h-[42px] cursor-pointer select-none items-center overflow-hidden border-b border-black/10 pl-3 pr-9 text-gray-900 last:border-0 hover:bg-[#ECECF1] dark:border-white/20 dark:text-white dark:hover:bg-gray-700"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <span
                          className={cn(
                            'flex h-6 items-center gap-1 text-gray-800 dark:text-gray-100',
                            option === value ? 'font-semibold' : ''
                          )}
                        >
                          {option}
                        </span>
                        {option === value && (
                          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-800 dark:text-gray-100">
                            <CheckMark />
                          </span>
                        )}
                      </span>
                    </Listbox.Option>
                  ))}
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
