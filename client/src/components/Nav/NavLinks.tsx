import { useLocation } from 'react-router-dom';
import { Fragment, useState, memo } from 'react';
import { Download, FileText } from 'lucide-react';
import { Menu, Transition } from '@headlessui/react';
import { useRecoilValue, useRecoilState } from 'recoil';
import { useGetUserBalance, useGetStartupConfig } from 'librechat-data-provider/react-query';
import type { TConversation } from 'librechat-data-provider';
import FilesView from '~/components/Chat/Input/Files/FilesView';
import { useAuthContext } from '~/hooks/AuthContext';
import { ExportModal } from './ExportConversation';
import { LinkIcon, GearIcon } from '~/components';
import { useLocalize } from '~/hooks';
import Settings from './Settings';
import NavLink from './NavLink';
import Logout from './Logout';
import { cn } from '~/utils/';
import store from '~/store';

function NavLinks() {
  const localize = useLocalize();
  const location = useLocation();
  const { user, isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && startupConfig?.checkBalance,
  });
  const [showExports, setShowExports] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFiles, setShowFiles] = useRecoilState(store.showFiles);

  let conversation;
  const activeConvo = useRecoilValue(store.conversationByIndex(0));
  const globalConvo = useRecoilValue(store.conversation) ?? ({} as TConversation);
  if (location.state?.from?.pathname.includes('/chat')) {
    conversation = globalConvo;
  } else {
    conversation = activeConvo;
  }

  const exportable =
    conversation &&
    conversation.conversationId &&
    conversation.conversationId !== 'new' &&
    conversation.conversationId !== 'search';

  const clickHandler = () => {
    if (exportable) {
      setShowExports(true);
    }
  };

  return (
    <>
      <Menu as="div" className="group relative">
        {({ open }) => (
          <>
            {startupConfig?.checkBalance && balanceQuery.data && (
              <div className="m-1 ml-3 whitespace-nowrap text-left text-sm text-gray-100">
                {`Balance: ${balanceQuery.data}`}
              </div>
            )}
            <Menu.Button
              className={cn(
                'group-ui-open:bg-[#202123] duration-350 mt-text-sm mb-1 flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[#202123]',
                open ? 'bg-[#202123]' : '',
              )}
              data-testid="nav-user"
            >
              <div className="-ml-0.9 -mt-0.8 h-8 w-7 flex-shrink-0">
                <div className="relative flex">
                  <img
                    className="rounded-full"
                    src={
                      user?.avatar ||
                      `https://api.dicebear.com/6.x/initials/svg?seed=${
                        user?.name || 'User'
                      }&fontFamily=Verdana&fontSize=36`
                    }
                    alt=""
                  />
                </div>
              </div>
              <div
                className="mt-2 grow overflow-hidden text-ellipsis whitespace-nowrap text-left font-bold text-white"
                style={{ marginTop: '-4px', marginLeft: '2px' }}
              >
                {user?.name || localize('com_nav_user')}
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
              <Menu.Items className="absolute bottom-full left-0 z-20 mb-1 mt-1 w-full translate-y-0 overflow-hidden rounded-lg bg-[#202123] py-1.5 opacity-100 outline-none">
                <Menu.Item as="div">
                  <NavLink
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-3 rounded-none px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700',
                      exportable ? 'cursor-pointer text-white' : 'cursor-not-allowed text-white/50',
                    )}
                    svg={() => <Download size={16} />}
                    text={localize('com_nav_export_conversation')}
                    clickHandler={clickHandler}
                  />
                </Menu.Item>
                <div className="my-1 h-px bg-white/20" role="none" />
                <Menu.Item as="div">
                  <NavLink
                    className="flex w-full cursor-pointer items-center gap-3 rounded-none px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700"
                    svg={() => <FileText className="icon-md" />}
                    text="My Files"
                    clickHandler={() => setShowFiles(true)}
                  />
                </Menu.Item>
                <Menu.Item as="div">
                  <NavLink
                    className="flex w-full cursor-pointer items-center gap-3 rounded-none px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700"
                    svg={() => <LinkIcon />}
                    text={localize('com_nav_help_faq')}
                    clickHandler={() => window.open('https://docs.librechat.ai/', '_blank')}
                  />
                </Menu.Item>
                <Menu.Item as="div">
                  <NavLink
                    className="flex w-full cursor-pointer items-center gap-3 rounded-none px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700"
                    svg={() => <GearIcon className="icon-md" />}
                    text={localize('com_nav_settings')}
                    clickHandler={() => setShowSettings(true)}
                  />
                </Menu.Item>
                <div className="my-1 h-px bg-white/20" role="none" />
                <Menu.Item as="div">
                  <Logout />
                </Menu.Item>
              </Menu.Items>
            </Transition>
          </>
        )}
      </Menu>
      {showExports && (
        <ExportModal open={showExports} onOpenChange={setShowExports} conversation={conversation} />
      )}
      {showFiles && <FilesView open={showFiles} onOpenChange={setShowFiles} />}
      {showSettings && <Settings open={showSettings} onOpenChange={setShowSettings} />}
    </>
  );
}

export default memo(NavLinks);
