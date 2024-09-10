import React from 'react';
import { useRecoilState } from 'recoil';
import { useLocalize } from '~/hooks';
import store from '~/store';

const ChatDirection = () => {
  const [direction, setDirection] = useRecoilState(store.chatDirection);
  const localize = useLocalize();

  const toggleChatDirection = () => {
    setDirection((prev) => (prev === 'LTR' ? 'RTL' : 'LTR'));
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <span id="chat-direction-label">{localize('com_nav_chat_direction')}</span>
      </div>
      <button
        onClick={toggleChatDirection}
        data-testid="chatDirection"
        className="btn btn-neutral relative"
        aria-labelledby="chat-direction-label chat-direction-status"
        aria-pressed={direction === 'RTL'}
      >
        <span aria-hidden="true">{direction.toLowerCase()}</span>
        <span id="chat-direction-status" className="sr-only">
          {direction === 'LTR'
            ? localize('chat_direction_left_to_right')
            : localize('chat_direction_right_to_left')}
        </span>
      </button>
    </div>
  );
};

export default ChatDirection;
