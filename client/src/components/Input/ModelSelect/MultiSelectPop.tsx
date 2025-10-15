import { Wrench } from 'lucide-react';
import { useMultiSearch } from '@librechat/client';
import { Root, Trigger, Content, Portal } from '@radix-ui/react-popover';
import type { TPlugin } from 'librechat-data-provider';
import MenuItem from '~/components/Chat/Menus/UI/MenuItem';
import { cn } from '~/utils/';

type SelectDropDownProps = {
  title?: string;
  value: Array<{ icon?: string; name?: string; isButton?: boolean }>;
  disabled?: boolean;
  setSelected: (option: string) => void;
  availableValues: TPlugin[];
  showAbove?: boolean;
  showLabel?: boolean;
  containerClassName?: string;
  isSelected: (value: string) => boolean;
  className?: string;
  optionValueKey?: string;
  searchPlaceholder?: string;
};

function MultiSelectPop({
  title: _title = 'Plugins',
  value,
  setSelected,
  availableValues,
  showAbove = false,
  showLabel = true,
  containerClassName,
  isSelected,
  optionValueKey = 'value',
  searchPlaceholder,
}: SelectDropDownProps) {
  const title = _title;
  const excludeIds = ['select-plugin', 'plugins-label', 'selected-plugins'];

  // Detemine if we should to convert this component into a searchable select
  const [filteredValues, searchRender] = useMultiSearch<TPlugin[]>({
    availableOptions: availableValues,
    placeholder: searchPlaceholder,
    getTextKeyOverride: (option) => (option.name || '').toUpperCase(),
  });
  const hasSearchRender = Boolean(searchRender);
  const options = hasSearchRender ? filteredValues : availableValues;

  return (
    <Root>
      <div className={cn('flex items-center justify-center gap-2', containerClassName ?? '')}>
        <div className="relative">
          <Trigger asChild>
            <button
              data-testid="select-dropdown-button"
              className={cn(
                'relative flex flex-col rounded-md border border-black/10 bg-white py-2 pl-3 pr-10 text-left focus:outline-none focus:ring-0 focus:ring-offset-0 dark:border-gray-700 dark:bg-gray-800 sm:text-sm',
                'pointer-cursor font-normal',
                'hover:bg-gray-50 radix-state-open:bg-gray-50 dark:hover:bg-gray-700 dark:radix-state-open:bg-gray-700',
              )}
            >
              {' '}
              {showLabel && (
                <label className="block text-xs text-gray-700 dark:text-gray-500">{title}</label>
              )}
              <span className="inline-flex" id={excludeIds[2]}>
                <span
                  className={cn(
                    'flex h-6 items-center gap-1 text-sm text-gray-800 dark:text-white',
                    !showLabel ? 'text-xs' : '',
                  )}
                >
                  {/* {!showLabel && title.length > 0 && (
                    <span className="text-xs text-gray-700 dark:text-gray-500">{title}:</span>
                  )} */}
                  <span className="flex items-center gap-1">
                    <div className="flex gap-1">
                      {value.length === 0 && 'None selected'}
                      {value.map((v, i) => (
                        <div key={i} className="relative">
                          {v.icon ? (
                            <img src={v.icon} alt={`${v} logo`} className="icon-lg rounded-sm" />
                          ) : (
                            <Wrench className="icon-lg rounded-sm bg-white" />
                          )}
                          <div className="absolute inset-0 rounded-sm ring-1 ring-inset ring-black/10" />
                        </div>
                      ))}
                    </div>
                  </span>
                </span>
              </span>
              <span className="absolute inset-y-0 right-0 flex items-center pr-2">
                <svg
                  stroke="currentColor"
                  fill="none"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4 text-gray-400"
                  height="1em"
                  width="1em"
                  xmlns="http://www.w3.org/2000/svg"
                  style={showAbove ? { transform: 'scaleY(-1)' } : {}}
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </span>
            </button>
          </Trigger>
          <Portal>
            <Content
              side="bottom"
              align="center"
              className={cn(
                'mt-2 max-h-[52vh] min-w-full overflow-hidden overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-700 dark:text-white',
                hasSearchRender && 'relative',
              )}
            >
              {searchRender}
              {options.map((option) => {
                if (!option) {
                  return null;
                }
                const selected = isSelected(option[optionValueKey]);
                return (
                  <MenuItem
                    key={`${option[optionValueKey]}`}
                    title={option.name}
                    value={option[optionValueKey]}
                    selected={selected}
                    onClick={() => setSelected(option.pluginKey)}
                    icon={
                      option.icon ? (
                        <img
                          src={option.icon}
                          alt={`${option.name} logo`}
                          className="icon-sm mr-1 rounded-sm bg-cover"
                        />
                      ) : (
                        <Wrench className="icon-sm mr-1 rounded-sm bg-white bg-cover dark:bg-gray-800" />
                      )
                    }
                  />
                );
              })}
            </Content>
          </Portal>
        </div>
      </div>
    </Root>
  );
}

export default MultiSelectPop;
