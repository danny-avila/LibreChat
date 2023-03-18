import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import _ from 'lodash';
import NewChat from './NewChat';
import Spinner from '../svg/Spinner';
import Pages from '../Conversations/Pages';
import Conversations from '../Conversations';
import NavLinks from './NavLinks';
import { swr } from '~/utils/fetchers';
import { useDispatch, useSelector } from 'react-redux';
import { setConvos, refreshConversation } from '~/store/convoSlice';

const fetch = async (q, pageNumber, callback) => {
  const { data } = await axios.get(`/api/search?q=${q}&pageNumber=${pageNumber}`);
  console.log(data);
  callback(data);
};

export default function Nav({ navVisible, setNavVisible }) {
  const dispatch = useDispatch();
  const [isHovering, setIsHovering] = useState(false);
  const [pages, setPages] = useState(1);
  const [pageNumber, setPage] = useState(1);
  const { search, query } = useSelector((state) => state.search);
  const { conversationId, convos, refreshConvoHint } = useSelector((state) => state.convo);
  const onSuccess = (data, searchFetch = false) => {
    if (search) {
      return;
    }

    const { conversations, pages } = data;
    if (pageNumber > pages) {
      setPage(pages);
    } else {
      dispatch(setConvos({ convos: conversations, searchFetch }));
      setPages(pages);
    }
  };

  const onSearchSuccess = (data, expectedPage) => {
    const res = data;
    dispatch(setConvos({ convos: res.conversations, searchFetch: true }));
    if (expectedPage) {
      setPage(expectedPage);
    }
    setPage(res.pageNumber);
    setPages(res.pages);
  };

  const clearSearch = () => {
    setPage(1);
    dispatch(refreshConversation());
  };

  const { data, isLoading, mutate } = swr(`/api/convos?pageNumber=${pageNumber}`, onSuccess, {
    revalidateOnMount: false,
    // populateCache: false,
    // revalidateIfStale: false,
    // revalidateOnFocus: false,
    // revalidateOnReconnect : false,
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

    if (!search) {
      setPage((prev) => prev + 1);
      await mutate();
    } else {
      await fetch(query, +pageNumber + 1, _.partialRight(onSearchSuccess, +pageNumber + 1));
    }
  };

  const previousPage = async () => {
    moveToTop();

    if (!search) {
      setPage((prev) => prev - 1);
      await mutate();
    } else {
      await fetch(query, +pageNumber - 1, _.partialRight(onSearchSuccess, +pageNumber - 1));
    }
  };

  useEffect(() => {
    if (!search) {
      mutate();
    }
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
                  {isLoading && (pageNumber === 1 || search) ? (
                    <Spinner />
                  ) : (
                    <Conversations
                      conversations={convos}
                      conversationId={conversationId}
                      moveToTop={moveToTop}
                    />
                  )}
                  <Pages
                    pageNumber={pageNumber}
                    pages={pages}
                    nextPage={nextPage}
                    previousPage={previousPage}
                  />
                </div>
              </div>
              <NavLinks
                onSearchSuccess={onSearchSuccess}
                clearSearch={clearSearch}
              />
            </nav>
          </div>
        </div>
        <button
          type="button"
          className="nav-close-button -ml-0.5 -mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-md text-white hover:text-gray-900 hover:text-white focus:outline-none focus:ring-white"
          onClick={toggleNavVisible}
        >
          <span className="sr-only">Open sidebar</span>
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
