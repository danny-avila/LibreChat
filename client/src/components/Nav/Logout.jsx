import { forwardRef } from 'react';
import LogOutIcon from '../svg/LogOutIcon';
import { useAuthContext } from '~/hooks/AuthContext';
import store from '~/store';
import { useRecoilValue } from 'recoil';
import { localize } from '~/localization/Translation';

const Logout = forwardRef(() => {
  const lang = useRecoilValue(store.lang);
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
      {user?.username || 'USER'}{' '}
      {localize(lang, 'com_nav_log_out')}
    </button>
  );
});

export default Logout;
