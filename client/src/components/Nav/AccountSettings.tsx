import { FileText } from 'lucide-react';
import { useRecoilState } from 'recoil';
import { Fragment, useState, memo } from 'react';
import { Menu, MenuItem, MenuButton, MenuItems, Transition } from '@headlessui/react';
import { useGetUserBalance, useGetStartupConfig } from 'librechat-data-provider/react-query';
import FilesView from '~/components/Chat/Input/Files/FilesView';
import { useAuthContext } from '~/hooks/AuthContext';
import useAvatar from '~/hooks/Messages/useAvatar';
import { LinkIcon, GearIcon } from '~/components';
import { UserIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import Management from './Management';
import Settings from './Settings';
import NavLink from './NavLink';
import Logout from './Logout';
import { cn } from '~/utils/';
import store from '~/store';
import { SystemRoles } from 'librechat-data-provider';

function AccountSettings() {
  const localize = useLocalize();
  const { user, isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && startupConfig?.checkBalance,
  });
  const [showManagement, setShowManagement] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFiles, setShowFiles] = useRecoilState(store.showFiles);

  const avatarSrc = useAvatar(user);
  const name = user?.avatar ?? user?.username ?? '';

  return (
    <>
      <Menu as="div" className="group relative">
        {({ open }) => (
          <>
            <MenuButton
              aria-label={localize('com_nav_account_settings')}
              className={cn(
                'group-ui-open:bg-surface-tertiary duration-350 mt-text-sm flex h-auto w-full items-center gap-2 rounded-lg p-2 text-sm transition-colors hover:bg-surface-secondary',
                open ? 'bg-surface-secondary' : '',
              )}
              data-testid="nav-user"
            >
              <div className="-ml-0.9 -mt-0.8 h-8 w-8 flex-shrink-0">
                <div className="relative flex">
                  {name.length === 0 ? (
                    <div
                      style={{
                        backgroundColor: 'rgb(121, 137, 255)',
                        width: '32px',
                        height: '32px',
                        boxShadow: 'rgba(240, 246, 252, 0.1) 0px 0px 0px 1px',
                      }}
                      className="relative flex items-center justify-center rounded-full p-1 text-text-primary"
                    >
                      <UserIcon />
                    </div>
                  ) : (
                    <img className="rounded-full" src={user?.avatar ?? avatarSrc} alt="avatar" />
                  )}
                </div>
              </div>
              <div
                className="mt-2 grow overflow-hidden text-ellipsis whitespace-nowrap text-left text-text-primary"
                style={{ marginTop: '0', marginLeft: '0' }}
              >
                {user?.name ?? user?.username ?? localize('com_nav_user')}
              </div>
            </MenuButton>

            <Transition
              as={Fragment}
              enter="transition ease-out duration-100 transform"
              enterFrom="translate-y-2 opacity-0"
              enterTo="translate-y-0 opacity-100"
              leave="transition ease-in duration-100 transform"
              leaveFrom="translate-y-0 opacity-100"
              leaveTo="translate-y-2 opacity-0"
            >
              <MenuItems className="absolute bottom-full left-0 z-[100] mb-1 mt-1 w-full translate-y-0 overflow-hidden rounded-lg border border-border-medium bg-header-primary p-1.5 opacity-100 shadow-lg outline-none">
                <div className="text-token-text-secondary ml-3 mr-2 py-2 text-sm" role="none">
                  {user?.email ?? localize('com_nav_user')}
                </div>
                <div className="my-1.5 h-px border-b border-border-medium" role="none" />
                {startupConfig?.checkBalance === true &&
                  balanceQuery.data != null &&
                  !isNaN(parseFloat(balanceQuery.data)) && (
                    <>
                      <div className="text-token-text-secondary ml-3 mr-2 py-2 text-sm">
                        {`Balance: ${parseFloat(balanceQuery.data).toFixed(2)}`}
                      </div>
                      <div className="my-1.5 h-px border-b border-border-medium" role="none" />
                    </>
                  )}
                <MenuItem>
                  {({ focus }) => (
                    <NavLink
                      className={focus ? 'bg-surface-hover' : ''}
                      svg={() => <FileText className="icon-md" />}
                      text={localize('com_nav_my_files')}
                      clickHandler={() => setShowFiles(true)}
                    />
                  )}
                </MenuItem>
                {
                  user?.role === SystemRoles.ADMIN ? <>
                    <MenuItem>
                      {({ focus }) => (
                        <NavLink
                          className={focus ? 'bg-surface-hover' : ''}
                          svg={() => <GearIcon className="icon-md" />}
                          text={localize('com_nav_settings')}
                          clickHandler={() => setShowSettings(true)}
                        />
                      )}
                    </MenuItem>
                    <MenuItem>
                      {({ focus }) => (
                        <NavLink
                          className={focus ? 'bg-surface-hover' : ''}
                          svg={() => <GearIcon className="icon-md" />}
                          text='管理'
                          clickHandler={() => setShowManagement(true)}
                        />
                      )}
                    </MenuItem>
                  </> : null
                }
                <div className="my-1.5 h-px border-b border-border-medium" role="none" />
                <MenuItem>
                  {({ focus }) => <Logout className={focus ? 'bg-surface-hover' : ''} />}
                </MenuItem>
              </MenuItems>
            </Transition>
          </>
        )}
      </Menu>
      {showFiles && <FilesView open={showFiles} onOpenChange={setShowFiles} />}
      {showSettings && <Settings open={showSettings} onOpenChange={setShowSettings} />}
      {showManagement && <Management open={showManagement} onOpenChange={setShowManagement} />}
    </>
  );
}

export default memo(AccountSettings);
