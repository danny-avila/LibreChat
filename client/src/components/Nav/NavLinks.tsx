import { Download } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { Fragment, useState, memo } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, Transition } from '@headlessui/react';
import { useGetUserBalance, useGetStartupConfig } from 'librechat-data-provider/react-query';
import type { TConversation } from 'librechat-data-provider';
import { ExportModal } from './ExportConversation';
import { LinkIcon, GearIcon } from '~/components';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';
import Settings from './Settings';
import NavLink from './NavLink';
import Logout from './Logout';
import { cn } from '~/utils/';
import ErrorDialog from '~/components/Messages/Content/ErrorDialog';
import { Tooltip } from 'react-tooltip';

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

  const [showBuyTokens, setShowBuyTokens] = useState(false);

  function formatTokenCount(count) {
    if (count >= 1000 && count < 1000000) {
      return (count / 1000).toFixed(count % 1000 === 0 ? 0 : 1) + 'k';
    } else if (count >= 1000000 && count < 10000000) {
      return (count / 1000000).toFixed(count % 1000000 === 0 ? 0 : 1) + 'M';
    } else if (count >= 10000000) {
      return (count / 10000000).toFixed(count % 10000000 === 0 ? 0 : 1) + '00M';
    } else {
      return count;
    }
  }

  return (
    <>
      <Tooltip id="token-explain" />
      <Menu as="div" className="group relative">
        {({ open }) => (
          <>
            {startupConfig?.checkBalance && (
              <div className="m-1 ml-3 flex flex-col items-start whitespace-nowrap text-left text-sm text-gray-100">
                <div className="flex items-center">
                  <span
                    data-tooltip-id="token-explain"
                    data-tooltip-html="GPT-4 burns tokens at a <br /> rate 15x that of GPT-3.5."
                  >
                    {`Tokens Remaining: ${formatTokenCount(balanceQuery.data)}`}

                    <svg
                      width="18px"
                      height="18px"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="ml-1"
                      style={{ display: 'inline-block' }}
                    >
                      <path
                        d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M9 9C9 5.49997 14.5 5.5 14.5 9C14.5 11.5 12 10.9999 12 13.9999"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M12 18.01L12.01 17.9989"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </div>
                <button
                  onClick={() => setShowBuyTokens(true)}
                  className="mt-2 w-full rounded bg-green-500 p-2 text-white hover:bg-green-600 dark:hover:bg-green-600"
                >
                  Buy Tokens
                </button>
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
                <div className="my-1.5 h-px bg-white/20" role="none" />
                {/* <Menu.Item as="div">
                  <NavLink
                    className="flex w-full cursor-pointer items-center gap-3 rounded-none px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700"
                    svg={() => <LinkIcon />}
                    text={localize('com_nav_help_faq')}
                    clickHandler={() => window.open('https://docs.librechat.ai/', '_blank')}
                  />
                </Menu.Item> */}
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
      {showSettings && <Settings open={showSettings} onOpenChange={setShowSettings} />}
      {showBuyTokens && <ErrorDialog open={showBuyTokens} onOpenChange={setShowBuyTokens} />}
    </>
  );
}

export default memo(NavLinks);
