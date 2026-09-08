import React, { useState, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { Button, Input } from '@librechat/client';
import { useDebounce, useLocalize } from '~/hooks';

/**
 * Props for the SearchBar component
 */
interface SearchBarProps {
  /** Current search query value */
  value: string;
  /** Callback fired when the search query changes */
  onSearch: (query: string) => void;
  /**
   * Additional CSS classes for the wrapper. The component carries no width cap of
   * its own, so the caller owns sizing (e.g. `max-w-[420px]` in a toolbar row).
   */
  className?: string;
}

/**
 * SearchBar - Component for searching agents with debounced input
 *
 * Provides a search input with clear button and debounced search functionality.
 * Includes proper ARIA attributes for accessibility and visual indicators.
 * Uses 300ms debounce delay to prevent excessive API calls during typing.
 */
const SearchBar: React.FC<SearchBarProps> = ({ value, onSearch, className = '' }) => {
  const localize = useLocalize();
  const [searchTerm, setSearchTerm] = useState(value);

  // Debounced search value (300ms delay)
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Update internal state when props change
  useEffect(() => {
    setSearchTerm(value);
  }, [value]);

  // Trigger search when debounced value changes
  useEffect(() => {
    // Only trigger search if the debounced value matches current searchTerm
    // This prevents stale debounced values from triggering after clear
    if (debouncedSearchTerm !== value && debouncedSearchTerm === searchTerm) {
      onSearch(debouncedSearchTerm);
    }
  }, [debouncedSearchTerm, onSearch, value, searchTerm]);

  /**
   * Handle search input changes
   *
   * @param e - Input change event
   */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  /**
   * Clear the search input and reset results
   */
  const handleClear = useCallback(() => {
    // Immediately call parent onSearch to clear the URL parameter
    onSearch('');
    // Also clear local state
    setSearchTerm('');
  }, [onSearch]);

  return (
    <div className={`relative w-full ${className}`} role="search">
      <label htmlFor="agent-search" className="sr-only">
        {localize('com_agents_search_instructions')}
      </label>
      <Input
        id="agent-search"
        type="text"
        value={searchTerm}
        onChange={handleChange}
        placeholder={localize('com_agents_search_placeholder')}
        className="h-[38px] rounded-[10px] border-border-light bg-surface-secondary pl-9 pr-9 text-sm text-text-primary transition-[border-color,background-color] duration-200 placeholder:text-text-tertiary focus:border-border-heavy focus:bg-surface-primary focus:ring-0"
        aria-label={localize('com_agents_search_aria')}
        aria-describedby="search-instructions search-results-count"
        autoComplete="off"
        spellCheck="false"
      />

      <div className="absolute inset-y-0 left-0 flex items-center pl-3" aria-hidden="true">
        <Search className="size-4 text-text-tertiary" />
      </div>
      {/* Hidden instructions for screen readers */}
      <div id="search-instructions" className="sr-only">
        {localize('com_agents_search_instructions')}
      </div>
      {/* Show clear button only when search has value - Google style */}
      {searchTerm && (
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={handleClear}
          className="group absolute right-3 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-text-primary focus:ring-offset-2"
          aria-label={localize('com_agents_clear_search')}
          title={localize('com_agents_clear_search')}
        >
          <X
            className="size-4 text-text-secondary transition-colors duration-200 group-hover:text-text-primary"
            strokeWidth={2.5}
            aria-hidden="true"
          />
        </Button>
      )}
    </div>
  );
};

export default SearchBar;
