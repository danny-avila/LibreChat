import React, { useState, useMemo } from 'react';
import { PrincipalType } from 'librechat-data-provider';
import type { TPrincipal, PrincipalSearchParams } from 'librechat-data-provider';
import { useSearchPrincipalsQuery } from 'librechat-data-provider/react-query';
import { useLocalize, usePeoplePickerPermissions } from '~/hooks';
import PeoplePickerSearchItem from './PeoplePickerSearchItem';
import SelectedPrincipalsList from './SelectedPrincipalsList';
import { SearchPicker } from './SearchPicker';

interface PeoplePickerProps {
  onSelectionChange: (principals: TPrincipal[]) => void;
  placeholder?: string;
  className?: string;
  typeFilter?: PrincipalType.USER | PrincipalType.GROUP | PrincipalType.ROLE | null;
}

export default function PeoplePicker({
  onSelectionChange,
  placeholder,
  className = '',
  typeFilter = null,
}: PeoplePickerProps) {
  const localize = useLocalize();
  const { canViewUsers, canViewGroups, canViewRoles } = usePeoplePickerPermissions();
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

  /** Get appropriate label based on permissions */
  const getSearchLabel = () => {
    const permissions = [canViewUsers, canViewGroups, canViewRoles];
    const permissionCount = permissions.filter(Boolean).length;

    if (permissionCount === 3) {
      return localize('com_ui_search_users_groups_roles');
    } else if (permissionCount === 2) {
      if (canViewUsers && canViewGroups) {
        return localize('com_ui_search_users_groups');
      }
    } else if (canViewUsers) {
      return localize('com_ui_search_users');
    } else if (canViewGroups) {
      return localize('com_ui_search_groups');
    } else if (canViewRoles) {
      return localize('com_ui_search_roles');
    }

    return localize('com_ui_search_users_groups');
  };

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
          label={getSearchLabel()}
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
