import React, { useState, useMemo } from 'react';
import type { TPrincipal, PrincipalSearchParams } from 'librechat-data-provider';
import { useSearchPrincipalsQuery } from 'librechat-data-provider/react-query';
import PeoplePickerSearchItem from './PeoplePickerSearchItem';
import SelectedPrincipalsList from './SelectedPrincipalsList';
import { SearchPicker } from './SearchPicker';
import { useLocalize } from '~/hooks';

interface PeoplePickerProps {
  onSelectionChange: (principals: TPrincipal[]) => void;
  placeholder?: string;
  className?: string;
  typeFilter?: 'user' | 'group' | null;
}

export default function PeoplePicker({
  onSelectionChange,
  placeholder,
  className = '',
  typeFilter = null,
}: PeoplePickerProps) {
  const localize = useLocalize();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShares, setSelectedShares] = useState<TPrincipal[]>([]);

  const searchParams: PrincipalSearchParams = useMemo(
    () => ({
      q: searchQuery,
      limit: 30,
      ...(typeFilter && { type: typeFilter }),
    }),
    [searchQuery, typeFilter],
  );

  const {
    data: searchResponse,
    isLoading: queryIsLoading,
    error,
  } = useSearchPrincipalsQuery(searchParams, {
    enabled: searchQuery.length >= 2,
  });

  const isLoading = searchQuery.length >= 2 && queryIsLoading;

  const selectableResults = useMemo(() => {
    const results = searchResponse?.results || [];

    return results.filter(
      (result) => !selectedShares.some((share) => share.idOnTheSource === result.idOnTheSource),
    );
  }, [searchResponse?.results, selectedShares]);

  if (error) {
    console.error('Principal search error:', error);
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="relative">
        <SearchPicker<TPrincipal & { key: string; value: string }>
          options={selectableResults.map((s) => {
            const key = s.idOnTheSource || 'unknown' + 'picker_key';
            const value = s.idOnTheSource || 'Unknown';
            return {
              ...s,
              id: s.id ?? undefined,
              key,
              value,
            };
          })}
          renderOptions={(o) => <PeoplePickerSearchItem principal={o} />}
          placeholder={placeholder || localize('com_ui_search_default_placeholder')}
          query={searchQuery}
          onQueryChange={(query: string) => {
            setSearchQuery(query);
          }}
          onPick={(principal) => {
            console.log('Selected Principal:', principal);
            setSelectedShares((prev) => {
              const newArray = [...prev, principal];
              onSelectionChange([...newArray]);
              return newArray;
            });
            setSearchQuery('');
          }}
          label={localize('com_ui_search_users_groups')}
          isLoading={isLoading}
        />
      </div>

      <SelectedPrincipalsList
        principles={selectedShares}
        onRemoveHandler={(idOnTheSource: string) => {
          setSelectedShares((prev) => {
            const newArray = prev.filter((share) => share.idOnTheSource !== idOnTheSource);
            onSelectionChange(newArray);
            return newArray;
          });
        }}
      />
    </div>
  );
}
