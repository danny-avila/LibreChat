import React from 'react';
import RenameButton from './RenameButton';
import DeleteButton from './DeleteButton';
import { useSelector, useDispatch } from 'react-redux';
import { setConversation } from '~/store/convoSlice';
import { setMessages } from '~/store/messageSlice';
import { setText } from '~/store/textSlice';
import manualSWR from '~/utils/fetchers';

{
  /* <div class="flex py-3 px-3 items-center gap-3 relative rounded-md cursor-pointer hover:pr-14 break-all pr-14 bg-gray-800 hover:bg-gray-800"><svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 flex-shrink-0" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg><input type="text" class="text-sm border-none bg-transparent p-0 m-0 w-full mr-0" value="titleeeeeeeeeeeeeeeee"><div class="absolute flex right-1 z-10 text-gray-300 visible"><button class="p-1 hover:text-white"><svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><polyline points="20 6 9 17 4 12"></polyline></svg></button><button class="p-1 hover:text-white"><svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div></div> */
}

export default function Conversation({ id, parentMessageId, title = 'New conversation' }) {
  const dispatch = useDispatch();
  const { conversationId } = useSelector((state) => state.convo);
  const { trigger, isMutating } = manualSWR(`http://localhost:3050/messages/${id}`, 'get');

  const clickHandler = async () => {
    if (conversationId === id) {
      return;
    }

    dispatch(setConversation({ error: false, conversationId: id, parentMessageId }));
    const data = await trigger();
    dispatch(setMessages(data));
    dispatch(setText(''));
  };

  const aProps = {
    className:
      'animate-flash group relative flex cursor-pointer items-center gap-3 break-all rounded-md bg-gray-800 py-3 px-3 pr-14 hover:bg-gray-800'
  };

  if (conversationId !== id) {
    aProps.className =
      'group relative flex cursor-pointer items-center gap-3 break-all rounded-md py-3 px-3 hover:bg-[#2A2B32] hover:pr-4';
  }

  return (
    <div class="relative flex cursor-pointer items-center gap-3 break-all rounded-md bg-gray-800 py-3 px-3 pr-14 hover:bg-gray-800 hover:pr-14">
      <svg
        stroke="currentColor"
        fill="none"
        stroke-width="2"
        viewBox="0 0 24 24"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="h-4 w-4 flex-shrink-0"
        height="1em"
        width="1em"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      <input
        type="text"
        class="m-0 mr-0 w-full border-none bg-transparent p-0 text-sm"
        value="titleeeeeeeeeeeeeeeee"
      />
      <div class="visible absolute right-1 z-10 flex text-gray-300">
        <button class="p-1 hover:text-white">
          <svg
            stroke="currentColor"
            fill="none"
            stroke-width="2"
            viewBox="0 0 24 24"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-4 w-4"
            height="1em"
            width="1em"
            xmlns="http://www.w3.org/2000/svg"
          >
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>
        <button class="p-1 hover:text-white">
          <svg
            stroke="currentColor"
            fill="none"
            stroke-width="2"
            viewBox="0 0 24 24"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-4 w-4"
            height="1em"
            width="1em"
            xmlns="http://www.w3.org/2000/svg"
          >
            <line
              x1="18"
              y1="6"
              x2="6"
              y2="18"
            ></line>
            <line
              x1="6"
              y1="6"
              x2="18"
              y2="18"
            ></line>
          </svg>
        </button>
      </div>
    </div>
  );
}
