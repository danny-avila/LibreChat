import { useLocation } from 'react-router-dom';
import { Fragment, useState, memo } from 'react';
import { FileText } from 'lucide-react';
import { Menu, Transition } from '@headlessui/react';
import { useRecoilValue, useRecoilState } from 'recoil';
import { useGetUserBalance, useGetStartupConfig } from 'librechat-data-provider/react-query';
import type { TConversation } from 'librechat-data-provider';
import FilesView from '~/components/Chat/Input/Files/FilesView';
import { useAuthContext } from '~/hooks/AuthContext';
import useAvatar from '~/hooks/Messages/useAvatar';
import { LinkIcon, GearIcon } from '~/components';
import { UserIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import Settings from '~/components/Nav/Settings';
import NavLink from '~/components/Nav/NavLink';
import Logout from '~/components/Nav/Logout';
import { cn } from '~/utils/';
import store from '~/store';

interface ProfileButtonProps {
  className?: string;
}

function ProfileButton({ className }: ProfileButtonProps) {
  const localize = useLocalize();
  const location = useLocation();
  const { user, isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && startupConfig?.checkBalance,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showFiles, setShowFiles] = useRecoilState(store.showFiles);

  const activeConvo = useRecoilValue(store.conversationByIndex(0));
  const globalConvo = useRecoilValue(store.conversation) ?? ({} as TConversation);

  const avatarSrc = useAvatar(user);

  let conversation: TConversation | null | undefined;
  if (location.state?.from?.pathname.includes('/chat')) {
    conversation = globalConvo;
  } else {
    conversation = activeConvo;
  }

  return (
    <>
      <Menu as="div" className={cn('group', className)}>
        {({ open }) => (
          <>
            <Menu.Button
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 focus-visible:bg-gray-100 focus-visible:outline-0 dark:hover:bg-gray-700',
                open ? 'bg-gray-100 dark:bg-gray-700' : '',
              )}
              data-testid="nav-user"
            >
              <div className="flex items-center justify-center overflow-hidden rounded-full">
                <div className="relative flex">
                  {!user?.avatar && !user?.username ? (
                    <div
                      style={{
                        backgroundColor: 'rgb(121, 137, 255)',
                        width: '32px',
                        height: '32px',
                        boxShadow: 'rgba(240, 246, 252, 0.1) 0px 0px 0px 1px',
                      }}
                      className="relative flex items-center justify-center rounded-full p-1 text-white"
                    >
                      <UserIcon />
                    </div>
                  ) : (
                    <img className="rounded-sm" width={32} height={32} src={user?.avatar || avatarSrc} alt="avatar" />
                  )}
                </div>
              </div>
            </Menu.Button>

            <Transition
              as={Fragment}
              enter="transition ease-out duration-110 transform"
              enterFrom="translate-y-2 opacity-0"
              enterTo="translate-y-0 opacity-100"
              leave="transition ease-in duration-100 transform"
              leaveFrom="translate-y-0 opacity-100"
              leaveTo="translate-y-2 opacity-0"
            >
              <Menu.Items className="top-15 absolute right-0 z-[100] mb-1 mr-2 mt-1 w-64 translate-y-0 overflow-hidden rounded-2xl border border-gray-300 bg-white p-2 opacity-100 shadow-lg outline-none dark:border-gray-600 dark:bg-gray-700">
                {startupConfig?.checkBalance &&
                  balanceQuery.data &&
                  !isNaN(parseFloat(balanceQuery.data)) && (
                  <>
                    <div className="text-token-text-secondary ml-3 mr-2 py-2 text-sm">
                      {`Balance: ${parseFloat(balanceQuery.data).toFixed(2)}`}
                    </div>
                    <div className="my-1.5 h-px bg-black/10 dark:bg-white/10" role="none" />
                  </>
                )}
                <Menu.Item as="div">
                  <NavLink
                    svg={() => <FileText className="icon-md" />}
                    text={localize('com_nav_my_files')}
                    clickHandler={() => setShowFiles(true)}
                  />
                </Menu.Item>
                {startupConfig?.helpAndFaqURL !== '/' && (
                  <Menu.Item as="div">
                    <NavLink
                      svg={() => <LinkIcon />}
                      text={localize('com_nav_help_faq')}
                      clickHandler={() => window.open(startupConfig?.helpAndFaqURL, '_blank')}
                    />
                  </Menu.Item>
                )}
                <Menu.Item as="div">
                  <NavLink
                    svg={() => <GearIcon className="icon-md" />}
                    text={localize('com_nav_settings')}
                    clickHandler={() => setShowSettings(true)}
                  />
                </Menu.Item>
                <div className="my-1.5 h-px bg-black/10 dark:bg-white/10" role="none" />
                <Menu.Item as="div">
                  <Logout />
                </Menu.Item>
              </Menu.Items>
            </Transition>
          </>
        )}
      </Menu>
      {showFiles && <FilesView open={showFiles} onOpenChange={setShowFiles} />}
      {showSettings && <Settings open={showSettings} onOpenChange={setShowSettings} />}
    </>
  );
}

export default memo(ProfileButton);
