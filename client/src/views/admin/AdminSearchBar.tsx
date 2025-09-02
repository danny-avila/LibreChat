import React from 'react';
import { Input } from '~/components/ui/Input';

interface SearchBarProps {
  search: string;
  setSearch: (v: string) => void;
  onSearch: () => void;
  disabled?: boolean; // 👈 allow disabled
}

export const SearchBar: React.FC<SearchBarProps> = ({ search, setSearch, onSearch, disabled }) => {
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearch();
    }
  };

  return (
    <div className="flex w-full gap-2">
      <Input
        className="flex-1"
        placeholder="Search by name, email or role"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={handleKeyPress}
        disabled={disabled} // 👈 apply here
      />
    </div>
  );
};
