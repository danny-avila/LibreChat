import React, { useState, useEffect, useRef } from 'react';
import NewChat from './NewChat';
import Spinner from '../svg/Spinner';
import Conversations from '../Conversations';
import NavLinks from './NavLinks';
import useDidMountEffect from '~/hooks/useDidMountEffect';
import { swr } from '~/utils/fetchers';
import { useDispatch, useSelector } from 'react-redux';
import { increasePage, decreasePage, setPage, setConvos, setPages } from '~/store/convoSlice';

export default function Nav({ navVisible, setNavVisible }) {
  const dispatch = useDispatch();
  const [isHovering, setIsHovering] = useState(false);
  const { conversationId, convos, pages, pageNumber, refreshConvoHint } = useSelector(
    (state) => state.convo
  );
  const onSuccess = (data) => {
    const { conversations, pages } = data;

    if (pageNumber > pages) {
      dispatch(setPage(pages));
    } else {
      dispatch(setConvos(conversations));
      dispatch(setPages(pages));
    }
  };

  const { data, isLoading, mutate } = swr(`/api/convos?pageNumber=${pageNumber}`, onSuccess, {
    revalidateOnMount: false
  });

  const containerRef = useRef(null);
  const scrollPositionRef = useRef(null);

  const moveToTop = () => {
    const container = containerRef.current;
    if (container) {
      scrollPositionRef.current = container.scrollTop;
    }
  };

  const nextPage = async () => {
    moveToTop();

    dispatch(increasePage());
    await mutate();
  };

  const previousPage = async () => {
    moveToTop();

    dispatch(decreasePage());
    await mutate();
  };

  useEffect(() => {
    mutate();
  }, [pageNumber, conversationId, refreshConvoHint]);

  useEffect(() => {
    const container = containerRef.current;

    if (container && scrollPositionRef.current !== null) {
      const { scrollHeight, clientHeight } = container;
      const maxScrollTop = scrollHeight - clientHeight;

      container.scrollTop = Math.min(maxScrollTop, scrollPositionRef.current);
    }
  }, [data]);

  useEffect(() => {
    setNavVisible(false);
  }, [conversationId]);

  const toggleNavVisible = () => {
    setNavVisible((prev) => {
      return !prev;
    });
  };

  const containerClasses =
    isLoading && pageNumber === 1
      ? 'flex flex-col gap-2 text-gray-100 text-sm h-full justify-center items-center'
      : 'flex flex-col gap-2 text-gray-100 text-sm';

  return (
    <>
      <div
        className={
          'nav dark bg-gray-900 md:fixed md:inset-y-0 md:flex md:w-[260px] md:flex-col' +
          (navVisible ? ' active' : '')
        }
      >
        <div className="flex h-full min-h-0 flex-col ">
          <div className="scrollbar-trigger flex h-full w-full flex-1 items-start border-white/20">
            <nav className="flex h-full flex-1 flex-col space-y-1 p-2">
              <NewChat />
              <div
                className={`flex-1 flex-col overflow-y-auto ${
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
                      nextPage={nextPage}
                      previousPage={previousPage}
                      moveToTop={moveToTop}
                      pageNumber={pageNumber}
                      pages={pages}
                    />
                  )}
                </div>
              </div>
              <NavLinks />
            </nav>
          </div>
        </div>
        <button
          type="button"
          className="nav-close-button -ml-0.5 -mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-md text-white hover:text-gray-900 hover:text-white focus:outline-none focus:ring-white"
          onClick={toggleNavVisible}
        >
          <span className="sr-only">Menu latteral</span>
          <svg
            stroke="currentColor"
            fill="none"
            strokeWidth="1.5"
            viewBox="0 0 24 24"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
            height="1em"
            width="1em"
            xmlns="http://www.w3.org/2000/svg"
          >
            <line
              x1="3"
              y1="6"
              x2="15"
              y2="18"
            />
            <line
              x1="3"
              y1="18"
              x2="15"
              y2="6"
            />
          </svg>
        </button>
      </div>
      <div
        className={'nav-mask' + (navVisible ? ' active' : '')}
        onClick={toggleNavVisible}
      ></div>
    </>
  );
}
