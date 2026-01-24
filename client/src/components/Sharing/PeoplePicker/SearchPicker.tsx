import * as React from 'react';
import { Search } from 'lucide-react';
import debounce from 'lodash/debounce';
import * as Ariakit from '@ariakit/react';
import { Spinner, Skeleton } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type SearchPickerProps<TOption extends { key: string }> = {
  options: TOption[];
  renderOptions: (option: TOption) => React.ReactElement;
  query: string;
  onQueryChange: (query: string) => void;
  onPick: (pickedOption: TOption) => void;
  placeholder?: string;
  inputClassName?: string;
  label?: string;
  resetValueOnHide?: boolean;
  isSmallScreen?: boolean;
  isLoading?: boolean;
  minQueryLengthForNoResults?: number;
};

export function SearchPicker<TOption extends { key: string; value: string }>({
  options,
  renderOptions,
  onPick,
  onQueryChange,
  query,
  label,
  isSmallScreen = false,
  placeholder,
  resetValueOnHide = false,
  isLoading = false,
  minQueryLengthForNoResults = 2,
}: SearchPickerProps<TOption>) {
  const localize = useLocalize();
  const [_open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [localQuery, setLocalQuery] = React.useState(query);
  const combobox = Ariakit.useComboboxStore({
    resetValueOnHide,
  });

  React.useEffect(() => {
    setLocalQuery(query);
  }, [query]);

  const debouncedOnQueryChange = React.useMemo(
    () =>
      debounce((value: string) => {
        onQueryChange(value);
      }, 500),
    [onQueryChange],
  );

  React.useEffect(() => {
    return () => {
      debouncedOnQueryChange.cancel();
    };
  }, [debouncedOnQueryChange]);

  const onPickHandler = (option: TOption) => {
    setLocalQuery('');
    onQueryChange('');
    onPick(option);
    setOpen(false);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <Ariakit.ComboboxProvider store={combobox}>
      <Ariakit.ComboboxLabel className="mb-2 block font-medium text-text-primary">
        {label}
      </Ariakit.ComboboxLabel>
      <>
        <div
          className={cn(
            'group relative flex h-10 cursor-pointer items-center gap-2 rounded-lg border-border-medium text-text-primary transition-colors duration-200 focus-within:bg-surface-hover hover:bg-surface-hover',
            isSmallScreen === true ? 'mb-2 h-14 rounded-2xl' : '',
          )}
        >
          {isLoading ? (
            <Spinner className="absolute left-3 h-4 w-4" />
          ) : (
            <Search
              className="absolute left-3 h-4 w-4 text-text-secondary group-focus-within:text-text-primary group-hover:text-text-primary"
              aria-hidden="true"
            />
          )}
          <Ariakit.Combobox
            ref={inputRef}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && combobox.getState().open) {
                e.preventDefault();
                e.stopPropagation();
                setLocalQuery('');
                onQueryChange('');
                debouncedOnQueryChange.cancel();
                setOpen(false);
              }
            }}
            store={combobox}
            setValueOnClick={false}
            setValueOnChange={false}
            onChange={(e) => {
              const value = e.target.value;
              setLocalQuery(value);
              debouncedOnQueryChange(value);
            }}
            value={localQuery}
            // autoSelect
            placeholder={placeholder || localize('com_ui_select_options')}
            className="h-10 w-full rounded-lg bg-transparent pl-10 text-sm leading-tight text-text-primary placeholder-text-secondary placeholder-opacity-100 focus:outline-none focus-visible:outline-none group-focus-within:placeholder-text-primary group-hover:placeholder-text-primary"
          />
        </div>
      </>
      <Ariakit.ComboboxPopover
        portal={false} //todo fix focus when set to true
        gutter={8}
        sameWidth
        open={
          isLoading ||
          options.length > 0 ||
          (localQuery.trim().length >= minQueryLengthForNoResults && !isLoading)
        }
        store={combobox}
        unmountOnHide
        autoFocusOnShow={false}
        modal={false}
        className={cn(
          'animate-popover z-[9999] min-w-64 overflow-hidden rounded-2xl border border-border-light bg-surface-secondary shadow-lg',
          '[pointer-events:auto]', // Override body's pointer-events:none when in modal
        )}
      >
        {(() => {
          if (isLoading) {
            return (
              <div className="space-y-2 p-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-3 px-3 py-2">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            );
          }

          if (options.length > 0) {
            return options.map((o) => (
              <Ariakit.ComboboxItem
                key={o.key}
                focusOnHover
                // hideOnClick
                value={o.value}
                selectValueOnClick={false}
                onClick={() => onPickHandler(o)}
                className={cn(
                  'flex w-full cursor-pointer items-center px-3 text-sm',
                  'text-text-primary hover:bg-surface-tertiary',
                  'data-[active-item]:bg-surface-tertiary',
                )}
                render={renderOptions(o)}
              ></Ariakit.ComboboxItem>
            ));
          }

          if (localQuery.trim().length >= minQueryLengthForNoResults) {
            return (
              <div
                className={cn(
                  'flex items-center justify-center px-4 py-8 text-center',
                  'text-sm text-text-secondary',
                )}
              >
                <div className="flex flex-col items-center gap-2">
                  <Search className="h-8 w-8 text-text-tertiary opacity-50" />
                  <div className="font-medium">{localize('com_ui_no_results_found')}</div>
                  <div className="text-xs text-text-tertiary">
                    {localize('com_ui_try_adjusting_search')}
                  </div>
                </div>
              </div>
            );
          }

          return null;
        })()}
      </Ariakit.ComboboxPopover>
    </Ariakit.ComboboxProvider>
  );
}
