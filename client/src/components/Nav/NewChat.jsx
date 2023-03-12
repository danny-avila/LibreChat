import React from 'react';
import { useDispatch } from 'react-redux';
import { setNewConvo } from '~/store/convoSlice';
import { setMessages } from '~/store/messageSlice';
import { setSubmission } from '~/store/submitSlice';
import { setText } from '~/store/textSlice';

export default function NewChat() {
  const dispatch = useDispatch();

  const clickHandler = () => {
    dispatch(setText(''));
    dispatch(setMessages([]));
    dispatch(setNewConvo());
    dispatch(setSubmission({}));
  };

  return (
    <a
      onClick={clickHandler}
      className="mb-2 flex flex-shrink-0 cursor-pointer items-center gap-3 rounded-md border border-white/20 py-3 px-3 text-sm text-white transition-colors duration-200 hover:bg-gray-500/10"
    >
      <svg
        stroke="currentColor"
        fill="none"
        strokeWidth="2"
        viewBox="0 0 24 24"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        height="1em"
        width="1em"
        xmlns="http://www.w3.org/2000/svg"
      >
        <line
          x1="12"
          y1="5"
          x2="12"
          y2="19"
        />
        <line
          x1="5"
          y1="12"
          x2="19"
          y2="12"
        />
      </svg>
      New chat
    </a>
  );
}
