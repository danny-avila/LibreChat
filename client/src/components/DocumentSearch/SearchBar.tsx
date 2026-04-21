import React, { useState, useEffect } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Input } from '@librechat/client';
import { useLocalize } from '~/hooks';

interface SearchBarProps {
  value: string;
  onSubmit: (query: string) => void;
  isLoading?: boolean;
  className?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({ value, onSubmit, isLoading, className = '' }) => {
  const localize = useLocalize();
  const [searchTerm, setSearchTerm] = useState(value);

  useEffect(() => {
    setSearchTerm(value);
  }, [value]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchTerm.trim();
    if (trimmed) {
      onSubmit(trimmed);
    }
  };

  const handleClear = () => {
    setSearchTerm('');
    onSubmit('');
  };

  return (
    <form onSubmit={handleSubmit} className={`relative w-full ${className}`} role="search">
      <label htmlFor="document-search" className="sr-only">
        {localize('com_document_search_placeholder')}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-5 w-5" aria-hidden="true" />
          )}
        </span>
        <Input
          id="document-search"
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={localize('com_document_search_placeholder')}
          className="h-12 rounded-xl border-border-medium bg-transparent pl-12 pr-12 text-base text-text-primary shadow-sm transition-[border-color,box-shadow] duration-200 placeholder:text-text-secondary focus:border-border-heavy focus:shadow-md focus:ring-0"
          autoComplete="off"
          spellCheck={false}
        />
        {searchTerm && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </form>
  );
};

export default SearchBar;
