import React from 'react';
import NewChat from './NewChat';
import Conversations from './Conversations';
import NavLinks from './NavLinks';

export default function Nav({ conversations, convoHandler }) {
  return (
    <div className="dark hidden bg-gray-900 md:fixed md:inset-y-0 md:flex md:w-[260px] md:flex-col">
      <div className="flex h-full min-h-0 flex-col ">
        <div className="scrollbar-trigger flex h-full w-full flex-1 items-start border-white/20">
          <nav className="flex h-full flex-1 flex-col space-y-1 p-2">
            <NewChat />
            <Conversations conversations={conversations} convoHandler={convoHandler}/>
            <NavLinks />
          </nav>
        </div>
      </div>
    </div>
  );
}
