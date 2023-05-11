import React from 'react';
import LogOutIcon from '../svg/LogOutIcon';
import { useAuthContext } from '~/hooks/AuthContext';

export default function Logout() {
  const { user, logout } = useAuthContext();

  const handleLogout = () => {
    logout();
    window.location.reload();
  };

  return (
    <button
      className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-500/10"
      onClick={handleLogout}
    >
      <LogOutIcon />
      {user?.username || 'USER'}
      <small>Log out</small>
    </button>
  );
}
