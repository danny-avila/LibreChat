import React from 'react';
import NavLink from './NavLink';
import LogOutIcon from '../svg/LogOutIcon';
import ClearConvos from './ClearConvos';
import DarkMode from './DarkMode';

export default function NavLinks() {
  return (
    <>
      <ClearConvos />
      <DarkMode />
      <NavLink
        svg={LogOutIcon}
        text="Log out"
      />
    </>
  );
}
