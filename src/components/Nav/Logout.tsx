import { forwardRef } from 'react';
import { LogOutIcon } from '../svg';
import { useLocalize } from '~/hooks';
import { useLogoutVeraUser } from '~/services/mutations/auth';

const Logout = forwardRef(() => {
  const logoutVeraUserMutation = useLogoutVeraUser()
  const localize = useLocalize();

  return (
    <button
      className="flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700"
      onClick={() => logoutVeraUserMutation.mutate()}
    >
      <LogOutIcon />
      {localize('com_nav_log_out')}
    </button>
  );
});

export default Logout;
