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
        <span>{localize('com_nav_chat_direction')}</span>
      </div>
      <label
        onClick={toggleChatDirection}
        data-testid="chatDirection"
        className="btn btn-neutral relative"
        style={{ userSelect: 'none' }}
      >
        {direction.toLowerCase()}
      </label>
    </div>
  );
};

export default ChatDirection;
