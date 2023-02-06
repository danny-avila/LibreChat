import React from 'react';
import NavLink from './NavLink';
import TrashIcon from './svg/TrashIcon';
import DarkModeIcon from './svg/DarkModeIcon';
import LogOutIcon from './svg/LogOutIcon';

export default function NavLinks() {
  return (
    <>
      <NavLink
        svg={TrashIcon}
        text="Clear conversations"
      />
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
