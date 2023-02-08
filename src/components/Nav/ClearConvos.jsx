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

  const clickHandler = () => trigger({});

  return (
    <NavLink
      svg={TrashIcon}
      text="Clear conversations"
      onClick={clickHandler}
    />
  );
}
