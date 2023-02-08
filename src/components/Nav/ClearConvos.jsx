import React from 'react';
import NavLink from './NavLink';
import TrashIcon from '../svg/TrashIcon';
import manualSWR from '~/utils/fetchers';
import { useDispatch } from 'react-redux';
import { setConversation } from '~/store/convoSlice';
import { setMessages } from '~/store/messageSlice';

export default function ClearConvos() {
  const dispatch = useDispatch();

  const { trigger, isMutating } = manualSWR(
    'http://localhost:3050/clear_convos',
    'post',
    () => {
      dispatch(setMessages([]));
      dispatch(setConversation({ conversationId: null, parentMessageId: null }));
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
