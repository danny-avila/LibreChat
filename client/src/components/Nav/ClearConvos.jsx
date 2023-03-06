import React from 'react';
import TrashIcon from '../svg/TrashIcon';
import { useSWRConfig } from "swr"
import manualSWR from '~/utils/fetchers';
import { useDispatch } from 'react-redux';
import { setConversation } from '~/store/convoSlice';
import { setMessages } from '~/store/messageSlice';

export default function ClearConvos() {
  const dispatch = useDispatch();
  const { mutate } = useSWRConfig()

  const { trigger } = manualSWR(
    `http://api:3080/convos/clear`,
    'post',
    () => {
      dispatch(setMessages([]));
      dispatch(setConversation({ error: false, title: 'New chat', conversationId: null, parentMessageId: null }));
      mutate(`http://api:3080/convos`);
    }
  );

  const clickHandler = () => {
    console.log('Clearing conversations...');
    trigger({});
  };

  return (
    <a
      className="flex cursor-pointer items-center gap-3 rounded-md py-3 px-3 text-sm text-white transition-colors duration-200 hover:bg-gray-500/10"
      onClick={clickHandler}
    >
      <TrashIcon />
      Clear conversations
    </a>
  );
}
