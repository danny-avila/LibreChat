import React, { useState, useEffect, useRef } from 'react';
import NewChat from './NewChat';
import Spinner from '../svg/Spinner';
import Conversations from '../Conversations';
import NavLinks from './NavLinks';
import useDidMountEffect from '~/hooks/useDidMountEffect';
import { swr } from '~/utils/fetchers';
import { useDispatch, useSelector } from 'react-redux';
import { incrementPage, setConvos } from '~/store/convoSlice';

export default function Nav() {
  const dispatch = useDispatch();
  const [isHovering, setIsHovering] = useState(false);
  const { conversationId, convos, pageNumber } = useSelector((state) => state.convo);
  const onSuccess = (data) => {
    dispatch(setConvos(data));
  };

  const { data, isLoading, mutate } = swr(
    `http://localhost:3080/convos?pageNumber=${pageNumber}`
  , onSuccess);
  const containerRef = useRef(null);
  const scrollPositionRef = useRef(null);

  const showMore = async () => {
    const container = containerRef.current;
    if (container) {
      scrollPositionRef.current = container.scrollTop;
    }
    dispatch(incrementPage());
    await mutate();
  };

  useDidMountEffect(() => mutate(), [conversationId]);

  useEffect(() => {
    const container = containerRef.current;

    if (container && scrollPositionRef.current !== null) {
      const { scrollHeight, clientHeight } = container;
      const maxScrollTop = scrollHeight - clientHeight;

      container.scrollTop = Math.min(maxScrollTop, scrollPositionRef.current);
    }
  }, [data]);

  const containerClasses = isLoading && pageNumber === 1
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
              ref={containerRef}
            >
              <div className={containerClasses}>
                {isLoading && pageNumber === 1 ? (
                  <Spinner />
                ) : (
                  <Conversations
                    conversations={convos}
                    conversationId={conversationId}
                    showMore={showMore}
                    pageNumber={pageNumber}
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
