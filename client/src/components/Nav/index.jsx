import React, { useState, useEffect, useRef } from "react";
import NewChat from "./NewChat";
import Spinner from "../svg/Spinner";
import Conversations from "../Conversations";
import NavLinks from "./NavLinks";
import { swr } from "~/utils/fetchers";
import { useRecoilState, useRecoilValue } from "recoil";
import store from "~/store";

const ConversationList = ({ moveTo, moveToTop, navVisible, setNavVisible }) => {
  // conversation list
  const [conversations, setConversations] = useState([]);
  // current page
  const [pageNumber, setPageNumber] = useState(1);
  // total pages
  const [pages, setPages] = useState(1);

  const [conversation, setConversation] = useRecoilState(store.conversation);
  const { conversationId } = conversation || {};

  // refreshConversationsHint is used for other components to ask refresh of Nav
  const refreshConversationsHint = useRecoilValue(
    store.refreshConversationsHint
  );

  const { data, isLoading, mutate } = swr(
    `/api/convos?pageNumber=${pageNumber}`,
    (data) => {
      const { conversations, pages } = data;

      if (pageNumber > pages) {
        setPageNumber(pages);
      } else {
        setConversations(conversations);
        setPages(pages);
      }

      // update current title
      const conversation = conversations.find(
        (element) => element.conversationId == conversationId
      );
      if (conversation) setConversation(convo);
    },
    {
      revalidateOnMount: false,
    }
  );

  const nextPage = async () => {
    moveToTop();

    setPageNumber((pageNumber) => pageNumber + 1);
    await mutate();
  };

  const previousPage = async () => {
    moveToTop();

    setPageNumber((pageNumber) => pageNumber - 1);
    await mutate();
  };

  useEffect(() => {
    mutate();
  }, [pageNumber, conversationId, refreshConversationsHint]);

  useEffect(() => {
    setNavVisible(false);
  }, [conversationId]);

  useEffect(() => {
    moveTo();
  }, [data]);

  const containerClasses =
    isLoading && pageNumber === 1
      ? "flex flex-col gap-2 text-gray-100 text-sm h-full justify-center items-center"
      : "flex flex-col gap-2 text-gray-100 text-sm";

  return (
    <div className={containerClasses}>
      {isLoading && pageNumber === 1 ? (
        <Spinner />
      ) : (
        <Conversations
          conversations={conversations}
          conversationId={conversationId}
          nextPage={nextPage}
          previousPage={previousPage}
          moveToTop={moveToTop}
          pageNumber={pageNumber}
          pages={pages}
        />
      )}
    </div>
  );
};

export default function Nav({ navVisible, setNavVisible }) {
  const containerRef = useRef(null);
  const scrollPositionRef = useRef(null);
  const [isHovering, setIsHovering] = useState(false);

  const moveToTop = () => {
    const container = containerRef.current;
    if (container) {
      scrollPositionRef.current = container.scrollTop;
    }
  };

  const moveTo = () => {
    const container = containerRef.current;

    if (container && scrollPositionRef.current !== null) {
      const { scrollHeight, clientHeight } = container;
      const maxScrollTop = scrollHeight - clientHeight;

      container.scrollTop = Math.min(maxScrollTop, scrollPositionRef.current);
    }
  };

  const toggleNavVisible = () => {
    setNavVisible((prev) => !prev);
  };

  return (
    <>
      <div
        className={
          "nav dark bg-gray-900 md:fixed md:inset-y-0 md:flex md:w-[260px] md:flex-col" +
          (navVisible ? " active" : "")
        }
      >
        <div className="flex h-full min-h-0 flex-col ">
          <div className="scrollbar-trigger flex h-full w-full flex-1 items-start border-white/20">
            <nav className="flex h-full flex-1 flex-col space-y-1 p-2">
              <NewChat />
              <div
                className={`flex-1 flex-col overflow-y-auto ${
                  isHovering ? "" : "scrollbar-transparent"
                } border-b border-white/20`}
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
                ref={containerRef}
              >
                <ConversationList
                  moveToTop={moveToTop}
                  moveTo={moveTo}
                  navVisible={navVisible}
                  setNavVisible={setNavVisible}
                />
              </div>
              <NavLinks />
            </nav>
          </div>
        </div>
        {/* Mask of mobile style */}
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
            <line x1="3" y1="6" x2="15" y2="18" />
            <line x1="3" y1="18" x2="15" y2="6" />
          </svg>
        </button>
      </div>
      <div
        className={"nav-mask" + (navVisible ? " active" : "")}
        onClick={toggleNavVisible}
      ></div>
    </>
  );
}
