import React, { useCallback, useState, useEffect } from 'react';
import { Input } from '~/components/ui/Input';
import { debounce } from 'lodash';

interface SearchBarProps {
  search: string;
  setSearch: (v: string) => void;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
  placeholder?: string; // ✅ ADD THIS LINE
}


export const SearchBar: React.FC<SearchBarProps> = React.memo(({ search, setSearch, disabled, inputRef, placeholder }) => {
  const [localSearch, setLocalSearch] = useState(search);

  // Sync local state with parent
  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  // Restore focus after render
  useEffect(() => {
    if (inputRef?.current && document.activeElement !== inputRef.current) {
      console.log('[SearchBar] Restoring focus');
      inputRef.current.focus();
    }
  }, [localSearch, inputRef]);

  const debouncedSetSearch = useCallback(
    debounce((value: string) => {
      console.log('[SearchBar] Debounced setSearch:', value);
      setSearch(value);
    }, 300),
    [setSearch]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    console.log('[SearchBar] Input change:', value);
    setLocalSearch(value);
    debouncedSetSearch(value);
  };

  return (
    <div className="flex w-full gap-2">
      <Input
        key="search-input"
        className="flex-1"
        placeholder={placeholder || "Search by name, email, username, or action"} // ✅ USE PROP
        value={localSearch}
        onChange={handleChange}
        disabled={disabled}
        aria-label="Search user activity logs"
        ref={inputRef}
      />

    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.search === nextProps.search && prevProps.disabled === nextProps.disabled;
});