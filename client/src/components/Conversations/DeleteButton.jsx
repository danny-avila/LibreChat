import React from 'react';
import TrashIcon from '../svg/TrashIcon';
import CrossIcon from '../svg/CrossIcon';
import manualSWR from '~/utils/fetchers';
import { useDispatch } from 'react-redux';
import { setNewConvo, removeConvo } from '~/store/convoSlice';
import { setMessages } from '~/store/messageSlice';

export default function DeleteButton({ conversationId, renaming, cancelHandler }) {
  const dispatch = useDispatch();
  const { trigger } = manualSWR(
    `http://localhost:3080/api/convos/clear`,
    'post',
    () => {
      dispatch(setMessages([]));
      dispatch(removeConvo(conversationId));
      // dispatch(setConversation({ title: 'New chat', conversationId: null, parentMessageId: null }));
      dispatch(setNewConvo());
    }
  );

  const clickHandler = () => trigger({ conversationId });
  const handler = renaming ? cancelHandler : clickHandler;

  return (
    <button
      className="p-1 hover:text-white"
      onClick={handler}
    >
      { renaming ? <CrossIcon/> : <TrashIcon />}
    </button>
  );
}
