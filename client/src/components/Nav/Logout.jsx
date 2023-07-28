import { forwardRef } from 'react';
import { LogOutIcon } from '../svg';
import { useAuthContext } from '~/hooks/AuthContext';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { localize } from '~/localization/Translation';

const Logout = forwardRef(() => {
  const { user, logout } = useAuthContext();
  const lang = useRecoilValue(store.lang);

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
      {user?.username || localize(lang, 'com_nav_user')}
      <small>{localize(lang, 'com_nav_log_out')}</small>
    </button>
  );
});

export default Logout;
