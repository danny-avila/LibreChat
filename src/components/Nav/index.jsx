import React, { useState } from 'react';
import NewChat from './NewChat';
import Spinner from '../svg/Spinner';
import Conversations from '../Conversations';
import NavLinks from './NavLinks';
import useDidMountEffect from '~/hooks/useDidMountEffect';
import { swr } from '~/utils/fetchers';
import { useSelector } from 'react-redux';

export default function Nav() {
  const [isHovering, setIsHovering] = useState(false);
  const { conversationId } = useSelector((state) => state.convo);
  const { data, isLoading, mutate } = swr('http://localhost:3050/convos');

  useDidMountEffect(() => mutate(), [conversationId]);

  const containerClasses = isLoading
    ? 'flex flex-col gap-2 text-gray-100 text-sm h-full justify-center items-center'
    : 'flex flex-col gap-2 text-gray-100 text-sm';

  return (
    <div className="dark hidden bg-gray-900 md:fixed md:inset-y-0 md:flex md:w-[260px] md:flex-col">
      <div className="flex h-full min-h-0 flex-col ">
        <div className="scrollbar-trigger flex h-full w-full flex-1 items-start border-white/20">
          <nav className="flex h-full flex-1 flex-col space-y-1 p-2">
            <NewChat />
            <div
              className={`-mr-2 flex-1 flex-col overflow-y-auto ${
                isHovering ? '' : 'scrollbar-transparent'
              } border-b border-white/20`}
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
            >
              <div className={containerClasses}>
                {isLoading ? (
                  <Spinner />
                ) : (
                  <Conversations
                    conversations={data}
                    conversationId={conversationId}
                  />
                )}
              </div>
            </div>
            <NavLinks />
          </nav>
        </div>
      </div>
    </div>
  );
}
