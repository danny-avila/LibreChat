import React from 'react';
import SearchBar from './SearchBar';
import ClearConvos from './ClearConvos';
import DarkMode from './DarkMode';
import Logout from './Logout';

export default function NavLinks({ fetch, onSearchSuccess, clearSearch, isSearchEnabled }) {
  return (
    <>
      {!!isSearchEnabled && (
        <SearchBar
          fetch={fetch}
          onSuccess={onSearchSuccess}
          clearSearch={clearSearch}
        />
      )}
      <DarkMode />
      <ClearConvos />
      <Logout />
    </>
  );
}
