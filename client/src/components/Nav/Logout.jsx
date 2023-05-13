import React from 'react';
import LogOutIcon from '../svg/LogOutIcon';
import { useAuthContext } from '~/hooks/AuthContext';

export default function Logout({ onClick }) {
  const { user, logout } = useAuthContext();

  const handleLogout = (e) => {
    if (onClick) onClick(e);
    logout()
    window.location.reload();
  };

  return (
    <button
      className="flex py-3 px-3 items-center gap-3 transition-colors duration-200 text-white cursor-pointer text-sm hover:bg-gray-700 w-full"
      onClick={handleLogout}
    >
      <LogOutIcon />
      {user?.username || 'USER'}
      <small>Log out</small>
    </button>
  );
}
