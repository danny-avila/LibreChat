import React from 'react';
import NavLink from './NavLink';
import LogOutIcon from '../svg/LogOutIcon';
import ClearConvos from './ClearConvos';
import DarkMode from './DarkMode';
import Logout from './Logout';

export default function NavLinks() {
  return (
    <>
      <ClearConvos />
      <DarkMode />
      <Logout />
      {/* <NavLink
        svg={LogOutIcon}
        text="Log out"
      /> */}
    </>
  );
}
