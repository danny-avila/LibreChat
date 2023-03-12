import React from 'react';
import TrashIcon from '../svg/TrashIcon';
import CrossIcon from '../svg/CrossIcon';
import manualSWR from '~/utils/fetchers';
import { useDispatch } from 'react-redux';
import { setNewConvo, removeConvo } from '~/store/convoSlice';
import { setMessages } from '~/store/messageSlice';
import { setSubmission } from '~/store/submitSlice';

export default function DeleteButton({ conversationId, renaming, cancelHandler, retainView }) {
  const dispatch = useDispatch();
  const { trigger } = manualSWR(
    `/api/convos/clear`,
    'post',
    () => {
      dispatch(setMessages([]));
      dispatch(removeConvo(conversationId));
      dispatch(setNewConvo());
      dispatch(setSubmission({}));
      retainView();
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
