import React from 'react';
import { useNavigate } from 'react-router-dom';
import store from '~/store';

export default function NewChat() {
  const { newConversation } = store.useConversation();
  const navigate = useNavigate();

  const clickHandler = () => {
    // dispatch(setInputValue(''));
    // dispatch(setQuery(''));
    newConversation();
    navigate('/chat/new');
  };

  return (
    <a
      onClick={clickHandler}
      className="mb-2 flex flex-grow flex-shrink-0 h-11 cursor-pointer items-center gap-3 rounded-md border border-white/20 px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-500/10"
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
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      {navigator.languages[0]==='zh-CN'? '新建聊天':'New chat'}
    </a>
  );
}
