import { forwardRef } from 'react';
import { LogOutIcon } from '../svg';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';

const Logout = forwardRef(() => {
  const { logout } = useAuthContext();
  const localize = useLocalize();

  return (
    <button
      className="flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-sm text-black transition-colors duration-200 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700"
      onClick={() => logout()}
    >
      <LogOutIcon />
      {localize('com_nav_log_out')}
    </button>
  );
});

export default Logout;
