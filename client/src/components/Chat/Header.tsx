import { useOutletContext } from 'react-router-dom';
import type { ContextType } from '~/common';
import { EndpointsMenu, PresetsMenu, HeaderNewChat } from './Menus';
import HeaderOptions from './Input/HeaderOptions';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { useChatContext } from '~/Providers';

export default function Header() {
  const { navVisible } = useOutletContext<ContextType>();
  const convoType = useRecoilValue(store.convoType);
  const { conversation } = useChatContext();
  return (
    <div className="sticky top-0 z-20 flex h-14 w-full items-center justify-between bg-white p-2 font-semibold dark:bg-gray-800 dark:text-white">
      <div className="hide-scrollbar flex items-center gap-2 overflow-x-auto">
        {!navVisible && <HeaderNewChat />}
        {convoType === 'r' && conversation?.conversationId !== 'new' ? (
          <div className="p-3 text-lg">{conversation?.endpoint === 'sdImage' ? 'Images' : conversation?.endpoint}</div>
        ) : (
          <EndpointsMenu />
        )}
        <HeaderOptions />
        <PresetsMenu />
      </div>
      {/* Empty div for spacing */}
      <div />
    </div>
  );
}
