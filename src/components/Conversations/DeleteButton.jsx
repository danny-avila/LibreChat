import React from 'react';
import TrashIcon from '../svg/TrashIcon';
import manualSWR from '~/utils/fetchers';
import { useDispatch } from 'react-redux';
import { setConversation } from '~/store/convoSlice';
import { setMessages } from '~/store/messageSlice';

export default function DeleteButton({ conversationId }) {
  const dispatch = useDispatch();
  const { trigger, isMutating } = manualSWR(
    'http://localhost:3050/clear_convos',
    'post',
    () => {
      dispatch(setMessages([]));
      dispatch(setConversation({ conversationId: null, parentMessageId: null }));
    }
  );

  const clickHandler = () => trigger({ conversationId });

  return (
    <button
      className="p-1 hover:text-white"
      onClick={clickHandler}
    >
      <TrashIcon />
    </button>
  );
}
