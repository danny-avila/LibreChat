import React from 'react';
import TrashIcon from '../svg/TrashIcon';
import { useSWRConfig } from 'swr';
import manualSWR from '~/utils/fetchers';
import { useDispatch } from 'react-redux';
import { setNewConvo, removeAll } from '~/store/convoSlice';
import { setMessages } from '~/store/messageSlice';
import { setSubmission } from '~/store/submitSlice';

export default function ClearConvos() {
  const dispatch = useDispatch();
  const { mutate } = useSWRConfig();

  const { trigger } = manualSWR(`/api/convos/clear`, 'post', () => {
    dispatch(setMessages([]));
    dispatch(setNewConvo());
    dispatch(setSubmission({}));
    mutate(`/api/convos`);
  });

  const clickHandler = () => {
    console.log('Clearing conversations...');
    dispatch(removeAll());
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
