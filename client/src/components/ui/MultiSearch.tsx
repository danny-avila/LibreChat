import React, { useState, useMemo, useCallback } from 'react';
import type { TPlugin } from 'librechat-data-provider';
import { Search } from 'lucide-react';
import { useLocalize } from '~/hooks';

// This is a generic that can be added to Menu and Select components

export default function MultiSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string | null;
  onChange: (filter: string) => void;
  placeholder?: string;
}) {
  const localize = useLocalize();
  const onChangeHandler = useCallback((e) => onChange(e.target.value), []);

  return (
    <div className="sticky left-0 top-0 z-10 flex h-12 items-center gap-3 bg-white px-5 py-2.5 !pr-3 text-left transition-all dark:bg-gray-800">
      <Search className="h-6 w-6 text-gray-500" />
      <input
        type="text"
        value={value || ''}
        onChange={onChangeHandler}
        placeholder={placeholder || localize('com_ui_select_search_model')}
        className="flex-1 px-2.5 py-1"
      />
    </div>
  );
}

/**
 * Helper function that will take a multiSearch input
 * @param node
 */
function defaultGetStringKey(node: unknown): string {
  if (typeof node === 'string') {
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
 * @returns
 */
export function useMultiSearch<OptionsType extends unknown[]>(
  availableOptions: OptionsType,
  placeholder?: string,
  getTextKeyOverride?: (node: OptionsType[0]) => string,
): [OptionsType, React.ReactNode] {
  const [filterValue, setFilterValue] = useState<string | null>(null);

  // We conditionally show the search when there's more than 10 elements in the menu
  const shouldShowSearch = availableOptions.length > 10;

  // Define the helper function used to enable search
  // If this is invalidly described, we will assume developer error - tf. avoid rendering
  const getTextKeyHelper = getTextKeyOverride || defaultGetStringKey;

  // Iterate said options
  const filteredOptions = useMemo(() => {
    if (!shouldShowSearch || !filterValue || !availableOptions.length) {
      // Don't render if available options aren't present, there's no filter active
      return availableOptions;
    }
    // Filter through the values, using a simple text-based search
    // nothing too fancy, but we can add a better search algo later if we need
    const upperFilterValue = filterValue.toUpperCase();

    return availableOptions.filter((value) =>
      getTextKeyHelper(value).includes(upperFilterValue),
    ) as OptionsType;
  }, [availableOptions, getTextKeyHelper, filterValue, shouldShowSearch]);

  const onSearchChange = useCallback((nextFilterValue) => setFilterValue(nextFilterValue), []);

  const searchRender = shouldShowSearch ? (
    <MultiSearch value={filterValue} onChange={onSearchChange} placeholder={placeholder} />
  ) : null;

  return [filteredOptions, searchRender];
}
