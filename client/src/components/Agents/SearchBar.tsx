import React, { useState, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@librechat/client';
import { useDebounce, useLocalize } from '~/hooks';

/**
 * Props for the SearchBar component
 */
interface SearchBarProps {
  /** Current search query value */
  value: string;
  /** Callback fired when the search query changes */
  onSearch: (query: string) => void;
  /** Additional CSS classes */
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
    <div className={`relative w-full max-w-4xl ${className}`} role="search">
      <label htmlFor="agent-search" className="sr-only">
        {localize('com_agents_search_instructions')}
      </label>
      <Input
        id="agent-search"
        type="text"
        value={searchTerm}
        onChange={handleChange}
        placeholder={localize('com_agents_search_placeholder')}
        className="h-12 rounded-xl border-border-medium bg-transparent pl-12 pr-12 text-lg text-text-primary shadow-md transition-[border-color,box-shadow] duration-200 placeholder:text-text-secondary focus:border-border-heavy focus:shadow-lg focus:ring-0"
        aria-label={localize('com_agents_search_aria')}
        aria-describedby="search-instructions search-results-count"
        autoComplete="off"
        spellCheck="false"
      />

      <div className="absolute inset-y-0 left-0 flex items-center pl-4" aria-hidden="true">
        <Search className="size-5 text-text-secondary" />
      </div>
      {/* Hidden instructions for screen readers */}
      <div id="search-instructions" className="sr-only">
        {localize('com_agents_search_instructions')}
      </div>
      {/* Show clear button only when search has value - Google style */}
      {searchTerm && (
        <button
          type="button"
          onClick={handleClear}
          className="group absolute right-4 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          aria-label={localize('com_agents_clear_search')}
          title={localize('com_agents_clear_search')}
        >
          <X
            className="size-5 text-text-secondary transition-colors duration-200 group-hover:text-text-primary"
            strokeWidth={2.5}
          />
        </button>
      )}
    </div>
  );
};

export default SearchBar;
