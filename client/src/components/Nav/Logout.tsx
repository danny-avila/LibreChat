import { forwardRef } from 'react';
import { LogOutIcon } from '../svg';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';

const Logout = forwardRef(() => {
  const { logout } = useAuthContext();
  const localize = useLocalize();

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
      {localize('com_nav_log_out')}
    </button>
  );
});

export default Logout;
