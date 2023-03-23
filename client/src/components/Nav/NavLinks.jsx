import React from 'react';
import SearchBar from './SearchBar';
import ClearConvos from './ClearConvos';
import DarkMode from './DarkMode';
import Logout from './Logout';
import { useSelector } from 'react-redux';

export default function NavLinks({ fetch, onSearchSuccess, clearSearch }) {
  const { searchEnabled } = useSelector((state) => state.search);
  return (
    <>
      { !!searchEnabled && <SearchBar fetch={fetch} onSuccess={onSearchSuccess} clearSearch={clearSearch}/>}
      <DarkMode />
      <ClearConvos />
      <Logout />
    </>
  );
}
