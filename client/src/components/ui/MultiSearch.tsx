import { Search, X } from 'lucide-react';
import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

// This is a generic that can be added to Menu and Select components

export default function MultiSearch({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string | null;
  onChange: (filter: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const localize = useLocalize();
  // Create a ref to reference the input element
  const inputRef = useRef<HTMLInputElement>(null);

  const onChangeHandler: React.ChangeEventHandler<HTMLInputElement> = useCallback(
    (e) => onChange(e.target.value),
    [onChange],
  );

  // Function to clear the search input and move focus back to it
  const clearSearch = () => {
    onChange('');
    // Use setTimeout to ensure the input is cleared before moving focus
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  return (
    <div
      className={cn(
        'group sticky left-0 top-0 z-10 flex h-12 items-center gap-2 bg-gradient-to-b from-white from-65% to-transparent px-3 py-2 text-black transition-colors duration-300 focus:bg-gradient-to-b focus:from-white focus:to-white/50 dark:from-gray-700 dark:to-transparent dark:text-white dark:focus:from-white/10 dark:focus:to-white/20',
        className,
      )}
    >
      <Search
        className="h-4 w-4 text-gray-500 transition-colors duration-300 dark:group-focus-within:text-gray-300 dark:group-hover:text-gray-300"
        aria-hidden={'true'}
      />
      <input
        ref={inputRef} // Attach the ref to the input element
        type="text"
        value={value ?? ''}
        onChange={onChangeHandler}
        placeholder={placeholder ?? localize('com_ui_select_search_model')}
        aria-label="Search Model" // Add aria-label to provide accessible name to the input
        className="flex-1 rounded-md border-none bg-transparent px-2.5 py-2 text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-700/10 dark:focus:ring-gray-200/10"
      />
      <div
        className={cn(
          'relative flex h-5 w-5 items-center justify-end text-gray-500',
          value?.length ?? 0 ? 'cursor-pointer opacity-100' : 'hidden',
        )}
        aria-label={`Clear search`}
        role="button"
        tabIndex={0}
        onClick={clearSearch} // Call clearSearch on click
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            clearSearch(); // Call clearSearch on Enter or Space key press
          }
        }}
      >
        <X
          aria-hidden={`true`}
          className={cn(
            'text-gray-500 dark:text-gray-300',
            value?.length ?? 0 ? 'cursor-pointer opacity-100' : 'opacity-0',
          )}
        />
      </div>
    </div>
  );
}

/**
 * Helper function that will take a multiSearch input
 * @param node
 */
function defaultGetStringKey(node: unknown): string {
  if (typeof node === 'string') {
    // BUGFIX: Detect psedeo separators and make sure they don't appear in the list when filtering items
    // it makes sure (for the most part) that the model name starts and ends with dashes
    // The long-term fix here would be to enable seperators (model groupings) but there's no
    // feature mocks for such a thing yet
    if (node.startsWith('---') && node.endsWith('---')) {
      return '';
    }

    return node.toUpperCase();
  }
  // This should be a noop, but it's here for redundancy
  return '';
}

/**
 * Hook for conditionally making a multi-element list component into a sortable component
 * Returns a RenderNode for search input when search functionality is available
 * @param availableOptions
 * @param placeholder
 * @param getTextKeyOverride
 * @param className - Additional classnames to add to the search container
 * @param disabled - If the search should be disabled
 * @returns
 */
export function useMultiSearch<OptionsType extends unknown[]>({
  availableOptions = [] as unknown as OptionsType,
  placeholder,
  getTextKeyOverride,
  className,
  disabled = false,
}: {
  availableOptions?: OptionsType;
  placeholder?: string;
  getTextKeyOverride?: (node: OptionsType[0]) => string;
  className?: string;
  disabled?: boolean;
}): [OptionsType, React.ReactNode] {
  const [filterValue, setFilterValue] = useState<string | null>(null);

  // We conditionally show the search when there's more than 10 elements in the menu
  const shouldShowSearch = availableOptions.length > 10 && !disabled;

  // Define the helper function used to enable search
  // If this is invalidly described, we will assume developer error - tf. avoid rendering
  const getTextKeyHelper = getTextKeyOverride || defaultGetStringKey;

  // Iterate said options
  const filteredOptions = useMemo(() => {
    const currentFilter = filterValue ?? '';
    if (!shouldShowSearch || !currentFilter || !availableOptions.length) {
      // Don't render if available options aren't present, there's no filter active
      return availableOptions;
    }
    // Filter through the values, using a simple text-based search
    // nothing too fancy, but we can add a better search algo later if we need
    const upperFilterValue = currentFilter.toUpperCase();

    return availableOptions.filter((value) =>
      getTextKeyHelper(value).includes(upperFilterValue),
    ) as OptionsType;
  }, [availableOptions, getTextKeyHelper, filterValue, shouldShowSearch]);

  const onSearchChange = useCallback(
    (nextFilterValue: string) => setFilterValue(nextFilterValue),
    [],
  );

  const searchRender = shouldShowSearch ? (
    <MultiSearch
      value={filterValue}
      className={className}
      onChange={onSearchChange}
      placeholder={placeholder}
    />
  ) : null;

  return [filteredOptions, searchRender];
}
