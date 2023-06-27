import { forwardRef } from 'react';
import LogOutIcon from '../svg/LogOutIcon';
import { useAuthContext } from '~/hooks/AuthContext';

const Logout = forwardRef(() => {
  const { user, logout } = useAuthContext();

  const handleLogout = () => {
    logout();
    window.location.reload();
  };

  return (
    <button
      className="flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700"
      onClick={handleLogout}
    >
      <LogOutIcon />
      {user?.username || 'USER'}
      <small>{navigator.languages[0]==='zh-CN'?'退出登录':'Log out'}</small>
    </button>
  );
});

export default Logout;
