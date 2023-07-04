import { Menu, Transition } from '@headlessui/react';
import { Fragment, useEffect, useState } from 'react';
import { useRecoilValue } from 'recoil';
import SearchBar from './SearchBar';
import TrashIcon from '../svg/TrashIcon';
import GearIcon from '../svg/GearIcon';
import Settings from './Settings';
import { Download } from 'lucide-react';
import NavLink from './NavLink';
import ExportModel from './ExportConversation/ExportModel';
import ClearConvos from './ClearConvos';
import Logout from './Logout';
import { useAuthContext } from '~/hooks/AuthContext';
import { cn } from '~/utils/';
import DotsIcon from '../svg/DotsIcon';

import store from '~/store';
import CopyIcon from '../svg/CopyIcon';
import CheckMark from '../svg/CheckMark';

export default function NavLinks({ clearSearch, isSearchEnabled }) {
  const [showExports, setShowExports] = useState(false);
  const [showClearConvos, setShowClearConvos] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [refLink, setRefLink] = useState('');
  const [copied, setCopied] = useState(false);
  const { user } = useAuthContext();
  const mode = process.env.NODE_ENV;

  const conversation = useRecoilValue(store.conversation) || {};

  const exportable =
    conversation?.conversationId &&
    conversation?.conversationId !== 'new' &&
    conversation?.conversationId !== 'search';

  const clickHandler = () => {
    if (exportable) setShowExports(true);
  };

  const copyLinkHander = () => {
    navigator.clipboard.writeText(refLink);
    setCopied(true);
  }

  useEffect(() => {
    if (user) setRefLink(mode === 'dev' ? `http://localhost:3090/register/${user.id}` : `aitok.us/register/${user.id}`);
  }, [user]);

  useEffect(() => {
    setTimeout(() => {
      if (copied) setCopied(!copied);
    }, 1000);
  }, [copied])

  return (
    <>
      <Menu as="div" className="group relative">
        {({ open }) => (
          <>
            <Menu.Button
              className={cn(
                'group-ui-open:bg-gray-800 flex w-full items-center gap-2.5 rounded-md px-3 py-3 text-sm transition-colors duration-200 hover:bg-gray-800',
                open ? 'bg-gray-800' : ''
              )}
            >
              <div className="-ml-0.5 h-5 w-5 flex-shrink-0">
                <div className="relative flex">
                  <img
                    className="rounded-sm"
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
              <div className="grow overflow-hidden text-ellipsis whitespace-nowrap text-left text-white">
                {user?.name || 'USER'}
              </div>
              <DotsIcon />
            </Menu.Button>

            <Transition
              as={Fragment}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Menu.Items className="absolute bottom-full left-0 z-20 mb-2 w-full translate-y-0 overflow-hidden rounded-md bg-[#050509] py-1.5 opacity-100 outline-none">
                {isSearchEnabled && (
                  <Menu.Item>
                    <SearchBar clearSearch={clearSearch} />
                  </Menu.Item>
                )}
                <Menu.Item as="div">
                  <NavLink
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-3 rounded-none px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700',
                      exportable ? 'cursor-pointer text-white' : 'cursor-not-allowed text-white/50'
                    )}
                    svg={() => <Download size={16} />}
                    text={navigator.languages[0] === 'zh-CN' ? '导出对话' : 'Export conversation'}
                    clickHandler={clickHandler}
                  />
                </Menu.Item>
                <div className="my-1.5 h-px bg-white/20" role="none" />
                <Menu.Item as="div">
                  <NavLink
                    className="flex w-full cursor-pointer items-center gap-3 rounded-none px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700"
                    svg={() => <TrashIcon />}
                    text={navigator.languages[0] === 'zh-CN' ? "清理对话" : "Clear conversations"}
                    clickHandler={() => setShowClearConvos(true)}
                  />
                </Menu.Item>
                <Menu.Item as="div">
                  <NavLink
                    className="flex w-full cursor-pointer items-center gap-3 rounded-none px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700"
                    svg={() => <GearIcon />}
                    text={navigator.languages[0] === 'zh-CN' ? "设置" : "Settings"}
                    clickHandler={() => setShowSettings(true)}
                  />
                </Menu.Item>
                <div className="my-1.5 h-px bg-white/20" role="none" />
                <div className="flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700">
                  <button onClick={ copyLinkHander }>
                    {copied ? <CheckMark /> : <CopyIcon />}
                  </button>
                  <input className='typing-container'
                    value={refLink}
                    style={{ color: "white", fontSize: "12pt" }}
                    disabled={true} />
                </div>
                <Menu.Item as="div">
                  <Logout />
                </Menu.Item>
              </Menu.Items>
            </Transition>
          </>
        )}
      </Menu>
      {showExports && <ExportModel open={showExports} onOpenChange={setShowExports} />}
      {showClearConvos && <ClearConvos open={showClearConvos} onOpenChange={setShowClearConvos} />}
      {showSettings && <Settings open={showSettings} onOpenChange={setShowSettings} />}
    </>
  );
}
