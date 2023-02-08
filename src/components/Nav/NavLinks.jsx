import React from 'react';
import ClearConvos from './ClearConvos';
import NavLink from './NavLink';
import DarkModeIcon from '../svg/DarkModeIcon';
import LogOutIcon from '../svg/LogOutIcon';

export default function NavLinks() {
  return (
    <>
      <ClearConvos />
      <NavLink
        svg={DarkModeIcon}
        text="Dark mode"
      />
      <NavLink
        svg={LogOutIcon}
        text="Log out"
      />
    </>
  );
}
