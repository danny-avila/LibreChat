import React from 'react';
import LogOutIcon from '../svg/LogOutIcon';
import { useAuthContext } from '~/hooks/AuthContext';

export default function Logout() {
  const { user, logout } = useAuthContext();

  return (
    <button
      className="flex cursor-pointer items-center gap-3 rounded-md py-3 px-3 text-sm text-white transition-colors duration-200 hover:bg-gray-500/10"
      onClick={logout}
    >
      <LogOutIcon />
      {user?.username || 'USER'}
      <small>Log out</small>
    </button>
  );
}
